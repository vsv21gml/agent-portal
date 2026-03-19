import { ConflictException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { AgentDeploymentEntity } from "../agents/entities/agent-deployment.entity";
import { UserEntity } from "../auth/entities/user.entity";
import { GitlabGroupEntity } from "../gitlab/entities/gitlab-group.entity";
import { GitlabMemberSyncEntity } from "../gitlab/entities/gitlab-member-sync.entity";
import { GitlabRepoEntity } from "../gitlab/entities/gitlab-repo.entity";
import { LogsService } from "../logs/logs.service";
import { McpDeploymentEntity } from "../mcps/entities/mcp-deployment.entity";
import { ProjectRole } from "../common/enums/project-role.enum";
import { LiteLlmKeyEntity } from "../llm/entities/litellm-key.entity";
import { LiteLlmModelEntity } from "../llm/entities/litellm-model.entity";
import { LiteLlmTeamEntity } from "../llm/entities/litellm-team.entity";
import { WorkspaceSessionEntity } from "../workspaces/entities/workspace-session.entity";
import { VectorKeyEntity } from "../vectordb/entities/vector-key.entity";
import { K8sApiService } from "../k8s-api/k8s-api.service";
import { AddProjectMemberDto } from "./dto/add-project-member.dto";
import { ConnectProjectEndpointDto } from "./dto/connect-project-endpoint.dto";
import { CreateProjectDto } from "./dto/create-project.dto";
import { CreateProjectEndpointDto } from "./dto/create-project-endpoint.dto";
import { ProjectEndpointEntity } from "./entities/project-endpoint.entity";
import { UpdateProjectDto } from "./dto/update-project.dto";
import { UpdateResourceLimitDto } from "./dto/update-resource-limit.dto";
import { ProjectMemberEntity } from "./entities/project-member.entity";
import { ProjectResourceLimitEntity } from "./entities/project-resource-limit.entity";
import { ProjectEntity } from "./entities/project.entity";

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly k8sApiService: K8sApiService,
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
    @InjectRepository(AgentDeploymentEntity)
    private readonly agentRepository: Repository<AgentDeploymentEntity>,
    @InjectRepository(McpDeploymentEntity)
    private readonly mcpRepository: Repository<McpDeploymentEntity>,
    @InjectRepository(ProjectEndpointEntity)
    private readonly projectEndpointRepository: Repository<ProjectEndpointEntity>,
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

  async listEndpoints(projectId: string): Promise<ProjectEndpointEntity[]> {
    return this.projectEndpointRepository.find({
      where: { projectId },
      order: { createdAt: "ASC" },
    });
  }

  async createEndpoint(projectId: string, dto: CreateProjectEndpointDto, actorUserId: string): Promise<ProjectEndpointEntity> {
    await this.getProject(projectId);
    const name = dto.name.trim();
    if (!name) {
      throw new ConflictException("Endpoint name is required");
    }

    const existing = await this.projectEndpointRepository.count({ where: { projectId } });
    if (existing >= 2) {
      throw new ConflictException("A project can have up to 2 endpoints");
    }

    const endpointId = crypto.randomUUID();
    const nameSlug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 20) || "endpoint";
    const endpointKey = `${nameSlug}-${endpointId.replace(/-/g, "").slice(0, 8)}`;
    const endpoint = await this.projectEndpointRepository.save(
      this.projectEndpointRepository.create({
        id: endpointId,
        projectId,
        name,
        endpointKey,
        endpointUrl: this.buildProjectEndpointUrl(projectId, endpointKey),
        ingressName: `project-endpoint-${endpointId.replace(/-/g, "").slice(0, 12)}`,
        namespace: null,
        status: "unassigned",
        targetType: null,
        targetId: null,
        targetName: null,
        targetServiceName: null,
        targetNamespace: null,
        targetEndpointUrl: null,
      }),
    );

    await this.logsService.writeAuditLog({
      userId: actorUserId,
      actionKey: "PROJECT_ENDPOINT_CREATED",
      targetType: "project_endpoint",
      targetId: endpoint.id,
      projectId,
      metadata: { endpointName: endpoint.name, endpointUrl: endpoint.endpointUrl },
    });

    return endpoint;
  }

  async connectEndpoint(
    projectId: string,
    endpointId: string,
    dto: ConnectProjectEndpointDto,
    actorUserId: string,
  ): Promise<ProjectEndpointEntity> {
    const endpoint = await this.projectEndpointRepository.findOneByOrFail({ id: endpointId, projectId });
    const target = (await this.resolveEndpointTarget(projectId, dto.targetType, dto.targetId))!;

    const existingBinding = await this.projectEndpointRepository.findOne({
      where: { projectId, targetType: dto.targetType, targetId: dto.targetId },
    });
    if (existingBinding && existingBinding.id !== endpoint.id) {
      throw new ConflictException(`This ${dto.targetType.toUpperCase()} is already connected to endpoint ${existingBinding.name}`);
    }

    const previousBinding =
      endpoint.targetType && endpoint.targetId ? await this.resolveEndpointTarget(projectId, endpoint.targetType, endpoint.targetId, true) : null;

    await this.upsertEndpointIngress({
      namespace: target.namespace,
      ingressName: endpoint.ingressName,
      endpointUrl: endpoint.endpointUrl,
      serviceName: target.serviceName,
      servicePort: 8080,
      targetType: target.type,
    });
    if (endpoint.namespace && endpoint.namespace !== target.namespace) {
      await this.deleteEndpointIngress(endpoint.namespace, endpoint.ingressName);
    }

    await this.deletePublicIngress(target.type, target.record);
    if (previousBinding && (previousBinding.type !== target.type || previousBinding.record.id !== target.record.id)) {
      await this.restorePublicIngress(previousBinding.type, previousBinding.record);
    }

    endpoint.namespace = target.namespace;
    endpoint.status = "connected";
    endpoint.targetType = target.type;
    endpoint.targetId = target.record.id;
    endpoint.targetName = target.name;
    endpoint.targetServiceName = target.serviceName;
    endpoint.targetNamespace = target.namespace;
    endpoint.targetEndpointUrl = target.record.endpointUrl;
    const saved = await this.projectEndpointRepository.save(endpoint);

    await this.logsService.writeAuditLog({
      userId: actorUserId,
      actionKey: "PROJECT_ENDPOINT_CONNECTED",
      targetType: "project_endpoint",
      targetId: endpoint.id,
      projectId,
      metadata: {
        endpointName: endpoint.name,
        endpointUrl: endpoint.endpointUrl,
        targetType: target.type,
        targetId: target.record.id,
        targetName: target.name,
      },
    });

    return saved;
  }

  async disconnectEndpoint(projectId: string, endpointId: string, actorUserId: string): Promise<ProjectEndpointEntity> {
    const endpoint = await this.projectEndpointRepository.findOneByOrFail({ id: endpointId, projectId });
    if (!endpoint.targetType || !endpoint.targetId) {
      return endpoint;
    }

    const target = await this.resolveEndpointTarget(projectId, endpoint.targetType, endpoint.targetId, true);
    await this.deleteEndpointIngress(endpoint.namespace, endpoint.ingressName);
    if (target) {
      await this.restorePublicIngress(target.type, target.record);
    }

    endpoint.namespace = null;
    endpoint.status = "unassigned";
    endpoint.targetType = null;
    endpoint.targetId = null;
    endpoint.targetName = null;
    endpoint.targetServiceName = null;
    endpoint.targetNamespace = null;
    endpoint.targetEndpointUrl = null;
    const saved = await this.projectEndpointRepository.save(endpoint);

    await this.logsService.writeAuditLog({
      userId: actorUserId,
      actionKey: "PROJECT_ENDPOINT_DISCONNECTED",
      targetType: "project_endpoint",
      targetId: endpoint.id,
      projectId,
      metadata: { endpointName: endpoint.name, endpointUrl: endpoint.endpointUrl },
    });

    return saved;
  }

  async deleteEndpoint(projectId: string, endpointId: string, actorUserId: string): Promise<{ id: string }> {
    const endpoint = await this.projectEndpointRepository.findOneByOrFail({ id: endpointId, projectId });
    if (endpoint.targetType && endpoint.targetId) {
      const target = await this.resolveEndpointTarget(projectId, endpoint.targetType, endpoint.targetId, true);
      await this.deleteEndpointIngress(endpoint.namespace, endpoint.ingressName);
      if (target) {
        await this.restorePublicIngress(target.type, target.record);
      }
    }

    await this.projectEndpointRepository.delete({ id: endpoint.id });
    await this.logsService.writeAuditLog({
      userId: actorUserId,
      actionKey: "PROJECT_ENDPOINT_DELETED",
      targetType: "project_endpoint",
      targetId: endpoint.id,
      projectId,
      metadata: { endpointName: endpoint.name, endpointUrl: endpoint.endpointUrl },
    });

    return { id: endpoint.id };
  }

  async ensureDeploymentNotBound(projectId: string, targetType: "agent" | "mcp", targetId: string): Promise<void> {
    const endpoint = await this.projectEndpointRepository.findOne({
      where: { projectId, targetType, targetId },
    });
    if (endpoint) {
      throw new ConflictException(`Connected to endpoint ${endpoint.name}. Disconnect the endpoint first.`);
    }
  }

  private async resolveEndpointTarget(
    projectId: string,
    targetType: "agent" | "mcp",
    targetId: string,
    allowMissing = false,
  ): Promise<{
    type: "agent" | "mcp";
    name: string;
    namespace: string;
    serviceName: string;
    record: AgentDeploymentEntity | McpDeploymentEntity;
  } | null> {
    if (targetType === "agent") {
      const agent = await this.agentRepository.findOne({ where: { id: targetId, projectId, deleteYn: "N" } });
      if (!agent) {
        if (allowMissing) {
          return null;
        }
        throw new ConflictException("Agent not found");
      }
      if (!allowMissing && agent.status !== "running") {
        throw new ConflictException("Only running agents can be connected");
      }
      return {
        type: "agent",
        name: agent.agentName,
        namespace: agent.namespace,
        serviceName: agent.serviceName,
        record: agent,
      };
    }

    const mcp = await this.mcpRepository.findOne({ where: { id: targetId, projectId, deleteYn: "N" } });
    if (!mcp) {
      if (allowMissing) {
        return null;
      }
      throw new ConflictException("MCP not found");
    }
    if (!allowMissing && mcp.status !== "running") {
      throw new ConflictException("Only running MCP servers can be connected");
    }
    return {
      type: "mcp",
      name: mcp.mcpName,
      namespace: mcp.namespace,
      serviceName: mcp.serviceName,
      record: mcp,
    };
  }

  private buildProjectEndpointUrl(projectId: string, endpointKey: string): string {
    const hostTemplate =
      this.configService.get<string>("PROJECT_ENDPOINT_HOST_TEMPLATE")?.trim() ??
      this.configService.get<string>("SERVING_HOST_TEMPLATE")?.trim() ??
      this.configService.get<string>("AGENT_HOST_TEMPLATE")?.trim() ??
      "";
    const pathTemplate =
      this.configService.get<string>("PROJECT_ENDPOINT_PATH_TEMPLATE")?.trim() ??
      this.configService.get<string>("SERVING_PATH_TEMPLATE")?.trim() ??
      this.configService.get<string>("AGENT_PATH_TEMPLATE")?.trim() ??
      "/";
    const scheme =
      this.configService.get<string>("PROJECT_ENDPOINT_URL_SCHEME")?.trim() ??
      this.configService.get<string>("SERVING_URL_SCHEME")?.trim() ??
      this.configService.get<string>("AGENT_URL_SCHEME")?.trim() ??
      "http";
    const templateVars = {
      name: endpointKey,
      endpoint: endpointKey,
      projectId,
    };
    const replaceTemplate = (value: string) =>
      value
        .replace(/\{\{\s*name\s*\}\}/g, templateVars.name)
        .replace(/\{\{\s*endpoint\s*\}\}/g, templateVars.endpoint)
        .replace(/\{\{\s*projectId\s*\}\}/g, templateVars.projectId);

    const host = hostTemplate ? replaceTemplate(hostTemplate) : `${endpointKey}.127.0.0.1.nip.io`;
    const path = replaceTemplate(pathTemplate || "/") || "/";
    return `${scheme}://${host}${path === "/" ? "" : path}`;
  }

  private parseEndpoint(endpointUrl: string): { host: string; ingressPath: string } {
    const url = new URL(endpointUrl);
    return {
      host: url.host,
      ingressPath: url.pathname && url.pathname !== "" ? url.pathname : "/",
    };
  }

  private getIngressClassName(targetType: "agent" | "mcp"): string {
    if (targetType === "mcp") {
      return (
        this.configService.get<string>("K8S_MCP_INGRESS_CLASS")?.trim() ??
        this.configService.get<string>("K8S_SERVING_INGRESS_CLASS")?.trim() ??
        this.configService.get<string>("K8S_AGENT_INGRESS_CLASS")?.trim() ??
        "nginx"
      );
    }
    return (
      this.configService.get<string>("K8S_SERVING_INGRESS_CLASS")?.trim() ??
      this.configService.get<string>("K8S_AGENT_INGRESS_CLASS")?.trim() ??
      "nginx"
    );
  }

  private getIngressAnnotations(targetType: "agent" | "mcp"): Record<string, string> {
    const raw =
      targetType === "mcp"
        ? this.configService.get<string>("K8S_MCP_INGRESS_ANNOTATIONS_JSON")?.trim() ??
          this.configService.get<string>("K8S_SERVING_INGRESS_ANNOTATIONS_JSON")?.trim() ??
          this.configService.get<string>("K8S_AGENT_INGRESS_ANNOTATIONS_JSON")?.trim() ??
          ""
        : this.configService.get<string>("K8S_SERVING_INGRESS_ANNOTATIONS_JSON")?.trim() ??
          this.configService.get<string>("K8S_AGENT_INGRESS_ANNOTATIONS_JSON")?.trim() ??
          "";
    if (!raw) {
      return {};
    }
    return JSON.parse(raw) as Record<string, string>;
  }

  private async upsertEndpointIngress(params: {
    namespace: string;
    ingressName: string;
    endpointUrl: string;
    serviceName: string;
    servicePort: number;
    targetType: "agent" | "mcp";
  }): Promise<void> {
    const { host, ingressPath } = this.parseEndpoint(params.endpointUrl);
    const ingressClassName = this.getIngressClassName(params.targetType);
    const annotations = {
      "kubernetes.io/ingress.class": ingressClassName,
      ...this.getIngressAnnotations(params.targetType),
    };
    const desiredIngress = {
      apiVersion: "networking.k8s.io/v1",
      kind: "Ingress",
      metadata: {
        name: params.ingressName,
        annotations,
      },
      spec: {
        ingressClassName,
        rules: [
          {
            host,
            http: {
              paths: [
                {
                  path: ingressPath,
                  pathType: "Prefix",
                  backend: {
                    service: {
                      name: params.serviceName,
                      port: { number: params.servicePort },
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    } as Record<string, unknown>;

    try {
      const existing = await this.k8sApiService.readIngress(params.namespace, params.ingressName);
      await this.k8sApiService.replaceIngress(params.namespace, params.ingressName, {
        ...desiredIngress,
        metadata: {
          ...(desiredIngress.metadata as Record<string, unknown>),
          resourceVersion: (existing.metadata as { resourceVersion?: string } | undefined)?.resourceVersion,
        },
      });
    } catch {
      await this.k8sApiService.createIngress(params.namespace, desiredIngress);
    }
  }

  private async deleteEndpointIngress(namespace: string | null, ingressName: string): Promise<void> {
    if (!namespace) {
      return;
    }
    try {
      await this.k8sApiService.deleteIngress(namespace, ingressName);
    } catch (error) {
      this.logger.warn(`Endpoint ingress delete skipped namespace=${namespace} ingress=${ingressName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async deletePublicIngress(targetType: "agent" | "mcp", record: AgentDeploymentEntity | McpDeploymentEntity): Promise<void> {
    try {
      await this.k8sApiService.deleteIngress(record.namespace, record.ingressName);
    } catch (error) {
      this.logger.warn(
        `Public ingress delete skipped type=${targetType} namespace=${record.namespace} ingress=${record.ingressName}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async restorePublicIngress(targetType: "agent" | "mcp", record: AgentDeploymentEntity | McpDeploymentEntity): Promise<void> {
    await this.upsertEndpointIngress({
      namespace: record.namespace,
      ingressName: record.ingressName,
      endpointUrl: record.endpointUrl,
      serviceName: record.serviceName,
      servicePort: 8080,
      targetType,
    });
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
    await this.logsService.writeAuditLog({
      userId: actorUserId,
      actionKey: "PROJECT_DELETED",
      targetType: "project",
      targetId: projectId,
      projectId,
      metadata: { name: project.name },
    });
  }

  async restoreProject(projectId: string, actorUserId: string): Promise<ProjectEntity> {
    const project = await this.projectRepository.findOneByOrFail({ id: projectId });
    project.deletedYn = "N";
    const saved = await this.projectRepository.save(project);
    await this.logsService.writeAuditLog({
      userId: actorUserId,
      actionKey: "PROJECT_RESTORED",
      targetType: "project",
      targetId: projectId,
      projectId,
      metadata: { name: project.name },
    });
    return saved;
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
