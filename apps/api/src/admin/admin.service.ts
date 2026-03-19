import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import * as k8s from "@kubernetes/client-node";
import { Repository } from "typeorm";
import { AgentDeploymentEntity } from "../agents/entities/agent-deployment.entity";
import { UserEntity } from "../auth/entities/user.entity";
import { GitlabRepoEntity } from "../gitlab/entities/gitlab-repo.entity";
import { LlmService } from "../llm/llm.service";
import { McpDeploymentEntity } from "../mcps/entities/mcp-deployment.entity";
import { ProjectMemberEntity } from "../projects/entities/project-member.entity";
import { ProjectEntity } from "../projects/entities/project.entity";
import { K8sApiService } from "../k8s-api/k8s-api.service";
import { WorkspaceSessionEntity } from "../workspaces/entities/workspace-session.entity";

type WorkspaceResourceRow = {
  sessionId: string;
  projectId: string;
  projectName: string;
  repoId: string;
  repoName: string;
  userId: string;
  userEmail: string;
  userDisplayName: string;
  status: string;
  cpu: number;
  memoryGi: number;
  nodeName: string | null;
  createdAt: string;
};

type WorkspaceResourceOverview = {
  nodePool: {
    nodeCount: number;
    totalCpu: number;
    totalMemoryGi: number;
    nodes: ResourceNodeRow[];
  };
  running: {
    workspaceCount: number;
    usedCpu: number;
    usedMemoryGi: number;
    cpuUsagePercent: number;
    memoryUsagePercent: number;
  };
  rows: WorkspaceResourceRow[];
};

type AgentResourceRow = {
  agentId: string;
  projectId: string;
  projectName: string;
  repoId: string;
  repoName: string;
  agentName: string;
  userId: string;
  userEmail: string;
  userDisplayName: string;
  status: string;
  cpu: number;
  memoryGi: number;
  nodeName: string | null;
  createdAt: string;
};

type ResourceNodeRow = {
  nodeName: string;
  cpu: number;
  memoryGi: number;
};

type NodePoolConstraints = {
  selector: Record<string, string>;
  tolerations: k8s.V1Toleration[];
};

type ManagedNodeGroupPoolType = "workspace" | "serving";

type ManagedNodeGroupRow = {
  nodeGroupName: string;
  status: string;
  desiredSize: number;
  minSize: number;
  maxSize: number;
  diskSize: number | null;
  capacityType: string | null;
  amiType: string | null;
  instanceTypes: string[];
  labels: Record<string, string>;
  taints: Array<{ key: string; value: string; effect: string }>;
  matchingNodeCount: number;
  matchingNodeNames: string[];
  createdAt: string | null;
};

type ManagedNodeGroupOverview = {
  configured: boolean;
  poolType: ManagedNodeGroupPoolType;
  clusterName: string | null;
  region: string;
  nodeRoleArnConfigured: boolean;
  subnetCount: number;
  scheduling: {
    selector: Record<string, string>;
    tolerations: k8s.V1Toleration[];
  };
  defaults: {
    instanceTypes: string[];
    minSize: number;
    maxSize: number;
    desiredSize: number;
    diskSize: number;
    capacityType: string | null;
    amiType: string | null;
  };
  nodeGroups: ManagedNodeGroupRow[];
  message: string | null;
};

type AgentResourceOverview = {
  nodePool: {
    nodeCount: number;
    totalCpu: number;
    totalMemoryGi: number;
    nodes: ResourceNodeRow[];
  };
  running: {
    agentCount: number;
    usedCpu: number;
    usedMemoryGi: number;
    cpuUsagePercent: number;
    memoryUsagePercent: number;
  };
  rows: AgentResourceRow[];
};

type McpResourceRow = {
  mcpId: string;
  projectId: string;
  projectName: string;
  repoId: string;
  repoName: string;
  mcpName: string;
  userId: string;
  userEmail: string;
  userDisplayName: string;
  status: string;
  cpu: number;
  memoryGi: number;
  nodeName: string | null;
  createdAt: string;
};

type McpResourceOverview = {
  nodePool: {
    nodeCount: number;
    totalCpu: number;
    totalMemoryGi: number;
    nodes: ResourceNodeRow[];
  };
  running: {
    mcpCount: number;
    usedCpu: number;
    usedMemoryGi: number;
    cpuUsagePercent: number;
    memoryUsagePercent: number;
  };
  rows: McpResourceRow[];
};

type AgentAdminRow = {
  id: string;
  projectId: string;
  projectName: string;
  repoId: string;
  repoName: string;
  ownerUserId: string;
  ownerUserEmail: string;
  ownerUserDisplayName: string;
  agentName: string;
  description: string;
  litellmModel: string;
  status: string;
  endpointUrl: string;
  spendUsd: number;
  createdAt: string;
};

