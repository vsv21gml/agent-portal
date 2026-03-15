import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import * as k8s from "@kubernetes/client-node";
import { Repository } from "typeorm";
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

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);
  private readonly kubeClientCore: k8s.CoreV1Api | null;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(WorkspaceSessionEntity)
    private readonly workspaceRepository: Repository<WorkspaceSessionEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projectRepository: Repository<ProjectEntity>,
    @InjectRepository(GitlabRepoEntity)
    private readonly repoRepository: Repository<GitlabRepoEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {
    if (this.configService.get<string>("K8S_WORKSPACE_ENABLED", "false") === "true") {
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

    const runningSessions = sessions.filter((session) => session.status === "running");
    const projectIds = [...new Set(runningSessions.map((session) => session.projectId))];
    const repoIds = [...new Set(runningSessions.map((session) => session.repoId))];
    const userIds = [...new Set(runningSessions.map((session) => session.userId))];

    const [projects, repos, users, podsByDeployment, nodePool] = await Promise.all([
      projectIds.length ? this.projectRepository.findBy(projectIds.map((id) => ({ id }))) : Promise.resolve([]),
      repoIds.length ? this.repoRepository.findBy(repoIds.map((id) => ({ id }))) : Promise.resolve([]),
      userIds.length ? this.userRepository.findBy(userIds.map((id) => ({ id }))) : Promise.resolve([]),
      this.getWorkspacePodsByDeployment(namespace),
      this.getWorkspaceNodePoolSummary(),
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
        status: session.status,
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

  private async getWorkspacePodsByDeployment(namespace: string): Promise<Map<string, k8s.V1Pod>> {
    if (!this.kubeClientCore) {
      return new Map();
    }

    try {
      const result = await this.kubeClientCore.listNamespacedPod({ namespace });
      const map = new Map<string, k8s.V1Pod>();
      for (const pod of result.items) {
        const deploymentName = pod.metadata?.labels?.["agent-portal/workspace-name"];
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
    if (!this.kubeClientCore) {
      return { nodeCount: 0, totalCpu: 0, totalMemoryGi: 0 };
    }

    const nodeSelector = this.getWorkspaceNodeSelector();

    try {
      const result = await this.kubeClientCore.listNode();
      const matchingNodes = result.items.filter((node) => this.matchesNodeSelector(node, nodeSelector));

      return {
        nodeCount: matchingNodes.length,
        totalCpu: matchingNodes.reduce((sum, node) => sum + this.parseCpu(node.status?.allocatable?.cpu), 0),
        totalMemoryGi: matchingNodes.reduce((sum, node) => sum + this.parseMemoryGi(node.status?.allocatable?.memory), 0),
      };
    } catch (error) {
      this.logger.warn(`Failed to list workspace nodes: ${this.describeError(error)}`);
      return { nodeCount: 0, totalCpu: 0, totalMemoryGi: 0 };
    }
  }

  private getWorkspaceNodeSelector(): Record<string, string> {
    const raw = this.configService.get<string>("K8S_WORKSPACE_NODE_SELECTOR_JSON")?.trim() ?? "";
    if (!raw) {
      return {};
    }

    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return Object.fromEntries(
        Object.entries(parsed).map(([key, value]) => [key, String(value)]),
      );
    } catch (error) {
      this.logger.warn(`Failed to parse workspace node selector JSON in admin service: ${this.describeError(error)}`);
      return {};
    }
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
