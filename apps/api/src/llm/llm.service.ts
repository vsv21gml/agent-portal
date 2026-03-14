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

@Injectable()
export class LlmService {
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
      body: JSON.stringify({ team_alias: teamName }),
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
