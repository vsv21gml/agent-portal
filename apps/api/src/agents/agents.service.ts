import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import * as k8s from "@kubernetes/client-node";
import { Repository } from "typeorm";
import { AuthService } from "../auth/auth.service";
import { GitlabService } from "../gitlab/gitlab.service";
import { GitlabRepoEntity } from "../gitlab/entities/gitlab-repo.entity";
import { LlmService } from "../llm/llm.service";
import { ProjectsService } from "../projects/projects.service";
import { CreateAgentDto } from "./dto/create-agent.dto";
import { AgentDeploymentEntity } from "./entities/agent-deployment.entity";

@Injectable()
export class AgentsService {
  private readonly logger = new Logger(AgentsService.name);
  private readonly kubeClientApps: k8s.AppsV1Api | null;
  private readonly kubeClientBatch: k8s.BatchV1Api | null;
  private readonly kubeClientCore: k8s.CoreV1Api | null;
  private readonly kubeClientNetworking: k8s.NetworkingV1Api | null;

  constructor(
    private readonly configService: ConfigService,
    private readonly projectsService: ProjectsService,
    private readonly gitlabService: GitlabService,
    private readonly authService: AuthService,
    private readonly llmService: LlmService,
    @InjectRepository(AgentDeploymentEntity)
    private readonly agentRepository: Repository<AgentDeploymentEntity>,
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
    this.kubeClientApps = kc.makeApiClient(k8s.AppsV1Api);
    this.kubeClientBatch = kc.makeApiClient(k8s.BatchV1Api);
    this.kubeClientCore = kc.makeApiClient(k8s.CoreV1Api);
    this.kubeClientNetworking = kc.makeApiClient(k8s.NetworkingV1Api);
  }

  async createAgent(dto: CreateAgentDto, userId: string): Promise<AgentDeploymentEntity> {
    await this.projectsService.getProject(dto.projectId);
    const repo = await this.gitlabService.getRepo(dto.projectId, dto.repoId);
    const user = await this.authService.findById(userId);
    const normalizedAgentName = this.sanitizeName(dto.agentName);
    const namespace = this.configService.get<string>("K8S_AGENT_NAMESPACE", "agent-serving");
    const id = crypto.randomUUID();
    const nameSuffix = id.replace(/-/g, "").slice(0, 12);
    const deploymentName = `agent-${nameSuffix}`;
    const buildJobName = `${deploymentName}-build`;
    const serviceName = deploymentName;
    const ingressName = `${deploymentName}-ing`;
    const imageTag = id;
    const imageUrl = `${dto.ecrRepository.replace(/\/+$/, "")}:${imageTag}`;
    const endpointUrl = this.buildAgentEndpointUrl(deploymentName);
    const agentKey = await this.llmService.ensureProjectVirtualKey(dto.projectId, userId, `agent-${id}`);

    const agent = await this.agentRepository.save(
      this.agentRepository.create({
        id,
        projectId: dto.projectId,
        repoId: dto.repoId,
        ownerUserId: userId,
        agentName: normalizedAgentName,
        description: dto.description?.trim() ?? "",
        dockerfilePath: dto.dockerfilePath?.trim() || "./Dockerfile",
        ecrRepository: dto.ecrRepository.trim(),
        imageTag,
        imageUrl,
        endpointUrl,
        status: "building",
        namespace,
        buildJobName,
        deploymentName,
        serviceName,
        ingressName,
        lastMessage: "Build requested",
        litellmApiKey: agentKey?.apiKey ?? null,
      }),
    );

    await this.ensureNamespace(namespace);
    await this.ensureBuildJob(agent, repo, {
      gitUserName: user?.displayName?.trim() || user?.email || "Agent User",
      gitUserEmail: user?.email || "agent@example.com",
      gitlabToken: this.configService.get<string>("GITLAB_TOKEN")?.trim() ?? "",
      liteLlmApiKey: agent.litellmApiKey ?? "",
    });

    return this.refreshAgentStatus(agent);
  }

  async listByProject(projectId: string, _userId: string): Promise<AgentDeploymentEntity[]> {
    const agents = await this.agentRepository.find({
      where: { projectId },
      order: { createdAt: "DESC" },
    });
    return Promise.all(agents.map((agent) => this.refreshAgentStatus(agent)));
  }

  async getAgent(agentId: string, _userId: string): Promise<AgentDeploymentEntity> {
    const agent = await this.agentRepository.findOneByOrFail({ id: agentId });
    return this.refreshAgentStatus(agent);
  }

