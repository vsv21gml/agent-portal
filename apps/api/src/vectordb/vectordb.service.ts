import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ProjectsService } from "../projects/projects.service";
import { IssueVectorKeyDto } from "./dto/issue-vector-key.dto";
import { VectorKeyEntity } from "./entities/vector-key.entity";

type IssuedVectorKey = {
  id: string;
  projectId: string;
  ownerUserId: string;
  keyAlias: string;
  indexName: string;
  remoteKeyId: string | null;
  createdAt: Date;
  apiKey: string | null;
};

@Injectable()
export class VectorDbService {
  constructor(
    private readonly configService: ConfigService,
    private readonly projectsService: ProjectsService,
    @InjectRepository(VectorKeyEntity)
    private readonly vectorKeyRepository: Repository<VectorKeyEntity>,
  ) {}

  async issueKey(projectId: string, ownerUserId: string, dto: IssueVectorKeyDto): Promise<IssuedVectorKey> {
    const indexName = this.buildIndexName(projectId);

    await this.ensureRemoteIndexIfConfigured(indexName);
    const remoteKey = await this.issueRemoteKeyIfConfigured(indexName, dto.keyAlias);

    const saved = await this.vectorKeyRepository.save(
      this.vectorKeyRepository.create({
        projectId,
        ownerUserId,
        keyAlias: dto.keyAlias,
        indexName,
        remoteKeyId: remoteKey?.id ?? null,
      }),
    );

    return {
      id: saved.id,
      projectId: saved.projectId,
      ownerUserId: saved.ownerUserId,
      keyAlias: saved.keyAlias,
      indexName: saved.indexName,
      remoteKeyId: saved.remoteKeyId,
      createdAt: saved.createdAt,
      apiKey: remoteKey?.apiKey ?? null,
    };
  }

  listProjectKeys(projectId: string): Promise<VectorKeyEntity[]> {
    return this.vectorKeyRepository.find({ where: { projectId }, order: { createdAt: "DESC" } });
  }
  private buildIndexName(projectId: string): string {
    const prefix = this.configService.get<string>("OPENSEARCH_INDEX_PREFIX", "project");
    const base = `${prefix}-${projectId}`;
    return base
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  private getOpenSearchConfig(): { baseUrl: string; username: string; password: string } | null {
    const baseUrl = this.configService.get<string>("OPENSEARCH_URL");
    const username = this.configService.get<string>("OPENSEARCH_ADMIN_USERNAME");
    const password = this.configService.get<string>("OPENSEARCH_ADMIN_PASSWORD");
    if (!baseUrl || !username || !password) {
      return null;
    }
    return { baseUrl: baseUrl.replace(/\/+$/g, ""), username, password };
  }

  private async ensureRemoteIndexIfConfigured(indexName: string): Promise<void> {
    const config = this.getOpenSearchConfig();
    if (!config) {
      return;
    }
    const headers = this.buildAuthHeaders(config);
    const headResponse = await fetch(`${config.baseUrl}/${encodeURIComponent(indexName)}`, {
      method: "HEAD",
      headers,
    });
    if (headResponse.status === 404) {
      const createResponse = await fetch(`${config.baseUrl}/${encodeURIComponent(indexName)}`, {
        method: "PUT",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!createResponse.ok) {
        const message = await createResponse.text();
        throw new Error(`Failed to create OpenSearch index ${indexName}: ${createResponse.status} ${message}`);
      }
      return;
    }
    if (!headResponse.ok) {
      const message = await headResponse.text();
      throw new Error(`Failed to check OpenSearch index ${indexName}: ${headResponse.status} ${message}`);
    }
  }

  private async issueRemoteKeyIfConfigured(
    indexName: string,
    keyAlias: string,
  ): Promise<{ id: string; apiKey: string } | null> {
    const config = this.getOpenSearchConfig();
    if (!config) {
      return null;
    }
    const keyName = `${indexName}-${keyAlias}`.slice(0, 128);
    const response = await fetch(`${config.baseUrl}/_plugins/_security/api/apikey`, {
      method: "POST",
      headers: { ...this.buildAuthHeaders(config), "content-type": "application/json" },
      body: JSON.stringify({
        name: keyName,
        role_descriptors: {
          [`${indexName}-role`]: {
            cluster_permissions: [],
            index_permissions: [
              {
                index_patterns: [indexName],
                allowed_actions: ["read", "write"],
              },
            ],
          },
        },
      }),
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(`Failed to issue OpenSearch API key: ${response.status} ${message}`);
    }
    const data = (await response.json()) as { id?: string; api_key?: string };
    if (!data.id || !data.api_key) {
      return null;
    }
    return { id: data.id, apiKey: data.api_key };
  }

  private buildAuthHeaders(config: { username: string; password: string }): Record<string, string> {
    const auth = Buffer.from(`${config.username}:${config.password}`).toString("base64");
    return { Authorization: `Basic ${auth}` };
  }
}
