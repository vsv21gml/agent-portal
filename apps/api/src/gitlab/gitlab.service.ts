import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ProjectRole } from "../common/enums/project-role.enum";
import { CreateGitlabRepoDto } from "./dto/create-gitlab-repo.dto";
import { GitlabGroupEntity } from "./entities/gitlab-group.entity";
import { GitlabMemberSyncEntity } from "./entities/gitlab-member-sync.entity";
import { GitlabRepoEntity } from "./entities/gitlab-repo.entity";

@Injectable()
export class GitlabService {
  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(GitlabGroupEntity)
    private readonly groupRepository: Repository<GitlabGroupEntity>,
    @InjectRepository(GitlabRepoEntity)
    private readonly repoRepository: Repository<GitlabRepoEntity>,
    @InjectRepository(GitlabMemberSyncEntity)
    private readonly memberSyncRepository: Repository<GitlabMemberSyncEntity>,
  ) {}

  async ensureProjectGroup(projectId: string): Promise<GitlabGroupEntity> {
    const existing = await this.groupRepository.findOne({ where: { projectId } });
    if (existing) {
      return this.createRemoteGroupIfConfigured(existing);
    }
    const group = await this.groupRepository.save(
      this.groupRepository.create({
        projectId,
        groupPath: projectId,
        remoteGroupId: null,
        webUrl: null,
      }),
    );
    return this.createRemoteGroupIfConfigured(group);
  }

  async createRepo(projectId: string, dto: CreateGitlabRepoDto): Promise<GitlabRepoEntity> {
    const group = await this.groupRepository.findOneByOrFail({ projectId });
    const existing = await this.repoRepository.findOne({ where: { projectId, repoName: dto.repoName } });
    if (existing) {
      return existing;
    }

    const repo = await this.repoRepository.save(
      this.repoRepository.create({
        projectId,
        repoName: dto.repoName,
        namespacePath: `${group.groupPath}/${dto.repoName}`,
        remoteRepoId: null,
        cloneUrl: null,
        webUrl: null,
      }),
    );
    return this.createRemoteRepoIfConfigured(group, repo);
  }

  listRepos(projectId: string): Promise<GitlabRepoEntity[]> {
    return this.repoRepository.find({ where: { projectId }, order: { createdAt: "DESC" } });
  }

  listGroups(): Promise<GitlabGroupEntity[]> {
    return this.groupRepository.find({ order: { groupPath: "ASC" } });
  }

  getRepo(projectId: string, repoId: string): Promise<GitlabRepoEntity> {
    return this.repoRepository.findOneByOrFail({ id: repoId, projectId });
  }

  async ensureUser(email: string, displayName?: string, password?: string): Promise<void> {
    const baseUrl = this.getGitBaseUrl();
    const token = this.getGitToken();
    if (!baseUrl || !token || !email) {
      return;
    }

    const existingResponse = await fetch(`${baseUrl}/api/v4/users?search=${encodeURIComponent(email)}`, {
      headers: this.gitHeaders(),
    });
    if (existingResponse.ok) {
      const users = (await existingResponse.json()) as Array<{ email?: string; public_email?: string; username?: string }>;
      const existing = users.find((user) => user.email === email || user.public_email === email || user.username === email);
      if (existing) {
        return;
      }
    }

    await fetch(`${baseUrl}/api/v4/users`, {
      method: "POST",
      headers: this.gitHeaders(),
      body: JSON.stringify({
        email,
        name: displayName?.trim() || email.split("@")[0],
        username: this.buildUsername(email),
        password: password || this.generateTempPassword(),
        skip_confirmation: true,
      }),
    });
  }

  async syncMemberAccess(
    projectId: string,
    userId: string,
    role: ProjectRole,
    email?: string,
  ): Promise<GitlabMemberSyncEntity> {
    const accessLevel = role === ProjectRole.MANAGER ? 40 : 30;
    const existing = await this.memberSyncRepository.findOne({ where: { projectId, userId } });
    const row = existing ?? this.memberSyncRepository.create({ projectId, userId, accessLevel });
    row.accessLevel = accessLevel;
    const saved = await this.memberSyncRepository.save(row);

    await this.syncMemberToRemoteIfConfigured(projectId, email, accessLevel);
    return saved;
  }

  listMemberSync(projectId: string): Promise<GitlabMemberSyncEntity[]> {
    return this.memberSyncRepository.find({ where: { projectId } });
  }

  async removeMemberAccess(projectId: string, userId: string, email?: string): Promise<void> {
    await this.memberSyncRepository.delete({ projectId, userId });

    const baseUrl = this.getGitBaseUrl();
    const token = this.getGitToken();
    if (!baseUrl || !token || !email) {
      return;
    }

    const group = await this.groupRepository.findOne({ where: { projectId } });
    if (!group?.remoteGroupId) {
      return;
    }

    const userResponse = await fetch(`${baseUrl}/api/v4/users?search=${encodeURIComponent(email)}`, {
      headers: this.gitHeaders(),
    });
    if (!userResponse.ok) {
      return;
    }

    const users = (await userResponse.json()) as Array<{ id: number; email?: string; public_email?: string; username?: string }>;
    const targetUser = users.find((user) => user.email === email || user.public_email === email || user.username === email);
    if (!targetUser) {
      return;
    }

    await fetch(`${baseUrl}/api/v4/groups/${group.remoteGroupId}/members/${targetUser.id}`, {
      method: "DELETE",
      headers: this.gitHeaders(),
    });
  }

  private async createRemoteGroupIfConfigured(group: GitlabGroupEntity): Promise<GitlabGroupEntity> {
    const baseUrl = this.getGitBaseUrl();
    const token = this.getGitToken();
    if (!baseUrl || !token) {
      return group;
    }

    const existingResponse = await fetch(`${baseUrl}/api/v4/groups/${encodeURIComponent(group.groupPath)}`, {
      headers: this.gitHeaders(),
    });

    if (existingResponse.ok) {
      const existing = (await existingResponse.json()) as { id: number; web_url?: string };
      group.remoteGroupId = String(existing.id);
      group.webUrl = existing.web_url ?? null;
      return this.groupRepository.save(group);
    }

    const response = await fetch(`${baseUrl}/api/v4/groups`, {
      method: "POST",
      headers: this.gitHeaders(),
      body: JSON.stringify({
        name: group.groupPath,
        path: group.groupPath,
      }),
    });

    if (!response.ok) {
      return group;
    }

    const data = (await response.json()) as { id: number; web_url?: string };
    group.remoteGroupId = String(data.id);
    group.webUrl = data.web_url ?? null;
    return this.groupRepository.save(group);
  }

  private async createRemoteRepoIfConfigured(group: GitlabGroupEntity, repo: GitlabRepoEntity): Promise<GitlabRepoEntity> {
    const baseUrl = this.getGitBaseUrl();
    const token = this.getGitToken();
    if (!baseUrl || !token) {
      return repo;
    }

    const ensuredGroup = await this.createRemoteGroupIfConfigured(group);
    if (!ensuredGroup.remoteGroupId) {
      return repo;
    }

    const response = await fetch(`${baseUrl}/api/v4/projects`, {
      method: "POST",
      headers: this.gitHeaders(),
      body: JSON.stringify({
        name: repo.repoName,
        path: repo.repoName,
        description: `Project ${group.projectId} repository`,
        namespace_id: Number(ensuredGroup.remoteGroupId),
      }),
    });

    if (!response.ok) {
      return repo;
    }

    const data = (await response.json()) as {
      id: number;
      http_url_to_repo?: string;
      web_url?: string;
      path_with_namespace?: string;
    };
    repo.remoteRepoId = String(data.id);
    repo.cloneUrl = data.http_url_to_repo ?? `${baseUrl}/${data.path_with_namespace ?? repo.namespacePath}.git`;
    repo.webUrl = data.web_url ?? `${baseUrl}/${data.path_with_namespace ?? repo.namespacePath}`;
    repo.namespacePath = data.path_with_namespace ?? repo.namespacePath;
    return this.repoRepository.save(repo);
  }

  private async syncMemberToRemoteIfConfigured(projectId: string, email: string | undefined, accessLevel: number): Promise<void> {
    const baseUrl = this.getGitBaseUrl();
    const token = this.getGitToken();
    if (!baseUrl || !token || !email) {
      return;
    }

    const group = await this.groupRepository.findOne({ where: { projectId } });
    if (!group?.remoteGroupId) {
      return;
    }

    const userResponse = await fetch(`${baseUrl}/api/v4/users?search=${encodeURIComponent(email)}`, {
      headers: this.gitHeaders(),
    });
    if (!userResponse.ok) {
      return;
    }

    const users = (await userResponse.json()) as Array<{ id: number; email?: string; public_email?: string; username?: string }>;
    const targetUser = users.find((user) => user.email === email || user.public_email === email || user.username === email);
    if (!targetUser) {
      return;
    }

    await fetch(`${baseUrl}/api/v4/groups/${group.remoteGroupId}/members`, {
      method: "POST",
      headers: this.gitHeaders(),
      body: JSON.stringify({
        user_id: targetUser.id,
        access_level: accessLevel,
      }),
    });
  }

  private getGitBaseUrl(): string {
    return this.configService.get<string>("GITLAB_BASE_URL")?.trim().replace(/\/+$/, "") ?? "";
  }

  private getGitToken(): string {
    return this.configService.get<string>("GITLAB_TOKEN")?.trim() ?? "";
  }

  private gitHeaders(): Record<string, string> {
    const token = this.getGitToken();
    return {
      "content-type": "application/json",
      ...(token ? { "PRIVATE-TOKEN": token } : {}),
    };
  }

  private buildUsername(email: string): string {
    const localPart = email.split("@")[0] || "user";
    const base = localPart.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "user";
    return `${base}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private generateTempPassword(): string {
    return `GitLab-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}