  async getAgentLogs(agentId: string, _userId: string): Promise<{ logs: string }> {
    const agent = await this.agentRepository.findOneByOrFail({ id: agentId });
    await this.refreshAgentStatus(agent);

    if (agent.status === "building" || agent.status === "failed") {
      const buildPod = await this.findFirstPodByLabel(agent.namespace, "job-name", agent.buildJobName);
      if (!buildPod) {
        return { logs: "" };
      }
      const response = await this.kubeClientCore!.readNamespacedPodLog({
        namespace: agent.namespace,
        name: buildPod.metadata?.name ?? "",
        container: buildPod.spec?.containers?.some((item) => item.name === "kaniko") ? "kaniko" : undefined,
      });
      return { logs: response };
    }

    const pod = await this.findFirstPodByLabel(agent.namespace, "agent-portal/agent-name", agent.deploymentName);
    if (!pod) {
      return { logs: "" };
    }
    const response = await this.kubeClientCore!.readNamespacedPodLog({
      namespace: agent.namespace,
      name: pod.metadata?.name ?? "",
    });
    return { logs: response };
  }

  private async refreshAgentStatus(agent: AgentDeploymentEntity): Promise<AgentDeploymentEntity> {
    if (agent.status === "building" || agent.status === "deploying") {
      const refreshed = await this.refreshBuildAndDeployStatus(agent);
      return refreshed;
    }

    if (agent.status === "running") {
      const deployment = await this.safeReadDeployment(agent);
      const readyReplicas = deployment?.status?.readyReplicas ?? 0;
      const desiredReplicas = deployment?.spec?.replicas ?? 1;
      if (readyReplicas < desiredReplicas || !(await this.checkEndpointReady(agent.endpointUrl))) {
        agent.status = "deploying";
        agent.lastMessage = "Waiting for serving endpoint";
        return this.agentRepository.save(agent);
      }
    }

    return agent;
  }

  private async refreshBuildAndDeployStatus(agent: AgentDeploymentEntity): Promise<AgentDeploymentEntity> {
    const job = await this.safeReadJob(agent);
    const succeeded = job?.status?.succeeded ?? 0;
    const failed = job?.status?.failed ?? 0;

    if (failed > 0) {
      agent.status = "failed";
      agent.lastMessage = "Build job failed";
      return this.agentRepository.save(agent);
    }

    if (succeeded > 0) {
      const deployment = await this.safeReadDeployment(agent);
      if (!deployment) {
        await this.ensureServingResources(agent);
        agent.status = "deploying";
        agent.lastMessage = "Build complete. Deploying agent.";
        return this.agentRepository.save(agent);
      }

      const readyReplicas = deployment.status?.readyReplicas ?? 0;
      const desiredReplicas = deployment.spec?.replicas ?? 1;
      const endpointReady = await this.checkEndpointReady(agent.endpointUrl);
      agent.status = readyReplicas >= desiredReplicas && endpointReady ? "running" : "deploying";
      agent.lastMessage = agent.status === "running" ? "Agent is ready." : "Waiting for serving endpoint";
      return this.agentRepository.save(agent);
    }

    return agent;
  }