type McpAdminRow = {
  id: string;
  projectId: string;
  projectName: string;
  repoId: string;
  repoName: string;
  ownerUserId: string;
  ownerUserEmail: string;
  ownerUserDisplayName: string;
  mcpName: string;
  description: string;
  useLlm: string;
  litellmModel: string;
  status: string;
  endpointUrl: string;
  spendUsd: number;
  createdAt: string;
};

type UserAdminRow = {
  id: string;
  email: string;
  displayName: string;
  globalRole: string;
  approvalStatus: string;
  createdAt: string;
  currentMonthSpendUsd: number;
  currentMonthBudgetUsd: number | null;
};

type ProjectAdminRow = {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  deletedYn: string;
  status: string;
  approvalStatus: string;
  requestedByUserId: string | null;
  requestedByUserEmail: string | null;
  requestedByDisplayName: string | null;
  repoCount: number;
  agentCount: number;
  mcpCount: number;
  runningWorkspaceCount: number;
  memberCount: number;
};

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly k8sApiService: K8sApiService,
    private readonly llmService: LlmService,
    @InjectRepository(WorkspaceSessionEntity)
    private readonly workspaceRepository: Repository<WorkspaceSessionEntity>,
    @InjectRepository(AgentDeploymentEntity)
    private readonly agentRepository: Repository<AgentDeploymentEntity>,
    @InjectRepository(McpDeploymentEntity)
    private readonly mcpRepository: Repository<McpDeploymentEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projectRepository: Repository<ProjectEntity>,
    @InjectRepository(ProjectMemberEntity)
    private readonly projectMemberRepository: Repository<ProjectMemberEntity>,
    @InjectRepository(GitlabRepoEntity)
    private readonly repoRepository: Repository<GitlabRepoEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  async getWorkspaceResourceOverview(): Promise<WorkspaceResourceOverview> {
    const namespace = this.configService.get<string>("K8S_WORKSPACE_NAMESPACE", "agent-workspaces");
    const sessions = await this.workspaceRepository.find({
      where: { namespace },
      order: { createdAt: "DESC" },
    });
    const podsByDeployment = await this.getWorkspacePodsByDeployment(namespace);
    const runningSessions = sessions.filter((session) => {
      const pod = podsByDeployment.get(session.deploymentName);
      return this.isWorkspacePodRunning(pod);
    });
    const projectIds = [...new Set(runningSessions.map((session) => session.projectId))];
    const repoIds = [...new Set(runningSessions.map((session) => session.repoId))];
    const userIds = [...new Set(runningSessions.map((session) => session.userId))];

    const [projects, repos, users, nodePool] = await Promise.all([
      projectIds.length ? this.projectRepository.findBy(projectIds.map((id) => ({ id }))) : Promise.resolve([]),
      repoIds.length ? this.repoRepository.findBy(repoIds.map((id) => ({ id }))) : Promise.resolve([]),
      userIds.length ? this.userRepository.findBy(userIds.map((id) => ({ id }))) : Promise.resolve([]),
      this.getNodePoolSummary(this.getWorkspaceNodeConstraints()),
    ]);

    const projectMap = new Map(projects.map((project) => [project.id, project]));
    const repoMap = new Map(repos.map((repo) => [repo.id, repo]));
    const userMap = new Map(users.map((user) => [user.id, user]));

    const rows: WorkspaceResourceRow[] = runningSessions.map((session) => {
      const project = projectMap.get(session.projectId);
      const repo = repoMap.get(session.repoId);
      const user = userMap.get(session.userId);
      const pod = podsByDeployment.get(session.deploymentName);
      const requested = this.getPodRequestedResources(pod);

      return {
        sessionId: session.id,
        projectId: session.projectId,
        projectName: project?.name ?? session.projectId,
        repoId: session.repoId,
        repoName: repo?.repoName ?? session.repoName,
        userId: session.userId,
        userEmail: user?.email ?? "",
        userDisplayName: user?.displayName ?? user?.email ?? session.userId,
        status: "running",
        cpu: requested.cpu,
        memoryGi: requested.memoryGi,
        nodeName: pod?.spec?.nodeName ?? null,
        createdAt: session.createdAt.toISOString(),
      };
    });

    const usedCpu = rows.reduce((sum, row) => sum + row.cpu, 0);
    const usedMemoryGi = rows.reduce((sum, row) => sum + row.memoryGi, 0);

    return {
      nodePool,
      running: {
        workspaceCount: rows.length,
        usedCpu,
        usedMemoryGi,
        cpuUsagePercent: nodePool.totalCpu > 0 ? Math.min(100, (usedCpu / nodePool.totalCpu) * 100) : 0,
        memoryUsagePercent: nodePool.totalMemoryGi > 0 ? Math.min(100, (usedMemoryGi / nodePool.totalMemoryGi) * 100) : 0,
      },
      rows,
    };
  }

  async getAgentResourceOverview(): Promise<AgentResourceOverview> {
    const configuredNamespace = this.configService.get<string>("K8S_SERVING_NAMESPACE", this.configService.get<string>("K8S_AGENT_NAMESPACE", "agent-serving"));
    const agents = await this.agentRepository.find({
      where: { deleteYn: "N" },
      order: { createdAt: "DESC" },
    });
    const namespaces = Array.from(new Set(agents.map((agent) => agent.namespace).filter(Boolean)));
    if (!namespaces.includes(configuredNamespace)) {
      namespaces.push(configuredNamespace);
    }
    const podsByDeployment = await this.getPodsByDeploymentAcrossNamespaces(namespaces, "agent-portal/agent-name");
    const runningAgents = agents.filter((agent) => {
      const pod = podsByDeployment.get(`${agent.namespace}:${agent.deploymentName}`);
      return this.isAgentPodRunning(pod);
    });
    const projectIds = [...new Set(runningAgents.map((agent) => agent.projectId))];
    const repoIds = [...new Set(runningAgents.map((agent) => agent.repoId))];
    const userIds = [...new Set(runningAgents.map((agent) => agent.ownerUserId))];

    const [projects, repos, users, nodePool] = await Promise.all([
      projectIds.length ? this.projectRepository.findBy(projectIds.map((id) => ({ id }))) : Promise.resolve([]),
      repoIds.length ? this.repoRepository.findBy(repoIds.map((id) => ({ id }))) : Promise.resolve([]),
      userIds.length ? this.userRepository.findBy(userIds.map((id) => ({ id }))) : Promise.resolve([]),
      this.getNodePoolSummary(this.getServingNodeConstraints()),
    ]);

    const projectMap = new Map(projects.map((project) => [project.id, project]));
    const repoMap = new Map(repos.map((repo) => [repo.id, repo]));
    const userMap = new Map(users.map((user) => [user.id, user]));

    const rows: AgentResourceRow[] = runningAgents.map((agent) => {
      const project = projectMap.get(agent.projectId);
      const repo = repoMap.get(agent.repoId);
      const user = userMap.get(agent.ownerUserId);
      const pod = podsByDeployment.get(`${agent.namespace}:${agent.deploymentName}`);
      const requested = this.getPodRequestedResources(pod);

      return {
        agentId: agent.id,
        projectId: agent.projectId,
        projectName: project?.name ?? agent.projectId,
        repoId: agent.repoId,
        repoName: repo?.repoName ?? agent.repoId,
        agentName: agent.agentName,
        userId: agent.ownerUserId,
        userEmail: user?.email ?? "",
        userDisplayName: user?.displayName ?? user?.email ?? agent.ownerUserId,
        status: "running",
        cpu: requested.cpu,
        memoryGi: requested.memoryGi,
        nodeName: pod?.spec?.nodeName ?? null,
        createdAt: agent.createdAt.toISOString(),
      };
    });

    const usedCpu = rows.reduce((sum, row) => sum + row.cpu, 0);
    const usedMemoryGi = rows.reduce((sum, row) => sum + row.memoryGi, 0);

    return {
      nodePool,
      running: {
        agentCount: rows.length,
        usedCpu,
        usedMemoryGi,
        cpuUsagePercent: nodePool.totalCpu > 0 ? Math.min(100, (usedCpu / nodePool.totalCpu) * 100) : 0,
        memoryUsagePercent: nodePool.totalMemoryGi > 0 ? Math.min(100, (usedMemoryGi / nodePool.totalMemoryGi) * 100) : 0,
      },
      rows,
    };
  }

  async getMcpResourceOverview(): Promise<McpResourceOverview> {
    const configuredNamespace = this.configService.get<string>("K8S_MCP_NAMESPACE", "mcp-serving");
    const mcps = await this.mcpRepository.find({
      where: { deleteYn: "N" },
      order: { createdAt: "DESC" },
    });
    const namespaces = Array.from(new Set(mcps.map((mcp) => mcp.namespace).filter(Boolean)));
    if (!namespaces.includes(configuredNamespace)) {
      namespaces.push(configuredNamespace);
    }
    const podsByDeployment = await this.getPodsByDeploymentAcrossNamespaces(namespaces, "agent-portal/mcp-name");
    const runningMcps = mcps.filter((mcp) => {
      const pod = podsByDeployment.get(`${mcp.namespace}:${mcp.deploymentName}`);
      return this.isAgentPodRunning(pod);
    });
    const projectIds = [...new Set(runningMcps.map((mcp) => mcp.projectId))];
    const repoIds = [...new Set(runningMcps.map((mcp) => mcp.repoId))];
    const userIds = [...new Set(runningMcps.map((mcp) => mcp.ownerUserId))];

    const [projects, repos, users, nodePool] = await Promise.all([
      projectIds.length ? this.projectRepository.findBy(projectIds.map((id) => ({ id }))) : Promise.resolve([]),
      repoIds.length ? this.repoRepository.findBy(repoIds.map((id) => ({ id }))) : Promise.resolve([]),
      userIds.length ? this.userRepository.findBy(userIds.map((id) => ({ id }))) : Promise.resolve([]),
      this.getNodePoolSummary(this.getServingNodeConstraints()),
    ]);

    const projectMap = new Map(projects.map((project) => [project.id, project]));
    const repoMap = new Map(repos.map((repo) => [repo.id, repo]));
    const userMap = new Map(users.map((user) => [user.id, user]));

    const rows: McpResourceRow[] = runningMcps.map((mcp) => {
      const project = projectMap.get(mcp.projectId);
      const repo = repoMap.get(mcp.repoId);
      const user = userMap.get(mcp.ownerUserId);
      const pod = podsByDeployment.get(`${mcp.namespace}:${mcp.deploymentName}`);
      const requested = this.getPodRequestedResources(pod);

      return {
        mcpId: mcp.id,
        projectId: mcp.projectId,
        projectName: project?.name ?? mcp.projectId,
        repoId: mcp.repoId,
        repoName: repo?.repoName ?? mcp.repoId,
        mcpName: mcp.mcpName,
        userId: mcp.ownerUserId,
        userEmail: user?.email ?? "",
        userDisplayName: user?.displayName ?? user?.email ?? mcp.ownerUserId,
        status: "running",
        cpu: requested.cpu,
        memoryGi: requested.memoryGi,
        nodeName: pod?.spec?.nodeName ?? null,
        createdAt: mcp.createdAt.toISOString(),
      };
    });

    const usedCpu = rows.reduce((sum, row) => sum + row.cpu, 0);
    const usedMemoryGi = rows.reduce((sum, row) => sum + row.memoryGi, 0);

    return {
      nodePool,
      running: {
        mcpCount: rows.length,
        usedCpu,
        usedMemoryGi,
        cpuUsagePercent: nodePool.totalCpu > 0 ? Math.min(100, (usedCpu / nodePool.totalCpu) * 100) : 0,
        memoryUsagePercent: nodePool.totalMemoryGi > 0 ? Math.min(100, (usedMemoryGi / nodePool.totalMemoryGi) * 100) : 0,
      },
      rows,
    };
  }

  async getManagedNodeGroupOverview(poolType: ManagedNodeGroupPoolType): Promise<ManagedNodeGroupOverview> {
    return (await this.k8sApiService.getManagedNodeGroupOverview(poolType)) as ManagedNodeGroupOverview;
  }

  async createManagedNodeGroup(
    poolType: ManagedNodeGroupPoolType,
    input: {
      nodeGroupName: string;
      instanceTypes?: string[];
      minSize?: number;
      maxSize?: number;
      desiredSize?: number;
      diskSize?: number;
      capacityType?: "ON_DEMAND" | "SPOT";
      amiType?: string;
    },
  ): Promise<ManagedNodeGroupOverview> {
    return (await this.k8sApiService.createManagedNodeGroup(poolType, input as Record<string, unknown>)) as ManagedNodeGroupOverview;
  }

  async deleteManagedNodeGroup(poolType: ManagedNodeGroupPoolType, nodeGroupName: string): Promise<ManagedNodeGroupOverview> {
    return (await this.k8sApiService.deleteManagedNodeGroup(poolType, nodeGroupName)) as ManagedNodeGroupOverview;
  }

  async listAgents(): Promise<AgentAdminRow[]> {
    const agents = await this.agentRepository.find({
      where: { deleteYn: "N" },
      order: { createdAt: "DESC" },
    });
    const projectIds = [...new Set(agents.map((agent) => agent.projectId))];
    const repoIds = [...new Set(agents.map((agent) => agent.repoId))];
    const userIds = [...new Set(agents.map((agent) => agent.ownerUserId))];

    const [projects, repos, users, spendRows] = await Promise.all([
      projectIds.length ? this.projectRepository.findBy(projectIds.map((id) => ({ id }))) : Promise.resolve([]),
      repoIds.length ? this.repoRepository.findBy(repoIds.map((id) => ({ id }))) : Promise.resolve([]),
      userIds.length ? this.userRepository.findBy(userIds.map((id) => ({ id }))) : Promise.resolve([]),
      Promise.all(agents.map((agent) => this.llmService.getApiKeySpend(agent.litellmApiKey))),
    ]);

    const projectMap = new Map(projects.map((project) => [project.id, project]));
    const repoMap = new Map(repos.map((repo) => [repo.id, repo]));
    const userMap = new Map(users.map((user) => [user.id, user]));

    return agents.map((agent, index) => {
      const project = projectMap.get(agent.projectId);
      const repo = repoMap.get(agent.repoId);
      const user = userMap.get(agent.ownerUserId);

      return {
        id: agent.id,
        projectId: agent.projectId,
        projectName: project?.name ?? agent.projectId,
        repoId: agent.repoId,
        repoName: repo?.repoName ?? agent.repoId,
        ownerUserId: agent.ownerUserId,
        ownerUserEmail: user?.email ?? "",
        ownerUserDisplayName: user?.displayName ?? user?.email ?? agent.ownerUserId,
        agentName: agent.agentName,
        description: agent.description,
        litellmModel: agent.litellmModel,
        status: agent.status,
        endpointUrl: agent.endpointUrl,
        spendUsd: spendRows[index] ?? 0,
        createdAt: agent.createdAt.toISOString(),
      };
    });
  }

  async listMcps(): Promise<McpAdminRow[]> {
    const mcps = await this.mcpRepository.find({
      where: { deleteYn: "N" },
      order: { createdAt: "DESC" },
    });
    const projectIds = [...new Set(mcps.map((mcp) => mcp.projectId))];
    const repoIds = [...new Set(mcps.map((mcp) => mcp.repoId))];
    const userIds = [...new Set(mcps.map((mcp) => mcp.ownerUserId))];

    const [projects, repos, users, spendRows] = await Promise.all([
      projectIds.length ? this.projectRepository.findBy(projectIds.map((id) => ({ id }))) : Promise.resolve([]),
      repoIds.length ? this.repoRepository.findBy(repoIds.map((id) => ({ id }))) : Promise.resolve([]),
      userIds.length ? this.userRepository.findBy(userIds.map((id) => ({ id }))) : Promise.resolve([]),
      Promise.all(mcps.map((mcp) => this.llmService.getApiKeySpend(mcp.litellmApiKey))),
    ]);

    const projectMap = new Map(projects.map((project) => [project.id, project]));
    const repoMap = new Map(repos.map((repo) => [repo.id, repo]));
    const userMap = new Map(users.map((user) => [user.id, user]));

    return mcps.map((mcp, index) => {
      const project = projectMap.get(mcp.projectId);
      const repo = repoMap.get(mcp.repoId);
      const user = userMap.get(mcp.ownerUserId);

      return {
        id: mcp.id,
        projectId: mcp.projectId,
        projectName: project?.name ?? mcp.projectId,
        repoId: mcp.repoId,
        repoName: repo?.repoName ?? mcp.repoId,
        ownerUserId: mcp.ownerUserId,
        ownerUserEmail: user?.email ?? "",
        ownerUserDisplayName: user?.displayName ?? user?.email ?? mcp.ownerUserId,
        mcpName: mcp.mcpName,
        description: mcp.description,
        useLlm: mcp.useLlm,
        litellmModel: mcp.litellmModel,
        status: mcp.status,
        endpointUrl: mcp.endpointUrl,
        spendUsd: spendRows[index] ?? 0,
        createdAt: mcp.createdAt.toISOString(),
      };
    });
  }

  private async getWorkspacePodsByDeployment(namespace: string): Promise<Map<string, k8s.V1Pod>> {
    return this.getPodsByDeployment(namespace, "agent-portal/workspace-name");
  }

  private async getPodsByDeploymentAcrossNamespaces(
    namespaces: string[],
    labelKey: string,
  ): Promise<Map<string, k8s.V1Pod>> {
    const map = new Map<string, k8s.V1Pod>();
    for (const namespace of namespaces) {
      const namespaceMap = await this.getPodsByDeployment(namespace, labelKey);
      for (const [deploymentName, pod] of namespaceMap.entries()) {
        map.set(`${namespace}:${deploymentName}`, pod);
      }
    }
    return map;
  }

  private async getPodsByDeployment(namespace: string, labelKey: string): Promise<Map<string, k8s.V1Pod>> {
    try {
      const result = await this.k8sApiService.listPods(namespace);
      const map = new Map<string, k8s.V1Pod>();
      for (const pod of result.items as k8s.V1Pod[]) {
        const deploymentName = pod.metadata?.labels?.[labelKey];
        if (deploymentName) {
          const existing = map.get(deploymentName);
          if (!existing || this.comparePodPriority(pod, existing) > 0) {
            map.set(deploymentName, pod);
          }
        }
      }
      return map;
    } catch (error) {
      this.logger.warn(`Failed to list workspace pods: ${this.describeError(error)}`);
      return new Map();
    }
  }

  private async getWorkspaceNodePoolSummary(): Promise<WorkspaceResourceOverview["nodePool"]> {
    return this.getNodePoolSummary(this.getWorkspaceNodeConstraints());
  }

  async listUsers(): Promise<UserAdminRow[]> {
    const users = await this.userRepository.find({ order: { createdAt: "DESC" } });
    const usageRows = await Promise.all(users.map((user) => this.llmService.getCurrentUserUsage(user.id)));

    return users.map((user, index) => ({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      globalRole: user.globalRole,
      approvalStatus: user.approvalStatus,
      createdAt: user.createdAt.toISOString(),
      currentMonthSpendUsd: usageRows[index]?.currentMonthSpendUsd ?? 0,
      currentMonthBudgetUsd: usageRows[index]?.currentMonthBudgetUsd ?? null,
    }));
  }

  async listProjects(): Promise<ProjectAdminRow[]> {
    const projects = await this.projectRepository.find({ order: { createdAt: "DESC" } });
    const requesterIds = [...new Set(projects.map((project) => project.requestedByUserId).filter(Boolean))] as string[];
    const projectIds = projects.map((project) => project.id);
    const [users, repos, members, workspaces, agents, mcps] = await Promise.all([
      requesterIds.length ? this.userRepository.findBy(requesterIds.map((id) => ({ id }))) : Promise.resolve([]),
      projectIds.length ? this.repoRepository.findBy(projectIds.map((id) => ({ projectId: id }))) : Promise.resolve([]),
      projectIds.length ? this.projectMemberRepository.findBy(projectIds.map((id) => ({ projectId: id }))) : Promise.resolve([]),
      projectIds.length ? this.workspaceRepository.findBy(projectIds.map((id) => ({ projectId: id }))) : Promise.resolve([]),
      projectIds.length ? this.agentRepository.findBy(projectIds.map((id) => ({ projectId: id, deleteYn: "N" }))) : Promise.resolve([]),
      projectIds.length ? this.mcpRepository.findBy(projectIds.map((id) => ({ projectId: id, deleteYn: "N" }))) : Promise.resolve([]),
    ]);
    const userMap = new Map(users.map((user) => [user.id, user]));
    const repoCountByProjectId = this.buildProjectCountMap(repos.map((repo) => repo.projectId));
    const memberCountByProjectId = this.buildProjectCountMap(members.map((member) => member.projectId));
    const runningWorkspaceCountByProjectId = this.buildProjectCountMap(
      workspaces.filter((workspace) => workspace.status === "running").map((workspace) => workspace.projectId),
    );
    const agentCountByProjectId = this.buildProjectCountMap(agents.map((agent) => agent.projectId));
    const mcpCountByProjectId = this.buildProjectCountMap(mcps.map((mcp) => mcp.projectId));

    return projects.map((project) => {
      const requester = project.requestedByUserId ? userMap.get(project.requestedByUserId) : null;
      return {
        id: project.id,
        name: project.name,
        description: project.description,
        createdAt: project.createdAt.toISOString(),
        deletedYn: project.deletedYn,
        status: project.deletedYn === "Y" ? "deleted" : project.approvalStatus,
        approvalStatus: project.approvalStatus,
        requestedByUserId: project.requestedByUserId,
        requestedByUserEmail: requester?.email ?? null,
        requestedByDisplayName: requester?.displayName ?? null,
        repoCount: repoCountByProjectId.get(project.id) ?? 0,
        agentCount: agentCountByProjectId.get(project.id) ?? 0,
        mcpCount: mcpCountByProjectId.get(project.id) ?? 0,
        runningWorkspaceCount: runningWorkspaceCountByProjectId.get(project.id) ?? 0,
        memberCount: memberCountByProjectId.get(project.id) ?? 0,
      };
    });
  }

  private buildProjectCountMap(projectIds: string[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const projectId of projectIds) {
      counts.set(projectId, (counts.get(projectId) ?? 0) + 1);
    }
    return counts;
  }

  private async getNodePoolSummary(constraints: NodePoolConstraints): Promise<WorkspaceResourceOverview["nodePool"]> {
    try {
      const result = await this.k8sApiService.listNodes();
      const matchingNodes = (result.items as k8s.V1Node[]).filter((node) => this.matchesNodePoolConstraints(node, constraints));

      return {
        nodeCount: matchingNodes.length,
        totalCpu: matchingNodes.reduce((sum, node) => sum + this.parseCpu(node.status?.capacity?.cpu), 0),
        totalMemoryGi: matchingNodes.reduce((sum, node) => sum + this.parseMemoryGi(node.status?.capacity?.memory), 0),
        nodes: matchingNodes.map((node) => ({
          nodeName: node.metadata?.name ?? "-",
          cpu: this.parseCpu(node.status?.capacity?.cpu),
          memoryGi: this.parseMemoryGi(node.status?.capacity?.memory),
        })),
      };
    } catch (error) {
      this.logger.warn(`Failed to list nodes: ${this.describeError(error)}`);
      return { nodeCount: 0, totalCpu: 0, totalMemoryGi: 0, nodes: [] };
    }
  }

  private isWorkspacePodRunning(pod: k8s.V1Pod | undefined): boolean {
    return this.isPodRunning(pod);
  }

  private isAgentPodRunning(pod: k8s.V1Pod | undefined): boolean {
    if (!pod) {
      return false;
    }

    return (pod.status?.phase ?? "") === "Running";
  }

  private isPodRunning(pod: k8s.V1Pod | undefined): boolean {
    if (!pod) {
      return false;
    }

    const phase = pod.status?.phase ?? "";
    const containersReady = pod.status?.containerStatuses?.every((status) => status.ready) ?? false;
    return phase === "Running" && containersReady;
  }

  private comparePodPriority(candidate: k8s.V1Pod, current: k8s.V1Pod): number {
    return this.getPodPriority(candidate) - this.getPodPriority(current);
  }

  private getPodPriority(pod: k8s.V1Pod): number {
    const ownerKinds = (pod.metadata?.ownerReferences ?? []).map((owner) => owner.kind ?? "");
    const labels = pod.metadata?.labels ?? {};
    const phase = pod.status?.phase ?? "";
    const containersReady = pod.status?.containerStatuses?.every((status) => status.ready) ?? false;

    let score = 0;
    if (ownerKinds.includes("ReplicaSet")) {
      score += 40;
    }
    if (ownerKinds.includes("Job") || labels["job-name"]) {
      score -= 40;
    }
    if (phase === "Running") {
      score += 20;
    }
    if (containersReady) {
      score += 10;
    }
    return score;
  }

  private getWorkspaceNodeConstraints(): NodePoolConstraints {
    return {
      selector: this.parseNodeSelectorConfig("K8S_WORKSPACE_NODE_SELECTOR_JSON", "workspace"),
      tolerations: this.parseTolerationsConfig("K8S_WORKSPACE_TOLERATIONS_JSON", "workspace"),
    };
  }

  private getServingNodeConstraints(): NodePoolConstraints {
    return {
      selector: this.parseNodeSelectorConfig("K8S_SERVING_NODE_SELECTOR_JSON", "serving"),
      tolerations: this.parseTolerationsConfig("K8S_SERVING_TOLERATIONS_JSON", "serving"),
    };
  }

  private getEksSubnetIds(): string[] {
    return (this.configService.get<string>("AWS_EKS_SUBNET_IDS") ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private getNodeGroupDefaults(poolType: ManagedNodeGroupPoolType): ManagedNodeGroupOverview["defaults"] {
    const prefix = poolType === "workspace" ? "AWS_EKS_WORKSPACE_NODE" : "AWS_EKS_SERVING_NODE";
    const instanceTypes = (this.configService.get<string>(`${prefix}_INSTANCE_TYPES`) ?? "t3.large")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    return {
      instanceTypes,
      minSize: Number(this.configService.get<string>(`${prefix}_MIN_SIZE`, "1")),
      maxSize: Number(this.configService.get<string>(`${prefix}_MAX_SIZE`, "3")),
      desiredSize: Number(this.configService.get<string>(`${prefix}_DESIRED_SIZE`, "1")),
      diskSize: Number(this.configService.get<string>(`${prefix}_DISK_SIZE`, "50")),
      capacityType: this.configService.get<string>(`${prefix}_CAPACITY_TYPE`)?.trim() ?? null,
      amiType: this.configService.get<string>(`${prefix}_AMI_TYPE`)?.trim() ?? null,
    };
  }

  private matchesManagedNodeGroup(
    labels: Record<string, string>,
    taints: Array<{ key?: string; value?: string; effect?: string }>,
    constraints: NodePoolConstraints,
  ): boolean {
    const labelsMatch = Object.entries(constraints.selector).every(([key, value]) => labels[key] === value);
    if (!labelsMatch) {
      return false;
    }

    const expectedTaints = constraints.tolerations.filter((item) => item.key && item.effect);
    if (!expectedTaints.length) {
      return true;
    }

    return expectedTaints.every((expected) =>
      taints.some(
        (taint) =>
          taint.key === expected.key &&
          (taint.value ?? "") === (expected.value ?? "") &&
          this.fromEksTaintEffect(taint.effect ?? "") === expected.effect,
      ),
    );
  }

  private async getNodeNamesByNodeGroup(): Promise<Map<string, string[]>> {
    try {
      const result = await this.k8sApiService.listNodes();
      const map = new Map<string, string[]>();
      for (const node of result.items as k8s.V1Node[]) {
        const nodeGroupName = node.metadata?.labels?.["eks.amazonaws.com/nodegroup"];
        const nodeName = node.metadata?.name ?? "";
        if (!nodeGroupName || !nodeName) {
          continue;
        }
        map.set(nodeGroupName, [...(map.get(nodeGroupName) ?? []), nodeName]);
      }
      return map;
    } catch (error) {
      this.logger.warn(`Failed to list nodegroup labels from Kubernetes nodes: ${this.describeError(error)}`);
      return new Map();
    }
  }

  private toEksTaintEffect(effect: string): "NO_SCHEDULE" | "NO_EXECUTE" | "PREFER_NO_SCHEDULE" {
    if (effect === "NoExecute") {
      return "NO_EXECUTE";
    }
    if (effect === "PreferNoSchedule") {
      return "PREFER_NO_SCHEDULE";
    }
    return "NO_SCHEDULE";
  }

  private fromEksTaintEffect(effect: string): string {
    if (effect === "NO_EXECUTE") {
      return "NoExecute";
    }
    if (effect === "PREFER_NO_SCHEDULE") {
      return "PreferNoSchedule";
    }
    return "NoSchedule";
  }

  private parseNodeSelectorConfig(configKey: string, resourceName: string): Record<string, string> {
    const raw = this.configService.get<string>(configKey)?.trim() ?? "";
    if (!raw) {
      return {};
    }

    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return Object.fromEntries(
        Object.entries(parsed).map(([key, value]) => [key, String(value)]),
      );
    } catch (error) {
      this.logger.warn(`Failed to parse ${resourceName} node selector JSON in admin service: ${this.describeError(error)}`);
      return {};
    }
  }

  private parseTolerationsConfig(configKey: string, resourceName: string): k8s.V1Toleration[] {
    const raw = this.configService.get<string>(configKey)?.trim() ?? "";
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw) as Array<Record<string, unknown>>;
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed.map((item) => ({
        key: typeof item.key === "string" ? item.key : undefined,
        operator: typeof item.operator === "string" ? item.operator : undefined,
        value: typeof item.value === "string" ? item.value : undefined,
        effect: typeof item.effect === "string" ? item.effect : undefined,
        tolerationSeconds: typeof item.tolerationSeconds === "number" ? item.tolerationSeconds : undefined,
      }));
    } catch (error) {
      this.logger.warn(`Failed to parse ${resourceName} tolerations JSON in admin service: ${this.describeError(error)}`);
      return [];
    }
  }

  private getPodRequestedResources(pod: k8s.V1Pod | undefined): { cpu: number; memoryGi: number } {
    const container = pod?.spec?.containers?.[0];
    const requests = container?.resources?.requests;
    const limits = container?.resources?.limits;
    return {
      cpu: this.parseCpu((requests?.cpu as string | undefined) ?? (limits?.cpu as string | undefined)),
      memoryGi: this.parseMemoryGi((requests?.memory as string | undefined) ?? (limits?.memory as string | undefined)),
    };
  }

  private matchesNodeSelector(node: k8s.V1Node, selector: Record<string, string>): boolean {
    const labels = node.metadata?.labels ?? {};
    return Object.entries(selector).every(([key, value]) => labels[key] === value);
  }

  private matchesNodePoolConstraints(node: k8s.V1Node, constraints: NodePoolConstraints): boolean {
    if (!this.matchesNodeSelector(node, constraints.selector)) {
      return false;
    }

    return this.matchesNodeTolerations(node, constraints.tolerations);
  }

  private matchesNodeTolerations(node: k8s.V1Node, tolerations: k8s.V1Toleration[]): boolean {
    if (!tolerations.length) {
      return true;
    }

    const taints = (node.spec?.taints ?? []).filter((taint) => taint.effect === "NoSchedule" || taint.effect === "NoExecute");
    if (!taints.length) {
      return false;
    }

    const toleratedTaints = taints.filter((taint) => tolerations.some((toleration) => this.matchesTaint(toleration, taint)));
    return toleratedTaints.length > 0 && toleratedTaints.length === taints.length;
  }

  private matchesTaint(toleration: k8s.V1Toleration, taint: k8s.V1Taint): boolean {
    const operator = toleration.operator ?? "Equal";
    if ((toleration.effect ?? taint.effect) !== taint.effect) {
      return false;
    }

    if (operator === "Exists") {
      return !toleration.key || toleration.key === taint.key;
    }

    return toleration.key === taint.key && (toleration.value ?? "") === (taint.value ?? "");
  }

  private parseCpu(rawValue?: string): number {
    if (!rawValue) {
      return 0;
    }
    if (rawValue.endsWith("m")) {
      return Number(rawValue.slice(0, -1)) / 1000;
    }
    return Number(rawValue);
  }

  private parseMemoryGi(rawValue?: string): number {
    if (!rawValue) {
      return 0;
    }

    const match = rawValue.match(/^([\d.]+)(Ki|Mi|Gi|Ti)?$/);
    if (!match) {
      return 0;
    }

    const value = Number(match[1]);
    const unit = match[2] ?? "";
    if (unit === "Ki") {
      return value / (1024 * 1024);
    }
    if (unit === "Mi") {
      return value / 1024;
    }
    if (unit === "Gi") {
      return value;
    }
    if (unit === "Ti") {
      return value * 1024;
    }
    return value / (1024 * 1024 * 1024);
  }

  private describeError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }
}
