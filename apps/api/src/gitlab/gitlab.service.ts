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

  async ensureProjectGroup(projectId: string, projectSlug: string): Promise<GitlabGroupEntity> {
    const existing = await this.groupRepository.findOne({ where: { projectId } });
    if (existing) {
      return existing;
    }
    const group = await this.groupRepository.save(
      this.groupRepository.create({
        projectId,
        groupPath: `projects/${projectSlug}`,
      }),
    );
    await this.createRemoteGroupIfConfigured(group);
    return group;
  }

  async createRepo(projectId: string, dto: CreateGitlabRepoDto): Promise<GitlabRepoEntity> {
    const group = await this.groupRepository.findOneByOrFail({ projectId });
    const repo = await this.repoRepository.save(
      this.repoRepository.create({
        projectId,
        repoName: dto.repoName,
        namespacePath: `${group.groupPath}/${dto.repoName}`,
      }),
    );
    await this.createRemoteRepoIfConfigured(group, repo);
    return repo;
  }

  listRepos(projectId: string): Promise<GitlabRepoEntity[]> {
    return this.repoRepository.find({ where: { projectId } });
  }

  listGroups(): Promise<GitlabGroupEntity[]> {
    return this.groupRepository.find({ order: { groupPath: "ASC" } });
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

  private async createRemoteGroupIfConfigured(group: GitlabGroupEntity): Promise<void> {
    const baseUrl = this.configService.get<string>("GITLAB_BASE_URL");
    const token = this.configService.get<string>("GITLAB_TOKEN");
    if (!baseUrl || !token) {
      return;
    }
    await fetch(`${baseUrl}/api/v4/groups`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "PRIVATE-TOKEN": token,
      },
      body: JSON.stringify({
        name: group.groupPath.replace("/", "-"),
        path: group.groupPath.replace("/", "-"),
      }),
    });
  }

  private async createRemoteRepoIfConfigured(group: GitlabGroupEntity, repo: GitlabRepoEntity): Promise<void> {
    const baseUrl = this.configService.get<string>("GITLAB_BASE_URL");
    const token = this.configService.get<string>("GITLAB_TOKEN");
    if (!baseUrl || !token) {
      return;
    }
    await fetch(`${baseUrl}/api/v4/projects`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "PRIVATE-TOKEN": token,
      },
      body: JSON.stringify({
        name: repo.repoName,
        path: repo.repoName,
        description: `Project ${group.projectId} repository`,
      }),
    });
  }

  private async syncMemberToRemoteIfConfigured(projectId: string, email: string | undefined, accessLevel: number): Promise<void> {
    const baseUrl = this.configService.get<string>("GITLAB_BASE_URL");
    const token = this.configService.get<string>("GITLAB_TOKEN");
    if (!baseUrl || !token || !email) {
      return;
    }

    const group = await this.groupRepository.findOne({ where: { projectId } });
    if (!group) {
      return;
    }

    await fetch(`${baseUrl}/api/v4/groups/${encodeURIComponent(group.groupPath)}/members`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "PRIVATE-TOKEN": token,
      },
      body: JSON.stringify({
        user_id: email,
        access_level: accessLevel,
      }),
    });
  }
}
