import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { IssueLlmKeyDto } from "./dto/issue-llm-key.dto";
import { LiteLlmKeyEntity } from "./entities/litellm-key.entity";
import { LiteLlmModelEntity } from "./entities/litellm-model.entity";
import { LiteLlmTeamEntity } from "./entities/litellm-team.entity";

@Injectable()
export class LlmService {
  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(LiteLlmTeamEntity)
    private readonly teamRepository: Repository<LiteLlmTeamEntity>,
    @InjectRepository(LiteLlmKeyEntity)
    private readonly keyRepository: Repository<LiteLlmKeyEntity>,
    @InjectRepository(LiteLlmModelEntity)
    private readonly modelRepository: Repository<LiteLlmModelEntity>,
  ) {}

  async ensureTeam(projectId: string, projectSlug: string): Promise<LiteLlmTeamEntity> {
    const existing = await this.teamRepository.findOne({ where: { projectId } });
    if (existing) {
      return existing;
    }

    const team = await this.teamRepository.save(
      this.teamRepository.create({
        projectId,
        teamName: `team-${projectSlug}`,
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

  private async createRemoteTeamIfConfigured(teamName: string): Promise<void> {
    const baseUrl = this.configService.get<string>("LITELLM_BASE_URL");
    const masterKey = this.configService.get<string>("LITELLM_MASTER_KEY");
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
    const baseUrl = this.configService.get<string>("LITELLM_BASE_URL");
    const masterKey = this.configService.get<string>("LITELLM_MASTER_KEY");
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
    const baseUrl = this.configService.get<string>("LITELLM_BASE_URL");
    const masterKey = this.configService.get<string>("LITELLM_MASTER_KEY");
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
}