  private async ensureBuildJob(
    agent: AgentDeploymentEntity,
    repo: GitlabRepoEntity,
    options: { gitUserName: string; gitUserEmail: string; gitlabToken: string; liteLlmApiKey: string },
  ): Promise<void> {
    const repoCloneUrl = repo.cloneUrl ?? repo.webUrl?.concat(".git") ?? "";
    const dockerfilePath = this.normalizeDockerfilePath(agent.dockerfilePath);
    const cloneScript = [
      "set -e",
      `TARGET_URL="${repoCloneUrl}"`,
      "mkdir -p /workspace",
      "if [ -n \"$TARGET_URL\" ] && [ -n \"$GITLAB_TOKEN\" ] && echo \"$TARGET_URL\" | grep -q '^https://'; then",
      "  TARGET_URL=$(echo \"$TARGET_URL\" | sed \"s#https://#https://oauth2:${GITLAB_TOKEN}@#\")",
      "fi",
      "git clone \"$TARGET_URL\" /workspace/repo",
    ].join("\n");
    const validateScript = [
      "set -e",
      `if [ ! -f "/workspace/repo/${dockerfilePath}" ]; then echo "Dockerfile not found"; exit 1; fi`,
      "if ! grep -R -E -q \"LITELLM_API_KEY\" /workspace/repo; then echo \"LITELLM_API_KEY usage not found\"; exit 1; fi",
      "if ! grep -R -E -q \"A2A|a2a\" /workspace/repo; then echo \"A2A usage not found\"; exit 1; fi",
      "echo \"Validation passed\"",
    ].join("\n");

    await this.kubeClientBatch!.createNamespacedJob({
      namespace: agent.namespace,
      body: {
        apiVersion: "batch/v1",
        kind: "Job",
        metadata: {
          name: agent.buildJobName,
          labels: this.getAgentLabels(agent),
        },
        spec: {
          backoffLimit: 0,
          template: {
            metadata: {
              labels: this.getAgentLabels(agent),
            },
            spec: {
              restartPolicy: "Never",
              nodeSelector: this.getAgentNodeSelector(),
              tolerations: this.getAgentTolerations(),
              initContainers: [
                {
                  name: "clone-source",
                  image: this.configService.get<string>("AGENT_GIT_IMAGE", "alpine/git:2.47.2"),
                  command: ["sh", "-c", cloneScript],
                  env: [{ name: "GITLAB_TOKEN", value: options.gitlabToken }],
                  volumeMounts: [{ name: "workspace", mountPath: "/workspace" }],
                },
                {
                  name: "validate-source",
                  image: this.configService.get<string>("AGENT_VALIDATOR_IMAGE", "node:24-alpine"),
                  command: ["sh", "-c", validateScript],
                  volumeMounts: [{ name: "workspace", mountPath: "/workspace" }],
                },
              ],
              containers: [
                {
                  name: "kaniko",
                  image: this.configService.get<string>("KANIKO_EXECUTOR_IMAGE", "gcr.io/kaniko-project/executor:latest"),
                  args: [
                    `--context=/workspace/repo`,
                    `--dockerfile=/workspace/repo/${dockerfilePath}`,
                    `--destination=${agent.imageUrl}`,
                    "--snapshot-mode=redo",
                    "--cache=false",
                  ],
                  volumeMounts: [{ name: "workspace", mountPath: "/workspace" }],
                },
              ],
              volumes: [{ name: "workspace", emptyDir: {} }],
            },
          },
        },
      } as k8s.V1Job,
    });
  }

  private async ensureServingResources(agent: AgentDeploymentEntity): Promise<void> {
    await this.ensureAgentDeployment(agent);
    await this.ensureAgentService(agent);
    await this.ensureAgentIngress(agent);
  }

  private async ensureAgentDeployment(agent: AgentDeploymentEntity): Promise<void> {
    await this.kubeClientApps!.createNamespacedDeployment({
      namespace: agent.namespace,
      body: {
        apiVersion: "apps/v1",
        kind: "Deployment",
        metadata: {
          name: agent.deploymentName,
          labels: this.getAgentLabels(agent),
        },
        spec: {
          replicas: 1,
          selector: { matchLabels: this.getAgentSelectorLabels(agent) },
          template: {
            metadata: {
              labels: {
                ...this.getAgentLabels(agent),
                ...this.getAgentSelectorLabels(agent),
              },
            },
            spec: {
              nodeSelector: this.getAgentNodeSelector(),
              tolerations: this.getAgentTolerations(),
              containers: [
                {
                  name: "agent",
                  image: agent.imageUrl,
                  imagePullPolicy: "Always",
                  ports: [{ containerPort: 8080 }],
                  env: [
                    { name: "PORT", value: "8080" },
                    { name: "LITELLM_API_KEY", value: agent.litellmApiKey ?? "" },
                    { name: "AGENT_NAME", value: agent.agentName },
                    { name: "AGENT_DESCRIPTION", value: agent.description },
                  ],
                },
              ],
            },
          },
        },
      } as k8s.V1Deployment,
    });
  }

  private async ensureAgentService(agent: AgentDeploymentEntity): Promise<void> {
    await this.kubeClientCore!.createNamespacedService({
      namespace: agent.namespace,
      body: {
        apiVersion: "v1",
        kind: "Service",
        metadata: { name: agent.serviceName, labels: this.getAgentLabels(agent) },
        spec: {
          selector: this.getAgentSelectorLabels(agent),
          ports: [{ port: 8080, targetPort: 8080 }],
        },
      } as k8s.V1Service,
    });
  }

