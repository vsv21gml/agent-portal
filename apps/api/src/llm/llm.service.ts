import { ConfigService } from "@nestjs/config";
import { BadGatewayException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { IssueLlmKeyDto } from "./dto/issue-llm-key.dto";
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

@Injectable()
export class LlmService {
  private static readonly TEAM_MAX_BUDGET_USD = 200;
  private static readonly TEAM_BUDGET_DURATION = "30d";
  private static readonly USER_MAX_BUDGET_USD = 100;
  private static readonly USER_BUDGET_DURATION = "1mo";

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
    await this.issueRemoteKeyIfConfigured(team.teamName, dto.keyAlias);
    return this.keyRepository.save(
      this.keyRepository.create({
        projectId,
        teamId: team.id,
        ownerUserId,
        keyAlias: dto.keyAlias,
      }),
    );
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
        return this.userKeyRepository.save(existing);
      }
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
    return this.userKeyRepository.save(row);
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

  private async issueRemoteKeyIfConfigured(teamName: string, alias: string): Promise<void> {
    const baseUrl = this.getBaseUrl();
    const masterKey = this.getMasterKey();
    if (!baseUrl || !masterKey) {
      return;
    }
    await fetch(`${baseUrl}/key/generate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${masterKey}`,
      },
      body: JSON.stringify({ key_alias: alias, team_id: teamName }),
    });
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
