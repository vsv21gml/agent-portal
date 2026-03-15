import { BadGatewayException, ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";
import { UserEntity } from "../auth/entities/user.entity";
import { AgentDeploymentEntity } from "../agents/entities/agent-deployment.entity";
import { ProjectEntity } from "../projects/entities/project.entity";
import { CreateModelAccessRequestDto } from "./dto/create-model-access-request.dto";
import { IssueLlmKeyDto } from "./dto/issue-llm-key.dto";
import { ReviewModelAccessRequestDto } from "./dto/review-model-access-request.dto";
import { LiteLlmCatalogModelEntity } from "./entities/litellm-catalog-model.entity";
import {
  LiteLlmModelAccessRequestEntity,
  LiteLlmModelAccessRequestStatus,
  LiteLlmModelAccessRequestType,
} from "./entities/litellm-model-access-request.entity";
import { LiteLlmKeyEntity } from "./entities/litellm-key.entity";
import { LiteLlmModelEntity } from "./entities/litellm-model.entity";
import { LiteLlmTeamEntity } from "./entities/litellm-team.entity";
import { LiteLlmUserKeyEntity } from "./entities/litellm-user-key.entity";

type LiteLlmKeyResponse = {
  user_id?: string | null;
  key?: string | null;
  token?: string | null;
  token_id?: string | null;
};

type LiteLlmUserInfo = {
  user_id?: string | null;
  max_budget?: number | null;
  spend?: number | null;
  budget_duration?: string | null;
  budget_reset_at?: string | null;
};

type LiteLlmKeyInfo = {
  max_budget?: number | null;
  soft_budget?: number | null;
  spend?: number | null;
  budget_duration?: string | null;
  budget_reset_at?: string | null;
};

type LiteLlmSpendLog = {
  spend?: number | null;
  total_tokens?: number | null;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
};

type LiteLlmRemoteModelsResponse = {
  data?: Array<{
    id?: string | null;
    model_name?: string | null;
  }>;
};

type ModelAccessRequestView = {
  id: string;
  ownerUserId: string;
  userEmail: string;
  userDisplayName: string;
  requestType: LiteLlmModelAccessRequestType;
  projectId: string | null;
  projectName: string | null;
  agentId: string | null;
  agentName: string | null;
  modelName: string;
  status: LiteLlmModelAccessRequestStatus;
  reviewNote: string | null;
  reviewerUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class LlmService {
  private static readonly TEAM_MAX_BUDGET_USD = 200;
  private static readonly TEAM_BUDGET_DURATION = "30d";
  private static readonly USER_MAX_BUDGET_USD = 100;
  private static readonly USER_BUDGET_DURATION = "1mo";

  private readonly logger = new Logger(LlmService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(LiteLlmTeamEntity)
    private readonly teamRepository: Repository<LiteLlmTeamEntity>,
    @InjectRepository(LiteLlmKeyEntity)
    private readonly keyRepository: Repository<LiteLlmKeyEntity>,
    @InjectRepository(LiteLlmModelEntity)
    private readonly modelRepository: Repository<LiteLlmModelEntity>,
    @InjectRepository(LiteLlmUserKeyEntity)
    private readonly userKeyRepository: Repository<LiteLlmUserKeyEntity>,
    @InjectRepository(LiteLlmCatalogModelEntity)
    private readonly catalogModelRepository: Repository<LiteLlmCatalogModelEntity>,
    @InjectRepository(LiteLlmModelAccessRequestEntity)
    private readonly modelAccessRequestRepository: Repository<LiteLlmModelAccessRequestEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projectRepository: Repository<ProjectEntity>,
    @InjectRepository(AgentDeploymentEntity)
    private readonly agentRepository: Repository<AgentDeploymentEntity>,
  ) {}

  async ensureTeam(projectId: string): Promise<LiteLlmTeamEntity> {
    const existing = await this.teamRepository.findOne({ where: { projectId } });
    if (existing) {
      return existing;
    }

    const team = await this.teamRepository.save(
      this.teamRepository.create({
        projectId,
        teamName: `team-${projectId}`,
      }),
    );
    await this.createRemoteTeamIfConfigured(team.teamName);

    await this.modelRepository.save(
      this.modelRepository.create({
        teamId: team.id,
        modelName: "gpt-4.1-mini",
      }),
    );
    return team;
  }

  async issueKey(projectId: string, ownerUserId: string, dto: IssueLlmKeyDto): Promise<LiteLlmKeyEntity> {
    const team = await this.teamRepository.findOneByOrFail({ projectId });
    const remoteKey = await this.issueRemoteKeyIfConfigured(team.teamName, dto.keyAlias);
    return this.keyRepository.save(
      this.keyRepository.create({
        projectId,
        teamId: team.id,
        ownerUserId,
        keyAlias: dto.keyAlias,
        remoteKeyId: remoteKey?.token_id ?? null,
        apiKey: remoteKey?.key ?? remoteKey?.token ?? null,
      }),
    );
  }

  async ensureProjectVirtualKey(projectId: string, ownerUserId: string, keyAlias: string): Promise<LiteLlmKeyEntity | null> {
    const normalizedAlias = keyAlias.trim();
    if (!normalizedAlias) {
      return null;
    }

    const existing = await this.keyRepository.findOne({
      where: { projectId, ownerUserId, keyAlias: normalizedAlias },
      order: { createdAt: "DESC" },
    });
    if (existing?.apiKey) {
      return existing;
    }

    const team = await this.ensureTeam(projectId);
    const remoteKey = await this.issueRemoteKeyIfConfigured(team.teamName, normalizedAlias);
    const row = existing ?? this.keyRepository.create({ projectId, teamId: team.id, ownerUserId, keyAlias: normalizedAlias });
    row.teamId = team.id;
    row.remoteKeyId = remoteKey?.token_id ?? row.remoteKeyId ?? null;
    row.apiKey = remoteKey?.key ?? remoteKey?.token ?? row.apiKey ?? null;
    return this.keyRepository.save(row);
  }

  listProjectKeys(projectId: string): Promise<LiteLlmKeyEntity[]> {
    return this.keyRepository.find({ where: { projectId }, order: { createdAt: "DESC" } });
  }

  async listAvailableModels(projectId: string): Promise<LiteLlmModelEntity[]> {
    const team = await this.teamRepository.findOneByOrFail({ projectId });
    const remoteModels = await this.fetchRemoteModelsIfConfigured(team.teamName);
    if (remoteModels.length > 0) {
      await this.modelRepository.delete({ teamId: team.id });
      await this.modelRepository.save(
        remoteModels.map((modelName) =>
          this.modelRepository.create({
            teamId: team.id,
            modelName,
          }),
        ),
      );
    }
    return this.modelRepository.find({ where: { teamId: team.id } });
  }

  async ensureUserVirtualKey(ownerUserId: string, userEmail: string, displayName?: string): Promise<LiteLlmUserKeyEntity | null> {
    const baseUrl = this.getBaseUrl();
    const masterKey = this.getMasterKey();
    if (!baseUrl || !masterKey || !userEmail) {
      return null;
    }

    const existing = await this.userKeyRepository.findOne({ where: { ownerUserId } });
    if (existing?.apiKey) {
      if (existing.userEmail !== userEmail || existing.keyAlias !== userEmail) {
        existing.userEmail = userEmail;
        existing.keyAlias = userEmail;
        const saved = await this.userKeyRepository.save(existing);
        await this.syncUserModelAccess(ownerUserId);
        return saved;
      }
      await this.syncUserModelAccess(ownerUserId);
      return existing;
    }

    const created = await this.createRemoteUserWithKey(ownerUserId, userEmail, displayName);
    const ensured = created ?? (await this.issueRemoteUserKey(ownerUserId, userEmail));
    if (!ensured?.keyValue) {
      throw new BadGatewayException("Failed to provision LiteLLM user key");
    }

    const row = existing ?? this.userKeyRepository.create({ ownerUserId });
    row.userEmail = userEmail;
    row.keyAlias = userEmail;
    row.remoteUserId = ensured.remoteUserId;
    row.remoteKeyId = ensured.remoteKeyId;
    row.apiKey = ensured.keyValue;
    row.maxBudgetUsd = LlmService.USER_MAX_BUDGET_USD;
    row.budgetDuration = LlmService.USER_BUDGET_DURATION;
    const saved = await this.userKeyRepository.save(row);
    await this.syncUserModelAccess(ownerUserId);
    return saved;
  }

  getUserVirtualKey(ownerUserId: string): Promise<LiteLlmUserKeyEntity | null> {
    return this.userKeyRepository.findOne({ where: { ownerUserId } });
  }

  async getCurrentUserUsage(ownerUserId: string): Promise<{
    currentMonthSpendUsd: number;
    currentMonthTotalTokens: number;
    currentMonthPromptTokens: number;
    currentMonthCompletionTokens: number;
    currentMonthBudgetUsd: number | null;
    budgetDuration: string | null;
    budgetResetAt: string | null;
  }> {
    const userKey = await this.userKeyRepository.findOne({ where: { ownerUserId } });
    if (!userKey?.apiKey) {
      return {
        currentMonthSpendUsd: 0,
        currentMonthTotalTokens: 0,
        currentMonthPromptTokens: 0,
        currentMonthCompletionTokens: 0,
        currentMonthBudgetUsd: userKey?.maxBudgetUsd ?? null,
        budgetDuration: userKey?.budgetDuration ?? null,
        budgetResetAt: null,
      };
    }

    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const [keyInfo, userInfo, spendLogs] = await Promise.all([
      this.fetchKeyInfo(userKey.apiKey),
      this.fetchUserInfo(userKey.remoteUserId ?? ownerUserId),
      this.fetchCurrentMonthSpendLogs(userKey.apiKey, monthStart, now),
    ]);

    const totals = spendLogs.reduce(
      (acc, row) => {
        acc.currentMonthSpendUsd += this.toNumber(row.spend);
        acc.currentMonthTotalTokens += this.toNumber(row.total_tokens);
        acc.currentMonthPromptTokens += this.toNumber(row.prompt_tokens);
        acc.currentMonthCompletionTokens += this.toNumber(row.completion_tokens);
        return acc;
      },
      {
        currentMonthSpendUsd: 0,
        currentMonthTotalTokens: 0,
        currentMonthPromptTokens: 0,
        currentMonthCompletionTokens: 0,
      },
    );

    return {
      ...totals,
      currentMonthSpendUsd:
        totals.currentMonthSpendUsd > 0
          ? totals.currentMonthSpendUsd
          : this.toNumber(keyInfo?.spend) || this.toNumber(userInfo?.spend),
      currentMonthBudgetUsd:
        keyInfo?.max_budget ?? keyInfo?.soft_budget ?? userInfo?.max_budget ?? userKey.maxBudgetUsd ?? null,
      budgetDuration: keyInfo?.budget_duration ?? userInfo?.budget_duration ?? userKey.budgetDuration ?? null,
      budgetResetAt: keyInfo?.budget_reset_at ?? userInfo?.budget_reset_at ?? null,
    };
  }

  async getApiKeySpend(apiKey: string | null | undefined): Promise<number> {
    const normalizedKey = apiKey?.trim() ?? "";
    if (!normalizedKey) {
      return 0;
    }

    const keyInfo = await this.fetchKeyInfo(normalizedKey);
    return this.toNumber(keyInfo?.spend);
  }

  async getCurrentUserAccess(ownerUserId: string, userEmail: string, displayName?: string) {
    const userKey = await this.ensureUserVirtualKey(ownerUserId, userEmail, displayName);
    const catalogModels = await this.listCatalogModels();
    const requests = await this.modelAccessRequestRepository.find({
      where: { ownerUserId, requestType: "personal" },
      order: { createdAt: "DESC" },
    });
    const allowedModelNames = await this.listAllowedModelNames(ownerUserId);
    const latestRequestByModel = new Map<string, LiteLlmModelAccessRequestEntity>();
    for (const request of requests) {
      if (!latestRequestByModel.has(request.modelName)) {
        latestRequestByModel.set(request.modelName, request);
      }
    }

    return {
      litellmBaseUrl: this.getBaseUrl(),
      personalKey: userKey?.apiKey ?? null,
      availableModels: catalogModels
        .filter((model) => allowedModelNames.includes(model.modelName))
        .map((model) => ({
          modelName: model.modelName,
          isDefault: model.isDefault,
          source: model.isDefault ? "default" : "approved",
        })),
      requestableModels: catalogModels
        .filter((model) => !allowedModelNames.includes(model.modelName))
        .map((model) => ({
          modelName: model.modelName,
          isDefault: model.isDefault,
          requestStatus: latestRequestByModel.get(model.modelName)?.status ?? "none",
        })),
      requests: requests.map((request) => ({
        id: request.id,
        modelName: request.modelName,
        requestType: request.requestType,
        status: request.status,
        reviewNote: request.reviewNote,
        createdAt: request.createdAt,
        updatedAt: request.updatedAt,
      })),
    };
  }

  async createModelAccessRequest(ownerUserId: string, dto: CreateModelAccessRequestDto) {
    const modelName = dto.modelName.trim();
    const requestType = dto.requestType ?? "personal";
    if (!modelName) {
      throw new ConflictException("Model name is required");
    }

    await this.syncCatalogModelsFromRemote();
    const catalogModel = await this.catalogModelRepository.findOne({ where: { modelName } });
    if (!catalogModel) {
      throw new NotFoundException("Model not found");
    }

    const allowedModelNames = requestType === "personal" ? await this.listAllowedModelNames(ownerUserId) : [];
    if (requestType === "personal" && allowedModelNames.includes(modelName)) {
      throw new ConflictException("Model is already available");
    }

    const existing = await this.modelAccessRequestRepository.findOne({
      where: {
        ownerUserId,
        modelName,
        requestType,
        projectId: dto.projectId ?? IsNull(),
        agentId: dto.agentId ?? IsNull(),
      },
      order: { updatedAt: "DESC" },
    });
    if (existing) {
      if (existing.status === "pending") {
        return existing;
      }
      existing.status = "pending";
      existing.reviewerUserId = null;
      existing.reviewNote = null;
      return this.modelAccessRequestRepository.save(existing);
    }

    return this.modelAccessRequestRepository.save(
      this.modelAccessRequestRepository.create({
        ownerUserId,
        modelName,
        requestType,
        projectId: dto.projectId ?? null,
        agentId: dto.agentId ?? null,
        status: "pending",
      }),
    );
  }

  async listCatalogModels(): Promise<LiteLlmCatalogModelEntity[]> {
    await this.syncCatalogModelsFromRemote();
    return this.catalogModelRepository.find({
      order: {
        isDefault: "DESC",
        modelName: "ASC",
      },
    });
  }

  async getCatalogModel(modelName: string): Promise<LiteLlmCatalogModelEntity> {
    await this.syncCatalogModelsFromRemote();
    const normalizedModelName = modelName.trim();
    const model = await this.catalogModelRepository.findOne({ where: { modelName: normalizedModelName } });
    if (!model) {
      throw new NotFoundException("Model not found");
    }
    return model;
  }

  async configureProjectKeyModels(apiKey: string, modelNames: string[]): Promise<void> {
    if (!apiKey) {
      return;
    }

    const normalizedModels = Array.from(new Set(modelNames.map((modelName) => modelName.trim()).filter(Boolean)));
    try {
      await this.remoteFetch("/key/update", {
        method: "POST",
        body: JSON.stringify({
          key: apiKey,
          models: normalizedModels,
        }),
      });
    } catch (error) {
      this.logger.warn(
        `Failed to update LiteLLM project key models: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async setDefaultModel(modelName: string, isDefault: boolean): Promise<LiteLlmCatalogModelEntity> {
    const normalizedModelName = modelName.trim();
    if (!normalizedModelName) {
      throw new ConflictException("Model name is required");
    }

    let catalogModel = await this.catalogModelRepository.findOne({ where: { modelName: normalizedModelName } });
    if (!catalogModel) {
      catalogModel = this.catalogModelRepository.create({
        modelName: normalizedModelName,
        isDefault,
      });
    } else {
      catalogModel.isDefault = isDefault;
    }

    const saved = await this.catalogModelRepository.save(catalogModel);
    await this.syncAllUserModelAccess();
    return saved;
  }

  async listModelAccessRequestsForAdmin(): Promise<ModelAccessRequestView[]> {
    const [requests, users, projects, agents] = await Promise.all([
      this.modelAccessRequestRepository.find({ order: { createdAt: "DESC" } }),
      this.userRepository.find(),
      this.projectRepository.find(),
        this.agentRepository.find({ where: { deleteYn: "N" } }),
    ]);

    const userMap = new Map(users.map((user) => [user.id, user]));
    const projectMap = new Map(projects.map((project) => [project.id, project]));
    const agentMap = new Map(agents.map((agent) => [agent.id, agent]));
    return requests.map((request) => {
      const user = userMap.get(request.ownerUserId);
      const project = request.projectId ? projectMap.get(request.projectId) : null;
      const agent = request.agentId ? agentMap.get(request.agentId) : null;
      return {
        id: request.id,
        ownerUserId: request.ownerUserId,
        userEmail: user?.email ?? request.ownerUserId,
        userDisplayName: user?.displayName ?? request.ownerUserId,
        requestType: request.requestType,
        projectId: request.projectId,
        projectName: project?.name ?? null,
        agentId: request.agentId,
        agentName: agent?.agentName ?? null,
        modelName: request.modelName,
        status: request.status,
        reviewNote: request.reviewNote,
        reviewerUserId: request.reviewerUserId,
        createdAt: request.createdAt,
        updatedAt: request.updatedAt,
      };
    });
  }

  async approveModelAccessRequest(requestId: string, reviewerUserId: string, dto?: ReviewModelAccessRequestDto) {
    return this.reviewModelAccessRequest(requestId, reviewerUserId, "approved", dto?.reviewNote);
  }

  async rejectModelAccessRequest(requestId: string, reviewerUserId: string, dto?: ReviewModelAccessRequestDto) {
    return this.reviewModelAccessRequest(requestId, reviewerUserId, "rejected", dto?.reviewNote);
  }

  private async reviewModelAccessRequest(
    requestId: string,
    reviewerUserId: string,
    status: LiteLlmModelAccessRequestStatus,
    reviewNote?: string,
  ) {
    const request = await this.modelAccessRequestRepository.findOne({ where: { id: requestId } });
    if (!request) {
      throw new NotFoundException("Model access request not found");
    }

    request.status = status;
    request.reviewerUserId = reviewerUserId;
    request.reviewNote = reviewNote?.trim() || null;
    const saved = await this.modelAccessRequestRepository.save(request);
    await this.syncUserModelAccess(request.ownerUserId);
    return saved;
  }

  private async createRemoteTeamIfConfigured(teamName: string): Promise<void> {
    const baseUrl = this.getBaseUrl();
    const masterKey = this.getMasterKey();
    if (!baseUrl || !masterKey) {
      return;
    }
    await fetch(`${baseUrl}/team/new`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${masterKey}`,
      },
      body: JSON.stringify({
        team_alias: teamName,
        max_budget: LlmService.TEAM_MAX_BUDGET_USD,
        budget_duration: LlmService.TEAM_BUDGET_DURATION,
        models: [],
      }),
    });
  }

  private async issueRemoteKeyIfConfigured(teamName: string, alias: string): Promise<LiteLlmKeyResponse | null> {
    const baseUrl = this.getBaseUrl();
    const masterKey = this.getMasterKey();
    if (!baseUrl || !masterKey) {
      return null;
    }
    const response = await fetch(`${baseUrl}/key/generate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${masterKey}`,
      },
      body: JSON.stringify({ key_alias: alias, team_id: teamName }),
    });
    if (!response.ok) {
      throw new BadGatewayException(`Failed to issue LiteLLM key (${response.status})`);
    }
    return (await response.json()) as LiteLlmKeyResponse;
  }

  private async fetchRemoteModelsIfConfigured(teamName: string): Promise<string[]> {
    const baseUrl = this.getBaseUrl();
    const masterKey = this.getMasterKey();
    if (!baseUrl || !masterKey) {
      return [];
    }
    const response = await fetch(`${baseUrl}/team/info?team_id=${encodeURIComponent(teamName)}`, {
      headers: { Authorization: `Bearer ${masterKey}` },
    });
    if (!response.ok) {
      return [];
    }
    const data = (await response.json()) as { models?: string[] };
    return data.models ?? [];
  }

  private async syncCatalogModelsFromRemote(): Promise<void> {
    const remoteModels = await this.fetchRemoteCatalogModelsIfConfigured();
    if (remoteModels.length === 0) {
      return;
    }

    const existingModels = await this.catalogModelRepository.find();
    const existingByName = new Map(existingModels.map((model) => [model.modelName, model]));
    const rowsToSave = remoteModels
      .filter((modelName) => !existingByName.has(modelName))
      .map((modelName) =>
        this.catalogModelRepository.create({
          modelName,
          isDefault: false,
        }),
      );

    if (rowsToSave.length > 0) {
      await this.catalogModelRepository.save(rowsToSave);
    }
  }

  private async fetchRemoteCatalogModelsIfConfigured(): Promise<string[]> {
    const baseUrl = this.getBaseUrl();
    const masterKey = this.getMasterKey();
    if (!baseUrl || !masterKey) {
      return [];
    }

    try {
      const endpoints = ["/v1/models", "/models", "/model/info"];
      for (const endpoint of endpoints) {
        const response = await fetch(`${baseUrl}${endpoint}`, {
          headers: {
            Authorization: `Bearer ${masterKey}`,
          },
        });
        if (!response.ok) {
          this.logger.warn(`LiteLLM model catalog endpoint failed endpoint=${endpoint} status=${response.status}`);
          continue;
        }

        const payload = await response.json();
        const modelNames = this.parseRemoteCatalogModelsResponse(payload);
        if (modelNames.length > 0) {
          this.logger.log(`Fetched ${modelNames.length} LiteLLM catalog models from ${endpoint}`);
          return modelNames;
        }
        this.logger.warn(`LiteLLM model catalog endpoint returned no models endpoint=${endpoint}`);
      }

      this.logger.warn("LiteLLM model catalog sync finished with no models from all endpoints");
      return [];
    } catch (error) {
      this.logger.warn(`Failed to sync LiteLLM catalog models: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  private parseRemoteCatalogModelsResponse(payload: unknown): string[] {
    if (Array.isArray(payload)) {
      return this.normalizeModelNames(payload);
    }

    if (payload && typeof payload === "object") {
      const record = payload as Record<string, unknown>;
      if (Array.isArray(record.data)) {
        return this.normalizeModelNames(record.data);
      }
      if (Array.isArray(record.models)) {
        return this.normalizeModelNames(record.models);
      }
      if (record.data && typeof record.data === "object") {
        const nestedData = record.data as Record<string, unknown>;
        if (Array.isArray(nestedData.models)) {
          return this.normalizeModelNames(nestedData.models);
        }
      }
    }

    return [];
  }

  private normalizeModelNames(rows: unknown[]): string[] {
    return Array.from(
      new Set(
        rows
          .map((row) => {
            if (typeof row === "string") {
              return row;
            }
            if (row && typeof row === "object") {
              const model = row as Record<string, unknown>;
              return (model.id ?? model.model_name ?? model.model ?? model.name ?? "") as string;
            }
            return "";
          })
          .map((modelName) => modelName.trim())
          .filter((modelName) => modelName.length > 0),
      ),
    );
  }

  private async listAllowedModelNames(ownerUserId: string): Promise<string[]> {
    const [defaultModels, approvedRequests] = await Promise.all([
      this.catalogModelRepository.find({ where: { isDefault: true }, order: { modelName: "ASC" } }),
      this.modelAccessRequestRepository.find({
        where: { ownerUserId, status: "approved", requestType: "personal" },
        order: { modelName: "ASC" },
      }),
    ]);

    return Array.from(new Set([...defaultModels.map((model) => model.modelName), ...approvedRequests.map((request) => request.modelName)]));
  }

  private async syncAllUserModelAccess(): Promise<void> {
    const userKeys = await this.userKeyRepository.find();
    await Promise.all(userKeys.map((userKey) => this.syncUserModelAccess(userKey.ownerUserId)));
  }

  private async syncUserModelAccess(ownerUserId: string): Promise<void> {
    const userKey = await this.userKeyRepository.findOne({ where: { ownerUserId } });
    if (!userKey?.apiKey) {
      return;
    }

    const allowedModels = await this.listAllowedModelNames(ownerUserId);
    await this.updateRemoteUserModels(userKey, allowedModels);
  }

  private async updateRemoteUserModels(userKey: LiteLlmUserKeyEntity, allowedModels: string[]): Promise<void> {
    const payload = { models: allowedModels };
    try {
      await this.remoteFetch("/key/update", {
        method: "POST",
        body: JSON.stringify({
          ...payload,
          key: userKey.apiKey,
        }),
      });
    } catch (error) {
      this.logger.warn(`Failed to update LiteLLM key models for ${userKey.ownerUserId}: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (!userKey.remoteUserId) {
      return;
    }

    try {
      await this.remoteFetch("/user/update", {
        method: "POST",
        body: JSON.stringify({
          user_id: userKey.remoteUserId,
          ...payload,
        }),
      });
    } catch (error) {
      this.logger.warn(
        `Failed to update LiteLLM user models for ${userKey.ownerUserId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async fetchUserInfo(userId: string): Promise<LiteLlmUserInfo | null> {
    if (!userId) {
      return null;
    }

    const response = await this.remoteFetch(`/user/info?user_id=${encodeURIComponent(userId)}`, {
      method: "GET",
    });
    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as LiteLlmUserInfo & { user_info?: LiteLlmUserInfo | null };
    return data.user_info ?? data;
  }

  private async fetchKeyInfo(apiKey: string): Promise<LiteLlmKeyInfo | null> {
    const response = await this.remoteFetch(`/key/info?key=${encodeURIComponent(apiKey)}`, {
      method: "GET",
    });
    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as LiteLlmKeyInfo & { info?: LiteLlmKeyInfo | null };
    return data.info ?? data;
  }

  private async fetchCurrentMonthSpendLogs(apiKey: string, startDate: Date, endDate: Date): Promise<LiteLlmSpendLog[]> {
    const query = new URLSearchParams({
      api_key: apiKey,
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
      summarize: "false",
    });
    const response = await this.remoteFetch(`/spend/logs?${query.toString()}`, {
      method: "GET",
    });
    if (!response.ok) {
      return [];
    }

    return this.parseSpendLogsResponse(await response.json());
  }

  private parseSpendLogsResponse(payload: unknown): LiteLlmSpendLog[] {
    if (Array.isArray(payload)) {
      return payload as LiteLlmSpendLog[];
    }

    if (payload && typeof payload === "object") {
      const record = payload as Record<string, unknown>;
      if (Array.isArray(record.data)) {
        return record.data as LiteLlmSpendLog[];
      }
      if (Array.isArray(record.logs)) {
        return record.logs as LiteLlmSpendLog[];
      }
      if (Array.isArray(record.spend_logs)) {
        return record.spend_logs as LiteLlmSpendLog[];
      }
    }

    return [];
  }

  private toNumber(value: unknown): number {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }

  private async createRemoteUserWithKey(
    ownerUserId: string,
    userEmail: string,
    displayName?: string,
  ): Promise<{ remoteUserId: string | null; remoteKeyId: string | null; keyValue: string | null } | null> {
    const response = await this.remoteFetch("/user/new", {
      method: "POST",
      body: JSON.stringify({
        user_id: ownerUserId,
        user_email: userEmail,
        user_alias: displayName?.trim() || userEmail,
        user_role: "internal_user",
        key_alias: userEmail,
        max_budget: LlmService.USER_MAX_BUDGET_USD,
        budget_duration: LlmService.USER_BUDGET_DURATION,
        models: [],
        auto_create_key: true,
      }),
    });

    if (response.ok) {
      const data = (await response.json()) as LiteLlmKeyResponse;
      return {
        remoteUserId: data.user_id ?? ownerUserId,
        remoteKeyId: data.token_id ?? null,
        keyValue: data.key ?? data.token ?? null,
      };
    }

    return null;
  }

  private async issueRemoteUserKey(
    ownerUserId: string,
    userEmail: string,
  ): Promise<{ remoteUserId: string | null; remoteKeyId: string | null; keyValue: string | null } | null> {
    const response = await this.remoteFetch("/key/generate", {
      method: "POST",
      body: JSON.stringify({
        user_id: ownerUserId,
        key_alias: userEmail,
        max_budget: LlmService.USER_MAX_BUDGET_USD,
        budget_duration: LlmService.USER_BUDGET_DURATION,
        models: [],
      }),
    });
    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as LiteLlmKeyResponse;
    return {
      remoteUserId: data.user_id ?? ownerUserId,
      remoteKeyId: data.token_id ?? null,
      keyValue: data.key ?? data.token ?? null,
    };
  }

  private async remoteFetch(path: string, init: RequestInit): Promise<Response> {
    const baseUrl = this.getBaseUrl();
    const masterKey = this.getMasterKey();
    if (!baseUrl || !masterKey) {
      throw new BadGatewayException("LiteLLM is not configured");
    }

    return fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${masterKey}`,
        ...(init.headers ?? {}),
      },
    });
  }

  private getBaseUrl(): string {
    return this.configService.get<string>("LITELLM_BASE_URL")?.trim().replace(/\/+$/, "") ?? "";
  }

  private getMasterKey(): string {
    return this.configService.get<string>("LITELLM_MASTER_KEY")?.trim() ?? "";
  }
}