  private async ensureAgentIngress(agent: AgentDeploymentEntity): Promise<void> {
    const { host, ingressPath } = this.parseEndpoint(agent.endpointUrl);
    const ingressClassName = this.configService.get<string>("K8S_AGENT_INGRESS_CLASS", "nginx");
    await this.kubeClientNetworking!.createNamespacedIngress({
      namespace: agent.namespace,
      body: {
        apiVersion: "networking.k8s.io/v1",
        kind: "Ingress",
        metadata: {
          name: agent.ingressName,
          labels: this.getAgentLabels(agent),
          annotations: {
            "kubernetes.io/ingress.class": ingressClassName,
            ...this.getAgentIngressAnnotations(),
          },
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
                    backend: { service: { name: agent.serviceName, port: { number: 8080 } } },
                  },
                ],
              },
            },
          ],
        },
      } as k8s.V1Ingress,
    });
  }

  private async ensureNamespace(namespace: string): Promise<void> {
    try {
      await this.kubeClientCore!.readNamespace({ name: namespace });
    } catch {
      await this.kubeClientCore!.createNamespace({
        body: { apiVersion: "v1", kind: "Namespace", metadata: { name: namespace } },
      });
    }
  }

  private async safeReadJob(agent: AgentDeploymentEntity): Promise<k8s.V1Job | null> {
    try {
      return await this.kubeClientBatch!.readNamespacedJob({ namespace: agent.namespace, name: agent.buildJobName });
    } catch {
      return null;
    }
  }

  private async safeReadDeployment(agent: AgentDeploymentEntity): Promise<k8s.V1Deployment | null> {
    try {
      return await this.kubeClientApps!.readNamespacedDeployment({ namespace: agent.namespace, name: agent.deploymentName });
    } catch {
      return null;
    }
  }

  private async findFirstPodByLabel(namespace: string, key: string, value: string): Promise<k8s.V1Pod | null> {
    const result = await this.kubeClientCore!.listNamespacedPod({
      namespace,
      labelSelector: `${key}=${value}`,
    });
    return result.items[0] ?? null;
  }

  private getAgentLabels(agent: AgentDeploymentEntity): Record<string, string> {
    return {
      "app.kubernetes.io/managed-by": "agent-portal",
      "agent-portal/agent-id": agent.id,
      "agent-portal/agent-name": agent.deploymentName,
      "agent-portal/agent-resource": "true",
    };
  }

  private getAgentSelectorLabels(agent: AgentDeploymentEntity): Record<string, string> {
    return {
      "agent-portal/agent-name": agent.deploymentName,
    };
  }

  private getAgentNodeSelector(): Record<string, string> | undefined {
    const raw = this.configService.get<string>("K8S_AGENT_NODE_SELECTOR_JSON")?.trim() ?? "";
    if (!raw) {
      return undefined;
    }
    return JSON.parse(raw) as Record<string, string>;
  }

  private getAgentTolerations(): k8s.V1Toleration[] | undefined {
    const raw = this.configService.get<string>("K8S_AGENT_TOLERATIONS_JSON")?.trim() ?? "";
    if (!raw) {
      return undefined;
    }
    return JSON.parse(raw) as k8s.V1Toleration[];
  }

  private getAgentIngressAnnotations(): Record<string, string> {
    const raw = this.configService.get<string>("K8S_AGENT_INGRESS_ANNOTATIONS_JSON")?.trim() ?? "";
    if (!raw) {
      return {};
    }
    return JSON.parse(raw) as Record<string, string>;
  }

  private buildAgentEndpointUrl(deploymentName: string): string {
    const hostTemplate = this.configService.get<string>("AGENT_HOST_TEMPLATE")?.trim() ?? "";
    const host = hostTemplate ? hostTemplate.replace(/\{\{\s*name\s*\}\}/g, deploymentName) : `${deploymentName}.127.0.0.1.nip.io`;
    const pathTemplate = this.configService.get<string>("AGENT_PATH_TEMPLATE", "/").trim() || "/";
    const path = pathTemplate.replace(/\{\{\s*name\s*\}\}/g, deploymentName);
    const scheme = this.configService.get<string>("AGENT_URL_SCHEME", "http").trim() || "http";
    return `${scheme}://${host}${path === "/" ? "" : path}`;
  }

  private parseEndpoint(endpointUrl: string): { host: string; ingressPath: string } {
    const url = new URL(endpointUrl);
    return {
      host: url.host,
      ingressPath: url.pathname && url.pathname !== "" ? url.pathname : "/",
    };
  }

  private async checkEndpointReady(endpointUrl: string): Promise<boolean> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
      const response = await fetch(endpointUrl, { method: "GET", redirect: "manual", signal: controller.signal });
      return response.status < 500;
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  private normalizeDockerfilePath(rawPath: string): string {
    const trimmed = rawPath.trim().replace(/^\.\/+/, "");
    return trimmed || "Dockerfile";
  }

  private sanitizeName(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50);
  }
}
