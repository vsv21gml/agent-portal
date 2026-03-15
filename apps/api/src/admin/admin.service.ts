import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import * as k8s from "@kubernetes/client-node";
import { Repository } from "typeorm";
import { AgentDeploymentEntity } from "../agents/entities/agent-deployment.entity";
import { UserEntity } from "../auth/entities/user.entity";
import { GitlabRepoEntity } from "../gitlab/entities/gitlab-repo.entity";
import { ProjectEntity } from "../projects/entities/project.entity";
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

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);
  private readonly kubeClientCore: k8s.CoreV1Api | null;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(WorkspaceSessionEntity)
    private readonly workspaceRepository: Repository<WorkspaceSessionEntity>,
    @InjectRepository(AgentDeploymentEntity)
    private readonly agentRepository: Repository<AgentDeploymentEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projectRepository: Repository<ProjectEntity>,
    @InjectRepository(GitlabRepoEntity)
    private readonly repoRepository: Repository<GitlabRepoEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {
    if (
      this.configService.get<string>("K8S_WORKSPACE_ENABLED", "false") === "true" ||
      this.configService.get<string>("K8S_AGENT_ENABLED", "false") === "true"
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
      this.getNodePoolSummary(this.getWorkspaceNodeSelector()),
    ]);

    const projectMap = new Map(projects.map((project) => [project.id, project]));
    const repoMap = new Map(repos.map((repo) => [repo.id, repo]));
    const userMap = new Map(users.map((user) => [user.id, user]));

    const rows: WorkspaceResourceRow[] = runningSessions.map((session) => {
      const project = projectMap.get(session.projectId);
      const repo = repoMap.get(session.repoId);
      const user = userMap.get(session.userId);
      const pod = podsByDeployment.get(session.deploymentName);

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
        cpu: 1,
        memoryGi: 4,
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
    const namespace = this.configService.get<string>("K8S_AGENT_NAMESPACE", "agent-serving");
    const agents = await this.agentRepository.find({
      where: { namespace },
      order: { createdAt: "DESC" },
    });
    const podsByDeployment = await this.getPodsByDeployment(namespace, "agent-portal/agent-name");
    const runningAgents = agents.filter((agent) => {
      const pod = podsByDeployment.get(agent.deploymentName);
      return this.isPodRunning(pod);
    });
    const projectIds = [...new Set(runningAgents.map((agent) => agent.projectId))];
    const repoIds = [...new Set(runningAgents.map((agent) => agent.repoId))];
    const userIds = [...new Set(runningAgents.map((agent) => agent.ownerUserId))];

    const [projects, repos, users, nodePool] = await Promise.all([
      projectIds.length ? this.projectRepository.findBy(projectIds.map((id) => ({ id }))) : Promise.resolve([]),
      repoIds.length ? this.repoRepository.findBy(repoIds.map((id) => ({ id }))) : Promise.resolve([]),
      userIds.length ? this.userRepository.findBy(userIds.map((id) => ({ id }))) : Promise.resolve([]),
      this.getNodePoolSummary(this.getAgentNodeSelector()),
    ]);

    const projectMap = new Map(projects.map((project) => [project.id, project]));
    const repoMap = new Map(repos.map((repo) => [repo.id, repo]));
    const userMap = new Map(users.map((user) => [user.id, user]));

    const rows: AgentResourceRow[] = runningAgents.map((agent) => {
      const project = projectMap.get(agent.projectId);
      const repo = repoMap.get(agent.repoId);
      const user = userMap.get(agent.ownerUserId);
      const pod = podsByDeployment.get(agent.deploymentName);
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

  private async getWorkspacePodsByDeployment(namespace: string): Promise<Map<string, k8s.V1Pod>> {
    return this.getPodsByDeployment(namespace, "agent-portal/workspace-name");
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
          map.set(deploymentName, pod);
        }
      }
      return map;
    } catch (error) {
      this.logger.warn(`Failed to list workspace pods: ${this.describeError(error)}`);
      return new Map();
    }
  }

  private async getWorkspaceNodePoolSummary(): Promise<WorkspaceResourceOverview["nodePool"]> {
    return this.getNodePoolSummary(this.getWorkspaceNodeSelector());
  }

  private async getNodePoolSummary(selector: Record<string, string>): Promise<WorkspaceResourceOverview["nodePool"]> {
    if (!this.kubeClientCore) {
      return { nodeCount: 0, totalCpu: 0, totalMemoryGi: 0, nodes: [] };
    }

    try {
      const result = await this.kubeClientCore.listNode();
      const matchingNodes = result.items.filter((node) => this.matchesNodeSelector(node, selector));

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

  private isPodRunning(pod: k8s.V1Pod | undefined): boolean {
    if (!pod) {
      return false;
    }

    const phase = pod.status?.phase ?? "";
    const containersReady = pod.status?.containerStatuses?.every((status) => status.ready) ?? false;
    return phase === "Running" && containersReady;
  }

  private getWorkspaceNodeSelector(): Record<string, string> {
    return this.parseNodeSelectorConfig("K8S_WORKSPACE_NODE_SELECTOR_JSON", "workspace");
  }

  private getAgentNodeSelector(): Record<string, string> {
    return this.parseNodeSelectorConfig("K8S_AGENT_NODE_SELECTOR_JSON", "agent");
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
