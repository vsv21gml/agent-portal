import { ConflictException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { UserEntity } from "../auth/entities/user.entity";
import { GitlabGroupEntity } from "../gitlab/entities/gitlab-group.entity";
import { GitlabMemberSyncEntity } from "../gitlab/entities/gitlab-member-sync.entity";
import { GitlabRepoEntity } from "../gitlab/entities/gitlab-repo.entity";
import { LogsService } from "../logs/logs.service";
import { ProjectRole } from "../common/enums/project-role.enum";
import { LiteLlmKeyEntity } from "../llm/entities/litellm-key.entity";
import { LiteLlmModelEntity } from "../llm/entities/litellm-model.entity";
import { LiteLlmTeamEntity } from "../llm/entities/litellm-team.entity";
import { WorkspaceSessionEntity } from "../workspaces/entities/workspace-session.entity";
import { VectorKeyEntity } from "../vectordb/entities/vector-key.entity";
import { AddProjectMemberDto } from "./dto/add-project-member.dto";
import { CreateProjectDto } from "./dto/create-project.dto";
import { UpdateProjectDto } from "./dto/update-project.dto";
import { UpdateResourceLimitDto } from "./dto/update-resource-limit.dto";
import { ProjectMemberEntity } from "./entities/project-member.entity";
import { ProjectResourceLimitEntity } from "./entities/project-resource-limit.entity";
import { ProjectEntity } from "./entities/project.entity";

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(ProjectEntity)
    private readonly projectRepository: Repository<ProjectEntity>,
    @InjectRepository(ProjectMemberEntity)
    private readonly projectMemberRepository: Repository<ProjectMemberEntity>,
    @InjectRepository(ProjectResourceLimitEntity)
    private readonly resourceLimitRepository: Repository<ProjectResourceLimitEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(GitlabGroupEntity)
    private readonly gitlabGroupRepository: Repository<GitlabGroupEntity>,
    @InjectRepository(GitlabRepoEntity)
    private readonly gitlabRepoRepository: Repository<GitlabRepoEntity>,
    @InjectRepository(GitlabMemberSyncEntity)
    private readonly gitlabMemberSyncRepository: Repository<GitlabMemberSyncEntity>,
    @InjectRepository(LiteLlmTeamEntity)
    private readonly liteLlmTeamRepository: Repository<LiteLlmTeamEntity>,
    @InjectRepository(LiteLlmKeyEntity)
    private readonly liteLlmKeyRepository: Repository<LiteLlmKeyEntity>,
    @InjectRepository(LiteLlmModelEntity)
    private readonly liteLlmModelRepository: Repository<LiteLlmModelEntity>,
    @InjectRepository(VectorKeyEntity)
    private readonly vectorKeyRepository: Repository<VectorKeyEntity>,
    @InjectRepository(WorkspaceSessionEntity)
    private readonly workspaceRepository: Repository<WorkspaceSessionEntity>,
    private readonly logsService: LogsService,
  ) {}

  async createProject(dto: CreateProjectDto, creatorUserId: string): Promise<ProjectEntity> {
    const project = await this.projectRepository.save(
      this.projectRepository.create({
        name: dto.name,
        description: dto.description,
        deletedYn: "N",
        approvalStatus: "pending",
        requestedByUserId: creatorUserId,
        approvedByUserId: null,
        approvedAt: null,
      }),
    );

    await this.logsService.writeAuditLog({
      userId: creatorUserId,
      actionKey: "PROJECT_CREATE_REQUESTED",
      targetType: "project",
      targetId: project.id,
      projectId: project.id,
      metadata: { name: project.name },
    });

    return project;
  }

  async listProjects(userId: string): Promise<ProjectEntity[]> {
    const memberships = await this.projectMemberRepository.find({ where: { userId } });
    const approvedIds = memberships.map((membership) => membership.projectId);
    const [approvedProjects, requestedProjects] = await Promise.all([
      approvedIds.length
        ? this.projectRepository.find({
            where: {
              id: In(approvedIds),
              deletedYn: "N",
              approvalStatus: "approved",
            },
            order: { createdAt: "DESC" },
          })
        : Promise.resolve([]),
      this.projectRepository.find({
        where: { requestedByUserId: userId, deletedYn: "N" },
        order: { createdAt: "DESC" },
      }),
    ]);

    return Array.from(new Map([...approvedProjects, ...requestedProjects].map((project) => [project.id, project])).values()).sort(
      (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
    );
  }

  listAllProjects(): Promise<ProjectEntity[]> {
    return this.projectRepository.find({ where: { deletedYn: "N" }, order: { createdAt: "DESC" } });
  }

  getProject(projectId: string): Promise<ProjectEntity> {
    return this.projectRepository.findOneByOrFail({ id: projectId });
  }

  async listMembers(projectId: string): Promise<
    Array<
      ProjectMemberEntity & {
        email: string | null;
        displayName: string | null;
        globalRole: string | null;
      }
    >
  > {
    const members = await this.projectMemberRepository.find({ where: { projectId } });
    if (members.length === 0) {
      return [];
    }

    const users = await this.userRepository.findBy({ id: In(members.map((member) => member.userId)) });
    const userMap = new Map(users.map((user) => [user.id, user]));

    return members.map((member) => {
      const user = userMap.get(member.userId);
      return {
        ...member,
        email: user?.email ?? null,
        displayName: user?.displayName ?? null,
        globalRole: user?.globalRole ?? null,
      };
    });
  }

  async addMember(projectId: string, dto: AddProjectMemberDto, actorUserId: string): Promise<ProjectMemberEntity> {
    const existing = await this.projectMemberRepository.findOne({
      where: { projectId, userId: dto.userId },
    });

    if (existing) {
      existing.role = dto.role;
      const saved = await this.projectMemberRepository.save(existing);
      await this.logsService.writeAuditLog({
        userId: actorUserId,
        actionKey: "PROJECT_MEMBER_UPDATED",
        targetType: "project_member",
        targetId: saved.id,
        projectId,
        metadata: { memberUserId: dto.userId, role: dto.role },
      });
      return saved;
    }

    const saved = await this.projectMemberRepository.save(
      this.projectMemberRepository.create({
        projectId,
        userId: dto.userId,
        role: dto.role,
      }),
    );
    await this.logsService.writeAuditLog({
      userId: actorUserId,
      actionKey: "PROJECT_MEMBER_ADDED",
      targetType: "project_member",
      targetId: saved.id,
      projectId,
      metadata: { memberUserId: dto.userId, role: dto.role },
    });
    return saved;
  }

  async removeMember(projectId: string, userId: string, actorUserId: string): Promise<void> {
    await this.projectMemberRepository.delete({ projectId, userId });
    await this.logsService.writeAuditLog({
      userId: actorUserId,
      actionKey: "PROJECT_MEMBER_REMOVED",
      targetType: "project_member",
      targetId: userId,
      projectId,
      metadata: { memberUserId: userId },
    });
  }

  async listAvailableUsers(projectId: string): Promise<UserEntity[]> {
    const members = await this.projectMemberRepository.find({ where: { projectId } });
    const memberIds = new Set(members.map((member) => member.userId));
    const users = await this.userRepository.find({ order: { displayName: "ASC", email: "ASC" } });
    return users.filter((user) => !memberIds.has(user.id));
  }

  async getMemberRole(projectId: string, userId: string): Promise<ProjectRole | null> {
    const member = await this.projectMemberRepository.findOne({ where: { projectId, userId } });
    return member?.role ?? null;
  }

  async getResourceLimit(projectId: string): Promise<ProjectResourceLimitEntity> {
    return this.resourceLimitRepository.findOneByOrFail({ projectId });
  }

  async updateResourceLimit(projectId: string, dto: UpdateResourceLimitDto): Promise<ProjectResourceLimitEntity> {
    const existing = await this.resourceLimitRepository.findOne({ where: { projectId } });
    if (!existing) {
      return this.resourceLimitRepository.save(this.resourceLimitRepository.create({ projectId, ...dto }));
    }

    existing.cpu = dto.cpu;
    existing.memoryGi = dto.memoryGi;
    return this.resourceLimitRepository.save(existing);
  }

  async getOverview(projectId: string) {
    const [project, members, resourceLimit] = await Promise.all([
      this.getProject(projectId),
      this.listMembers(projectId),
      this.resourceLimitRepository.findOne({ where: { projectId } }),
    ]);

    return {
      project,
      members,
      resourceLimit,
    };
  }

  async updateProject(projectId: string, dto: UpdateProjectDto, actorUserId: string): Promise<ProjectEntity> {
    const project = await this.projectRepository.findOneByOrFail({ id: projectId });
    project.name = dto.name;
    project.description = dto.description;
    const saved = await this.projectRepository.save(project);
    await this.logsService.writeAuditLog({
      userId: actorUserId,
      actionKey: "PROJECT_UPDATED",
      targetType: "project",
      targetId: projectId,
      projectId,
      metadata: { name: dto.name },
    });
    return saved;
  }

  async deleteProject(projectId: string, actorUserId: string): Promise<void> {
    const project = await this.projectRepository.findOneByOrFail({ id: projectId });
    project.deletedYn = "Y";
    await this.projectRepository.save(project);
    await this.projectMemberRepository.delete({ projectId });
    await this.gitlabMemberSyncRepository.delete({ projectId });
    await this.logsService.writeAuditLog({
      userId: actorUserId,
      actionKey: "PROJECT_DELETED",
      targetType: "project",
      targetId: projectId,
      projectId,
      metadata: { name: project.name },
    });
  }

  async approveProject(projectId: string, reviewerUserId: string): Promise<ProjectEntity> {
    const project = await this.projectRepository.findOneByOrFail({ id: projectId });
    if (project.approvalStatus === "approved") {
      return project;
    }

    project.approvalStatus = "approved";
    project.approvedByUserId = reviewerUserId;
    project.approvedAt = new Date();
    const saved = await this.projectRepository.save(project);

    const existingMember = await this.projectMemberRepository.findOne({
      where: { projectId: saved.id, userId: saved.requestedByUserId ?? "" },
    });
    if (!existingMember && saved.requestedByUserId) {
      await this.projectMemberRepository.save(
        this.projectMemberRepository.create({
          projectId: saved.id,
          userId: saved.requestedByUserId,
          role: ProjectRole.MANAGER,
        }),
      );
    }

    const resourceLimit = await this.resourceLimitRepository.findOne({ where: { projectId: saved.id } });
    if (!resourceLimit) {
      await this.resourceLimitRepository.save(
        this.resourceLimitRepository.create({
          projectId: saved.id,
          cpu: 2,
          memoryGi: 8,
        }),
      );
    }

    await this.logsService.writeAuditLog({
      userId: reviewerUserId,
      actionKey: "PROJECT_APPROVED",
      targetType: "project",
      targetId: saved.id,
      projectId: saved.id,
      metadata: { name: saved.name },
    });
    return saved;
  }

  async rejectProject(projectId: string, reviewerUserId: string): Promise<ProjectEntity> {
    const project = await this.projectRepository.findOneByOrFail({ id: projectId });
    if (project.approvalStatus === "approved") {
      throw new ConflictException("Approved project cannot be rejected");
    }

    project.approvalStatus = "rejected";
    project.approvedByUserId = reviewerUserId;
    project.approvedAt = null;
    const saved = await this.projectRepository.save(project);
    await this.logsService.writeAuditLog({
      userId: reviewerUserId,
      actionKey: "PROJECT_REJECTED",
      targetType: "project",
      targetId: saved.id,
      projectId: saved.id,
      metadata: { name: saved.name },
    });
    return saved;
  }
}
