import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import {
  AMITypes,
  CapacityTypes,
  CreateNodegroupCommand,
  DeleteNodegroupCommand,
  DescribeNodegroupCommand,
  EKSClient,
  ListNodegroupsCommand,
} from "@aws-sdk/client-eks";
import { DescribeInstanceTypesCommand, EC2Client } from "@aws-sdk/client-ec2";
import * as k8s from "@kubernetes/client-node";
import { Repository } from "typeorm";
import { AgentDeploymentEntity } from "../agents/entities/agent-deployment.entity";
import { UserEntity } from "../auth/entities/user.entity";
import { GitlabRepoEntity } from "../gitlab/entities/gitlab-repo.entity";
import { LlmService } from "../llm/llm.service";
import { McpDeploymentEntity } from "../mcps/entities/mcp-deployment.entity";
import { ProjectMemberEntity } from "../projects/entities/project-member.entity";
import { ProjectEntity } from "../projects/entities/project.entity";
import { WorkspaceSessionEntity } from "../workspaces/entities/workspace-session.entity";
import { UpdateManagedNodeGroupScheduleDto } from "./dto/update-managed-nodegroup-schedule.dto";
import { ManagedNodeGroupScheduleEntity } from "./entities/managed-nodegroup-schedule.entity";

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
    displayTotalCpu: number;
    displayTotalMemoryGi: number;
    capacitySource: "configured" | "kubernetes";
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
    nodeGroupName: string;
    instanceTypes: string[];
    minSize: number;
    maxSize: number;
    desiredSize: number;
    diskSize: number;
    capacityType: string | null;
    amiType: string | null;
  };
  schedule: ManagedNodeGroupScheduleView;
  nodeGroups: ManagedNodeGroupRow[];
  message: string | null;
};

type ManagedNodeGroupScheduleView = {
  enabled: boolean;
  timezone: string;
  scaleUpTime: string | null;
  scaleDownTime: string | null;
  nodeGroupName: string | null;
  instanceTypes: string[];
  minSize: number | null;
  maxSize: number | null;
  desiredSize: number | null;
  diskSize: number | null;
  capacityType: string | null;
  amiType: string | null;
  lastScaleUpDate: string | null;
  lastScaleDownDate: string | null;
  lastActionAt: string | null;
  lastActionStatus: string | null;
  lastActionMessage: string | null;
};

type AgentResourceOverview = {
  nodePool: {
    nodeCount: number;
    totalCpu: number;
    totalMemoryGi: number;
    displayTotalCpu: number;
    displayTotalMemoryGi: number;
    capacitySource: "configured" | "kubernetes";
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
    displayTotalCpu: number;
    displayTotalMemoryGi: number;
    capacitySource: "configured" | "kubernetes";
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
export class AdminService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AdminService.name);
  private readonly kubeClientCore: k8s.CoreV1Api | null;
  private readonly eksClient: EKSClient | null;
  private readonly ec2Client: EC2Client | null;
  private readonly instanceCapacityCache = new Map<string, { cpu: number; memoryGi: number } | null>();
  private scheduleTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly configService: ConfigService,
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
    @InjectRepository(ManagedNodeGroupScheduleEntity)
    private readonly managedNodeGroupScheduleRepository: Repository<ManagedNodeGroupScheduleEntity>,
  ) {
    if (
      this.configService.get<string>("K8S_WORKSPACE_ENABLED", "false") === "true" ||
      this.configService.get<string>("K8S_SERVING_ENABLED", this.configService.get<string>("K8S_AGENT_ENABLED", "false")) === "true"
    ) {
      const kc = new k8s.KubeConfig();
      const kubeConfigPath = this.configService.get<string>("KUBECONFIG_PATH");
      if (kubeConfigPath) {
        kc.loadFromFile(kubeConfigPath);
      } else {
        try {
          kc.loadFromCluster();
        } catch {
          kc.loadFromDefault();
        }
      }
      this.kubeClientCore = kc.makeApiClient(k8s.CoreV1Api);
    } else {
      this.kubeClientCore = null;
    }

    const awsRegion = this.configService.get<string>("AWS_REGION", "us-east-1");
    const clusterName = this.configService.get<string>("AWS_EKS_CLUSTER_NAME")?.trim() ?? "";
    const subnetIds = this.getEksSubnetIds();
    const nodeRoleArn = this.configService.get<string>("AWS_EKS_NODE_ROLE_ARN")?.trim() ?? "";
    this.eksClient = clusterName && subnetIds.length > 0 && nodeRoleArn ? new EKSClient({ region: awsRegion }) : null;
    this.ec2Client = clusterName && subnetIds.length > 0 && nodeRoleArn ? new EC2Client({ region: awsRegion }) : null;
  }

  onModuleInit(): void {
    this.scheduleTimer = setInterval(() => {
      void this.runManagedNodeGroupSchedules();
    }, 60_000);
    void this.runManagedNodeGroupSchedules();
  }

  onModuleDestroy(): void {
    if (this.scheduleTimer) {
      clearInterval(this.scheduleTimer);
      this.scheduleTimer = null;
    }
  }

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
      this.getNodePoolSummary("workspace", this.getWorkspaceNodeConstraints()),
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
        cpuUsagePercent: nodePool.displayTotalCpu > 0 ? Math.min(100, (usedCpu / nodePool.displayTotalCpu) * 100) : 0,
        memoryUsagePercent: nodePool.displayTotalMemoryGi > 0 ? Math.min(100, (usedMemoryGi / nodePool.displayTotalMemoryGi) * 100) : 0,
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
      this.getNodePoolSummary("serving", this.getServingNodeConstraints()),
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
        cpuUsagePercent: nodePool.displayTotalCpu > 0 ? Math.min(100, (usedCpu / nodePool.displayTotalCpu) * 100) : 0,
        memoryUsagePercent: nodePool.displayTotalMemoryGi > 0 ? Math.min(100, (usedMemoryGi / nodePool.displayTotalMemoryGi) * 100) : 0,
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
      this.getNodePoolSummary("serving", this.getServingNodeConstraints()),
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
        cpuUsagePercent: nodePool.displayTotalCpu > 0 ? Math.min(100, (usedCpu / nodePool.displayTotalCpu) * 100) : 0,
        memoryUsagePercent: nodePool.displayTotalMemoryGi > 0 ? Math.min(100, (usedMemoryGi / nodePool.displayTotalMemoryGi) * 100) : 0,
      },
      rows,
    };
  }

  async getManagedNodeGroupOverview(poolType: ManagedNodeGroupPoolType): Promise<ManagedNodeGroupOverview> {
    const clusterName = this.configService.get<string>("AWS_EKS_CLUSTER_NAME")?.trim() ?? null;
    const region = this.configService.get<string>("AWS_REGION", "us-east-1");
    const subnetIds = this.getEksSubnetIds();
    const nodeRoleArn = this.configService.get<string>("AWS_EKS_NODE_ROLE_ARN")?.trim() ?? "";
    const constraints = poolType === "workspace" ? this.getWorkspaceNodeConstraints() : this.getServingNodeConstraints();
    const defaults = this.getNodeGroupDefaults(poolType);
    const schedule = await this.getManagedNodeGroupSchedule(poolType);

    if (!this.eksClient || !clusterName) {
      return {
        configured: false,
        poolType,
        clusterName,
        region,
        nodeRoleArnConfigured: Boolean(nodeRoleArn),
        subnetCount: subnetIds.length,
        scheduling: constraints,
        defaults,
        schedule,
        nodeGroups: [],
        message: "AWS_EKS_CLUSTER_NAME, AWS_EKS_NODE_ROLE_ARN, AWS_EKS_SUBNET_IDS, and AWS credentials are required.",
      };
    }

    const nodeNamesByGroup = await this.getNodeNamesByNodeGroup();
    const listed = await this.eksClient.send(new ListNodegroupsCommand({ clusterName }));
    const nodeGroupNames = listed.nodegroups ?? [];
    const described = await Promise.all(
      nodeGroupNames.map(async (nodegroupName) => {
        try {
          const result = await this.eksClient!.send(new DescribeNodegroupCommand({ clusterName, nodegroupName }));
          return result.nodegroup ?? null;
        } catch (error) {
          this.logger.warn(`Failed to describe nodegroup ${nodegroupName}: ${this.describeError(error)}`);
          return null;
        }
      }),
    );

    const nodeGroups = described
      .filter((nodegroup): nodegroup is NonNullable<(typeof described)[number]> => Boolean(nodegroup))
      .filter((nodegroup) => this.matchesManagedNodeGroup(nodegroup.labels ?? {}, nodegroup.taints ?? [], constraints))
      .map((nodegroup) => ({
        nodeGroupName: nodegroup.nodegroupName ?? "-",
        status: nodegroup.status ?? "UNKNOWN",
        desiredSize: nodegroup.scalingConfig?.desiredSize ?? 0,
        minSize: nodegroup.scalingConfig?.minSize ?? 0,
        maxSize: nodegroup.scalingConfig?.maxSize ?? 0,
        diskSize: nodegroup.diskSize ?? null,
        capacityType: nodegroup.capacityType ?? null,
        amiType: nodegroup.amiType ?? null,
        instanceTypes: nodegroup.instanceTypes ?? [],
        labels: Object.fromEntries(Object.entries(nodegroup.labels ?? {}).map(([key, value]) => [key, value ?? ""])),
        taints: (nodegroup.taints ?? []).map((taint) => ({
          key: taint.key ?? "",
          value: taint.value ?? "",
          effect: taint.effect ?? "",
        })),
        matchingNodeCount: (nodeNamesByGroup.get(nodegroup.nodegroupName ?? "") ?? []).length,
        matchingNodeNames: nodeNamesByGroup.get(nodegroup.nodegroupName ?? "") ?? [],
        createdAt: nodegroup.createdAt ? nodegroup.createdAt.toISOString() : null,
      }))
      .sort((left, right) => left.nodeGroupName.localeCompare(right.nodeGroupName));

    return {
      configured: true,
      poolType,
      clusterName,
      region,
      nodeRoleArnConfigured: Boolean(nodeRoleArn),
      subnetCount: subnetIds.length,
      scheduling: constraints,
      defaults,
      schedule,
      nodeGroups,
      message: null,
    };
  }

  async getManagedNodeGroupSchedule(poolType: ManagedNodeGroupPoolType): Promise<ManagedNodeGroupScheduleView> {
    const row = await this.getOrCreateManagedNodeGroupScheduleRow(poolType);
    return this.toManagedNodeGroupScheduleView(row);
  }

  async updateManagedNodeGroupSchedule(
    poolType: ManagedNodeGroupPoolType,
    dto: UpdateManagedNodeGroupScheduleDto,
  ): Promise<ManagedNodeGroupScheduleView> {
    const row = await this.getOrCreateManagedNodeGroupScheduleRow(poolType);
    const timezone = (dto.timezone ?? row.timezone ?? "Asia/Seoul").trim() || "Asia/Seoul";
    const scaleUpTime = this.normalizeScheduleTime(dto.scaleUpTime);
    const scaleDownTime = this.normalizeScheduleTime(dto.scaleDownTime);
    const nodeGroupName = dto.nodeGroupName?.trim() || null;

    if (dto.enabled && (!scaleUpTime || !scaleDownTime || !nodeGroupName)) {
      throw new Error("Enabled schedules require nodegroup name, scale-up time, and scale-down time");
    }
    if (dto.enabled && scaleUpTime === scaleDownTime) {
      throw new Error("Scale-up time and scale-down time must be different");
    }

    row.enabled = Boolean(dto.enabled);
    row.timezone = timezone;
    row.scaleUpTime = scaleUpTime;
    row.scaleDownTime = scaleDownTime;
    row.nodeGroupName = nodeGroupName;
    row.instanceTypes = dto.instanceTypes?.length ? dto.instanceTypes : [];
    row.minSize = this.toNullableInteger(dto.minSize);
    row.maxSize = this.toNullableInteger(dto.maxSize);
    row.desiredSize = this.toNullableInteger(dto.desiredSize);
    row.diskSize = this.toNullableInteger(dto.diskSize);
    row.capacityType = dto.capacityType ?? null;
    row.amiType = dto.amiType?.trim() || null;
    if (!row.enabled) {
      row.lastActionStatus = "disabled";
      row.lastActionMessage = "Automatic nodegroup scheduling is disabled.";
      row.lastActionAt = new Date();
    }

    const saved = await this.managedNodeGroupScheduleRepository.save(row);
    return this.toManagedNodeGroupScheduleView(saved);
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
    const clusterName = this.configService.get<string>("AWS_EKS_CLUSTER_NAME")?.trim() ?? "";
    const nodeRoleArn = this.configService.get<string>("AWS_EKS_NODE_ROLE_ARN")?.trim() ?? "";
    const subnetIds = this.getEksSubnetIds();
    if (!this.eksClient || !clusterName || !nodeRoleArn || subnetIds.length === 0) {
      throw new Error("AWS EKS nodegroup configuration is incomplete");
    }

    const defaults = this.getNodeGroupDefaults(poolType);
    const constraints = poolType === "workspace" ? this.getWorkspaceNodeConstraints() : this.getServingNodeConstraints();
    const nodeGroupName = input.nodeGroupName.trim();
    if (!nodeGroupName) {
      throw new Error("Nodegroup name is required");
    }

    const minSize = input.minSize ?? defaults.minSize;
    const maxSize = input.maxSize ?? defaults.maxSize;
    const desiredSize = input.desiredSize ?? defaults.desiredSize;
    if (minSize > maxSize || desiredSize < minSize || desiredSize > maxSize) {
      throw new Error("Scaling configuration is invalid");
    }

    await this.eksClient.send(
      new CreateNodegroupCommand({
        clusterName,
        nodegroupName: nodeGroupName,
        nodeRole: nodeRoleArn,
        subnets: subnetIds,
        scalingConfig: {
          minSize,
          maxSize,
          desiredSize,
        },
        instanceTypes: input.instanceTypes?.length ? input.instanceTypes : defaults.instanceTypes,
        diskSize: input.diskSize ?? defaults.diskSize,
        capacityType: ((input.capacityType ?? defaults.capacityType ?? undefined) as CapacityTypes | undefined),
        amiType: ((input.amiType ?? defaults.amiType ?? undefined) as AMITypes | undefined),
        labels: constraints.selector,
        taints: constraints.tolerations
          .filter((item) => item.key && item.effect)
          .map((item) => ({
            key: item.key!,
            value: item.value ?? "",
            effect: this.toEksTaintEffect(item.effect!),
          })),
      }),
    );

    return this.getManagedNodeGroupOverview(poolType);
  }

  async deleteManagedNodeGroup(poolType: ManagedNodeGroupPoolType, nodeGroupName: string): Promise<ManagedNodeGroupOverview> {
    const clusterName = this.configService.get<string>("AWS_EKS_CLUSTER_NAME")?.trim() ?? "";
    if (!this.eksClient || !clusterName) {
      throw new Error("AWS EKS nodegroup configuration is incomplete");
    }

    await this.eksClient.send(
      new DeleteNodegroupCommand({
        clusterName,
        nodegroupName: nodeGroupName,
      }),
    );

    return this.getManagedNodeGroupOverview(poolType);
  }

  private async runManagedNodeGroupSchedules(): Promise<void> {
    const schedules = await this.managedNodeGroupScheduleRepository.find();
    for (const schedule of schedules) {
      if (!schedule.enabled) {
        continue;
      }
      try {
        await this.applyManagedNodeGroupSchedule(schedule);
      } catch (error) {
        schedule.lastActionAt = new Date();
        schedule.lastActionStatus = "failed";
        schedule.lastActionMessage = this.describeError(error);
        await this.managedNodeGroupScheduleRepository.save(schedule);
        this.logger.warn(`Failed to apply managed nodegroup schedule pool=${schedule.poolType}: ${this.describeError(error)}`);
      }
    }
  }

  private async applyManagedNodeGroupSchedule(schedule: ManagedNodeGroupScheduleEntity): Promise<void> {
    const localTime = this.getScheduleLocalTime(schedule.timezone || "Asia/Seoul");
    if (schedule.scaleUpTime && localTime.time === schedule.scaleUpTime && schedule.lastScaleUpDate !== localTime.date) {
      await this.executeManagedNodeGroupScaleUp(schedule, localTime.date);
      return;
    }
    if (schedule.scaleDownTime && localTime.time === schedule.scaleDownTime && schedule.lastScaleDownDate !== localTime.date) {
      await this.executeManagedNodeGroupScaleDown(schedule, localTime.date);
    }
  }

  private async executeManagedNodeGroupScaleUp(schedule: ManagedNodeGroupScheduleEntity, localDate: string): Promise<void> {
    const nodeGroupName = schedule.nodeGroupName?.trim();
    if (!nodeGroupName) {
      throw new Error("Scheduled nodegroup name is missing");
    }

    const overview = await this.getManagedNodeGroupOverview(schedule.poolType);
    const existing = overview.nodeGroups.find((group) => group.nodeGroupName === nodeGroupName);
    if (!existing) {
      await this.createManagedNodeGroup(schedule.poolType, {
        nodeGroupName,
        instanceTypes: schedule.instanceTypes ?? undefined,
        minSize: schedule.minSize ?? undefined,
        maxSize: schedule.maxSize ?? undefined,
        desiredSize: schedule.desiredSize ?? undefined,
        diskSize: schedule.diskSize ?? undefined,
        capacityType: schedule.capacityType ?? undefined,
        amiType: schedule.amiType ?? undefined,
      });
    }

    schedule.lastScaleUpDate = localDate;
    schedule.lastActionAt = new Date();
    schedule.lastActionStatus = "scaled_up";
    schedule.lastActionMessage = existing ? `Nodegroup ${nodeGroupName} was already present.` : `Created nodegroup ${nodeGroupName}.`;
    await this.managedNodeGroupScheduleRepository.save(schedule);
  }

  private async executeManagedNodeGroupScaleDown(schedule: ManagedNodeGroupScheduleEntity, localDate: string): Promise<void> {
    const nodeGroupName = schedule.nodeGroupName?.trim();
    if (!nodeGroupName) {
      throw new Error("Scheduled nodegroup name is missing");
    }

    const overview = await this.getManagedNodeGroupOverview(schedule.poolType);
    const existing = overview.nodeGroups.find((group) => group.nodeGroupName === nodeGroupName);
    if (existing) {
      await this.deleteManagedNodeGroup(schedule.poolType, nodeGroupName);
    }

    schedule.lastScaleDownDate = localDate;
    schedule.lastActionAt = new Date();
    schedule.lastActionStatus = "scaled_down";
    schedule.lastActionMessage = existing ? `Deleted nodegroup ${nodeGroupName}.` : `Nodegroup ${nodeGroupName} was already absent.`;
    await this.managedNodeGroupScheduleRepository.save(schedule);
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
    if (!this.kubeClientCore) {
      return new Map();
    }

    try {
      const result = await this.kubeClientCore.listNamespacedPod({ namespace });
      const map = new Map<string, k8s.V1Pod>();
      for (const pod of result.items) {
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
    return this.getNodePoolSummary("workspace", this.getWorkspaceNodeConstraints());
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

  private async getNodePoolSummary(
    poolType: ManagedNodeGroupPoolType,
    constraints: NodePoolConstraints,
  ): Promise<WorkspaceResourceOverview["nodePool"]> {
    const fallback = {
      nodeCount: 0,
      totalCpu: 0,
      totalMemoryGi: 0,
      displayTotalCpu: 0,
      displayTotalMemoryGi: 0,
      capacitySource: "kubernetes" as const,
      nodes: [],
    };

    if (!this.kubeClientCore) {
      return fallback;
    }

    try {
      const result = await this.kubeClientCore.listNode();
      const matchingNodes = result.items.filter((node) => this.matchesNodePoolConstraints(node, constraints));
      const totalCpu = matchingNodes.reduce((sum, node) => sum + this.parseCpu(node.status?.capacity?.cpu), 0);
      const totalMemoryGi = matchingNodes.reduce((sum, node) => sum + this.parseMemoryGi(node.status?.capacity?.memory), 0);
      const configuredCapacity = await this.getConfiguredNodePoolCapacity(poolType, constraints);

      return {
        nodeCount: matchingNodes.length,
        totalCpu,
        totalMemoryGi,
        displayTotalCpu: configuredCapacity?.cpu ?? totalCpu,
        displayTotalMemoryGi: configuredCapacity?.memoryGi ?? totalMemoryGi,
        capacitySource: configuredCapacity ? "configured" : "kubernetes",
        nodes: matchingNodes.map((node) => ({
          nodeName: node.metadata?.name ?? "-",
          cpu: this.parseCpu(node.status?.capacity?.cpu),
          memoryGi: this.parseMemoryGi(node.status?.capacity?.memory),
        })),
      };
    } catch (error) {
      this.logger.warn(`Failed to list nodes: ${this.describeError(error)}`);
      return fallback;
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

  private async getOrCreateManagedNodeGroupScheduleRow(poolType: ManagedNodeGroupPoolType): Promise<ManagedNodeGroupScheduleEntity> {
    const existing = await this.managedNodeGroupScheduleRepository.findOne({ where: { poolType } });
    if (existing) {
      return existing;
    }

    await this.managedNodeGroupScheduleRepository.upsert(
      this.managedNodeGroupScheduleRepository.create({
        poolType,
        enabled: false,
        timezone: "Asia/Seoul",
        scaleUpTime: null,
        scaleDownTime: null,
        nodeGroupName: null,
        instanceTypes: [],
        minSize: null,
        maxSize: null,
        desiredSize: null,
        diskSize: null,
        capacityType: null,
        amiType: null,
        lastScaleUpDate: null,
        lastScaleDownDate: null,
        lastActionAt: null,
        lastActionStatus: null,
        lastActionMessage: null,
      }),
      ["poolType"],
    );

    return this.managedNodeGroupScheduleRepository.findOneByOrFail({ poolType });
  }

  private toManagedNodeGroupScheduleView(row: ManagedNodeGroupScheduleEntity): ManagedNodeGroupScheduleView {
    return {
      enabled: row.enabled,
      timezone: row.timezone ?? "Asia/Seoul",
      scaleUpTime: row.scaleUpTime ?? null,
      scaleDownTime: row.scaleDownTime ?? null,
      nodeGroupName: row.nodeGroupName ?? null,
      instanceTypes: row.instanceTypes ?? [],
      minSize: row.minSize ?? null,
      maxSize: row.maxSize ?? null,
      desiredSize: row.desiredSize ?? null,
      diskSize: row.diskSize ?? null,
      capacityType: row.capacityType ?? null,
      amiType: row.amiType ?? null,
      lastScaleUpDate: row.lastScaleUpDate ?? null,
      lastScaleDownDate: row.lastScaleDownDate ?? null,
      lastActionAt: row.lastActionAt ? row.lastActionAt.toISOString() : null,
      lastActionStatus: row.lastActionStatus ?? null,
      lastActionMessage: row.lastActionMessage ?? null,
    };
  }

  private normalizeScheduleTime(value: string | null | undefined): string | null {
    const normalized = value?.trim() ?? "";
    if (!normalized) {
      return null;
    }

    const match = /^(\d{2}):(\d{2})$/.exec(normalized);
    if (!match) {
      throw new Error("Schedule time must use HH:mm format");
    }

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) {
      throw new Error("Schedule time must use HH:mm format");
    }

    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }

  private toNullableInteger(value: number | null | undefined): number | null {
    if (value === null || value === undefined) {
      return null;
    }
    return Number.isFinite(value) ? Math.trunc(value) : null;
  }

  private getScheduleLocalTime(timezone: string): { date: string; time: string } {
    const formatter = new Intl.DateTimeFormat("sv-SE", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(new Date());
    const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
    return {
      date: `${pick("year")}-${pick("month")}-${pick("day")}`,
      time: `${pick("hour")}:${pick("minute")}`,
    };
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
    const defaultNodeGroupName =
      this.configService.get<string>(poolType === "workspace" ? "AWS_EKS_WORKSPACE_NODEGROUP_NAME" : "AWS_EKS_SERVING_NODEGROUP_NAME")?.trim() ??
      (poolType === "workspace" ? "portal-workspace" : "portal-serving");
    return {
      nodeGroupName: defaultNodeGroupName,
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
    if (!this.kubeClientCore) {
      return new Map();
    }

    try {
      const result = await this.kubeClientCore.listNode();
      const map = new Map<string, string[]>();
      for (const node of result.items) {
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

  private async getConfiguredNodePoolCapacity(
    poolType: ManagedNodeGroupPoolType,
    constraints: NodePoolConstraints,
  ): Promise<{ cpu: number; memoryGi: number } | null> {
    const clusterName = this.configService.get<string>("AWS_EKS_CLUSTER_NAME")?.trim() ?? "";
    if (!this.eksClient || !this.ec2Client || !clusterName) {
      return null;
    }

    try {
      const listed = await this.eksClient.send(new ListNodegroupsCommand({ clusterName }));
      const nodeGroupNames = listed.nodegroups ?? [];
      if (!nodeGroupNames.length) {
        return null;
      }

      const described = await Promise.all(
        nodeGroupNames.map(async (nodegroupName) => {
          try {
            const result = await this.eksClient!.send(new DescribeNodegroupCommand({ clusterName, nodegroupName }));
            return result.nodegroup ?? null;
          } catch (error) {
            this.logger.warn(`Failed to describe nodegroup ${nodegroupName} for ${poolType} capacity: ${this.describeError(error)}`);
            return null;
          }
        }),
      );

      let totalCpu = 0;
      let totalMemoryGi = 0;
      for (const nodegroup of described) {
        if (!nodegroup) {
          continue;
        }
        if (!this.matchesManagedNodeGroup(nodegroup.labels ?? {}, nodegroup.taints ?? [], constraints)) {
          continue;
        }

        const instanceType = nodegroup.instanceTypes?.[0]?.trim();
        const desiredSize = nodegroup.scalingConfig?.desiredSize ?? 0;
        if (!instanceType || desiredSize <= 0) {
          continue;
        }

        const capacity = await this.getInstanceTypeCapacity(instanceType);
        if (!capacity) {
          continue;
        }

        totalCpu += capacity.cpu * desiredSize;
        totalMemoryGi += capacity.memoryGi * desiredSize;
      }

      return totalCpu > 0 || totalMemoryGi > 0 ? { cpu: totalCpu, memoryGi: totalMemoryGi } : null;
    } catch (error) {
      this.logger.warn(`Failed to estimate ${poolType} node capacity from EKS configuration: ${this.describeError(error)}`);
      return null;
    }
  }

  private async getInstanceTypeCapacity(instanceType: string): Promise<{ cpu: number; memoryGi: number } | null> {
    const normalized = instanceType.trim();
    if (!normalized) {
      return null;
    }

    if (this.instanceCapacityCache.has(normalized)) {
      return this.instanceCapacityCache.get(normalized) ?? null;
    }

    if (!this.ec2Client) {
      return null;
    }

    try {
      const response = await this.ec2Client.send(
        new DescribeInstanceTypesCommand({
          InstanceTypes: [normalized as never],
        }),
      );
      const details = response.InstanceTypes?.[0];
      const cpu = details?.VCpuInfo?.DefaultVCpus ?? 0;
      const memoryMiB = details?.MemoryInfo?.SizeInMiB ?? 0;
      const capacity = cpu > 0 || memoryMiB > 0 ? { cpu, memoryGi: memoryMiB / 1024 } : null;
      this.instanceCapacityCache.set(normalized, capacity);
      return capacity;
    } catch (error) {
      this.logger.warn(`Failed to describe EC2 instance type ${normalized}: ${this.describeError(error)}`);
      this.instanceCapacityCache.set(normalized, null);
      return null;
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
