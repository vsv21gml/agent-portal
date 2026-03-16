import { ConflictException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import * as k8s from "@kubernetes/client-node";
import * as http from "node:http";
import * as https from "node:https";
import { Repository } from "typeorm";
import { AuthService } from "../auth/auth.service";
import { GitlabService } from "../gitlab/gitlab.service";
import { GitlabRepoEntity } from "../gitlab/entities/gitlab-repo.entity";
import { LlmService } from "../llm/llm.service";
import { LiteLlmModelAccessRequestEntity } from "../llm/entities/litellm-model-access-request.entity";
import { LogsService } from "../logs/logs.service";
import { ProjectsService } from "../projects/projects.service";
import { CreateMcpDto } from "./dto/create-mcp.dto";
import { McpDeploymentEntity } from "./entities/mcp-deployment.entity";

type PlaygroundMessage = {
  role: "user" | "assistant";
  content: string;
};

type McpToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

type McpServerCard = {
  name: string;
  description: string;
  endpointUrl: string;
  protocolVersion: string;
  tools: McpToolDefinition[];
};

type McpHttpSession = {
  transportUrl: string;
  sessionId: string | null;
  protocolVersion: string;
  serverName: string;
  serverVersion: string;
  instructions: string | null;
  tools: McpToolDefinition[];
};

type LiteLlmToolCall = {
  id: string;
  function: {
    name: string;
    arguments: string;
  };
};

type LiteLlmMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content?: string;
  tool_calls?: LiteLlmToolCall[];
  tool_call_id?: string;
};

type LiteLlmChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: LiteLlmToolCall[];
    };
  }>;
};

@Injectable()
export class McpsService {
  private readonly logger = new Logger(McpsService.name);
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
    private readonly logsService: LogsService,
    @InjectRepository(McpDeploymentEntity)
    private readonly mcpRepository: Repository<McpDeploymentEntity>,
    @InjectRepository(LiteLlmModelAccessRequestEntity)
    private readonly modelAccessRequestRepository: Repository<LiteLlmModelAccessRequestEntity>,
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

  async createMcp(dto: CreateMcpDto, userId: string): Promise<McpDeploymentEntity> {
    await this.projectsService.getProject(dto.projectId);
    await this.ensureProjectServingCapacity(dto.projectId);
    const repo = await this.gitlabService.getRepo(dto.projectId, dto.repoId);
    const user = await this.authService.findById(userId);
    const useLlm = dto.useLlm === true;
    const selectedModel = dto.litellmModel?.trim() ?? "";
    const ecrRepository = this.getRequiredConfig("MCP_ECR_REPOSITORY", "AGENT_ECR_REPOSITORY");
    const namespace =
      this.getConfig("K8S_MCP_NAMESPACE", "K8S_SERVING_NAMESPACE") || this.getConfig("K8S_AGENT_NAMESPACE") || "mcp-serving";
    const id = crypto.randomUUID();
    const nameSuffix = id.replace(/-/g, "").slice(0, 12);
    const deploymentName = `mcp-${nameSuffix}`;
    const buildJobName = `${deploymentName}-build`;
    const serviceName = deploymentName;
    const ingressName = `${deploymentName}-ing`;
    const imageTag = id;
    const imageUrl = `${ecrRepository.replace(/\/+$/, "")}:${imageTag}`;
    const endpointUrl = this.buildMcpEndpointUrl(deploymentName);
    const catalogModel = useLlm ? await this.llmService.getCatalogModel(selectedModel) : null;
    const projectKey = useLlm ? await this.llmService.ensureProjectVirtualKey(dto.projectId, userId, `mcp-${id}`) : null;

    const mcp = await this.mcpRepository.save(
      this.mcpRepository.create({
        id,
        projectId: dto.projectId,
        repoId: dto.repoId,
        ownerUserId: userId,
        mcpName: dto.mcpName.trim(),
        description: dto.description?.trim() ?? "",
        dockerfilePath: dto.dockerfilePath?.trim() || "./Dockerfile",
        useLlm: useLlm ? "Y" : "N",
        litellmModel: catalogModel?.modelName ?? "",
        ecrRepository,
        imageTag,
        imageUrl,
        endpointUrl,
        status: "building",
        deleteYn: "N",
        namespace,
        buildJobName,
        deploymentName,
        serviceName,
        ingressName,
        lastMessage: "Build requested",
        litellmApiKey: projectKey?.apiKey ?? null,
        modelAccessRequestId: null,
      }),
    );

    if (catalogModel) {
      if (catalogModel.isDefault) {
        await this.llmService.configureProjectKeyModels(mcp.litellmApiKey ?? "", [catalogModel.modelName]);
      } else {
        const request = await this.llmService.createModelAccessRequest(userId, {
          modelName: catalogModel.modelName,
          requestType: "mcp_deploy",
          projectId: dto.projectId,
          mcpId: mcp.id,
        });
        mcp.modelAccessRequestId = request.id;
        mcp.lastMessage = "Build requested. Waiting for admin approval after successful build.";
        await this.mcpRepository.save(mcp);
      }
    }

    await this.ensureNamespace(namespace);
    await this.ensureBuildJob(mcp, repo, {
      gitUserName: user?.displayName?.trim() || user?.email || "MCP User",
      gitUserEmail: user?.email || "mcp@example.com",
      gitlabToken: this.configService.get<string>("GITLAB_TOKEN")?.trim() ?? "",
    });
    await this.logsService.writeAuditLog({
      userId,
      actionKey: "MCP_DEPLOY_REQUESTED",
      targetType: "mcp",
      targetId: mcp.id,
      projectId: mcp.projectId,
      metadata: { repoId: mcp.repoId, mcpName: mcp.mcpName, useLlm, model: mcp.litellmModel },
    });

    return this.refreshMcpStatus(mcp);
  }

  async listByProject(projectId: string, _userId: string): Promise<McpDeploymentEntity[]> {
    const mcps = await this.mcpRepository.find({
      where: { projectId, deleteYn: "N" },
      order: { createdAt: "DESC" },
    });
    return Promise.all(mcps.map((mcp) => this.refreshMcpStatus(mcp)));
  }

  async getMcp(mcpId: string, _userId: string): Promise<McpDeploymentEntity> {
    const mcp = await this.mcpRepository.findOneByOrFail({ id: mcpId, deleteYn: "N" });
    return this.refreshMcpStatus(mcp);
  }

  async getMcpCard(mcpId: string, _userId: string): Promise<McpServerCard> {
    const mcp = await this.mcpRepository.findOneByOrFail({ id: mcpId, deleteYn: "N" });
    const session = await this.inspectMcpTarget(this.getDeployedMcpBaseUrls(mcp));
    return this.toServerCard(session);
  }

  async inspectExternalMcp(rawUrl: string, _userId: string, _userEmail: string): Promise<{
    normalizedUrl: string;
    serverCard: McpServerCard;
  }> {
    const normalizedUrl = this.normalizeExternalMcpUrl(rawUrl);
    const session = await this.inspectMcpTarget([normalizedUrl]);
    return {
      normalizedUrl,
      serverCard: this.toServerCard(session),
    };
  }

  async getMcpLogs(mcpId: string, _userId: string): Promise<{ logs: string }> {
    const mcp = await this.mcpRepository.findOneByOrFail({ id: mcpId, deleteYn: "N" });
    await this.refreshMcpStatus(mcp);

    if (["building", "failed", "pending_approval"].includes(mcp.status)) {
      const buildPod = await this.findFirstPodByLabel(mcp.namespace, "job-name", mcp.buildJobName);
      if (!buildPod) {
        return { logs: "" };
      }
      const response = await this.readPodLogSafely({
        namespace: mcp.namespace,
        name: buildPod.metadata?.name ?? "",
        container: buildPod.spec?.containers?.some((item) => item.name === "kaniko") ? "kaniko" : undefined,
      });
      return { logs: response };
    }

    const pod = await this.findFirstPodByLabel(mcp.namespace, "agent-portal/mcp-name", mcp.deploymentName);
    if (!pod) {
      return { logs: "" };
    }
    const response = await this.readPodLogSafely({
      namespace: mcp.namespace,
      name: pod.metadata?.name ?? "",
    });
    return { logs: response };
  }

  async stopMcp(mcpId: string, userId: string): Promise<McpDeploymentEntity> {
    const mcp = await this.mcpRepository.findOneByOrFail({ id: mcpId, ownerUserId: userId, deleteYn: "N" });
    await this.deleteServingResources(mcp);
    mcp.status = "stopped";
    mcp.lastMessage = "MCP stopped.";
    const saved = await this.mcpRepository.save(mcp);
    await this.logsService.writeAuditLog({
      userId,
      actionKey: "MCP_STOPPED",
      targetType: "mcp",
      targetId: mcp.id,
      projectId: mcp.projectId,
      metadata: { mcpName: mcp.mcpName, repoId: mcp.repoId },
    });
    return saved;
  }

  async restartMcp(mcpId: string, userId: string): Promise<McpDeploymentEntity> {
    const mcp = await this.mcpRepository.findOneByOrFail({ id: mcpId, ownerUserId: userId, deleteYn: "N" });
    await this.ensureProjectServingCapacity(mcp.projectId, mcp.id);
    if (mcp.modelAccessRequestId) {
      const request = await this.modelAccessRequestRepository.findOne({ where: { id: mcp.modelAccessRequestId } });
      if (!request || request.status === "pending") {
        mcp.status = "pending_approval";
        mcp.lastMessage = "Waiting for admin model approval.";
        return this.mcpRepository.save(mcp);
      }
      if (request.status === "rejected") {
        mcp.status = "failed";
        mcp.lastMessage = "Model approval rejected by administrator.";
        return this.mcpRepository.save(mcp);
      }
      await this.llmService.configureProjectKeyModels(mcp.litellmApiKey ?? "", [mcp.litellmModel]);
    }

    mcp.status = "deploying";
    mcp.lastMessage = "Restart requested.";
    await this.mcpRepository.save(mcp);
    await this.deleteServingResources(mcp);
    await this.ensureServingResources(mcp);
    await this.logsService.writeAuditLog({
      userId,
      actionKey: "MCP_RESTARTED",
      targetType: "mcp",
      targetId: mcp.id,
      projectId: mcp.projectId,
      metadata: { mcpName: mcp.mcpName, repoId: mcp.repoId },
    });
    return this.refreshMcpStatus(mcp);
  }

  async deleteMcp(mcpId: string, userId: string): Promise<{ id: string }> {
    const mcp = await this.mcpRepository.findOneByOrFail({ id: mcpId, ownerUserId: userId, deleteYn: "N" });
    await this.deleteMcpResources(mcp);
    mcp.deleteYn = "Y";
    mcp.status = "deleted";
    mcp.lastMessage = "MCP deleted.";
    await this.mcpRepository.save(mcp);
    await this.logsService.writeAuditLog({
      userId,
      actionKey: "MCP_DELETED",
      targetType: "mcp",
      targetId: mcp.id,
      projectId: mcp.projectId,
      metadata: { mcpName: mcp.mcpName, repoId: mcp.repoId },
    });
    return { id: mcp.id };
  }

  async chatWithExternalMcp(
    rawUrl: string,
    userId: string,
    userEmail: string,
    modelName: string,
    messages: PlaygroundMessage[],
  ): Promise<{ reply: string; toolCalls: Array<{ name: string; result: string }>; serverCard: McpServerCard }> {
    const normalizedUrl = this.normalizeExternalMcpUrl(rawUrl);
    return this.chatWithMcpBaseUrls([normalizedUrl], userId, userEmail, modelName, messages);
  }

  async chatWithMcp(
    mcpId: string,
    userId: string,
    userEmail: string,
    modelName: string,
    messages: PlaygroundMessage[],
  ): Promise<{ reply: string; toolCalls: Array<{ name: string; result: string }>; serverCard: McpServerCard }> {
    const mcp = await this.mcpRepository.findOneByOrFail({ id: mcpId, deleteYn: "N" });
    const refreshed = await this.refreshMcpStatus(mcp);
    if (refreshed.status !== "running") {
      throw new Error("MCP server is not running");
    }
    return this.chatWithMcpBaseUrls(this.getDeployedMcpBaseUrls(refreshed), userId, userEmail, modelName, messages);
  }

  private async chatWithMcpBaseUrls(
    baseUrls: string[],
    userId: string,
    userEmail: string,
    modelName: string,
    messages: PlaygroundMessage[],
  ): Promise<{ reply: string; toolCalls: Array<{ name: string; result: string }>; serverCard: McpServerCard }> {
    const llmAccess = await this.llmService.getCurrentUserAccess(userId, userEmail);
    if (!llmAccess.personalKey || !llmAccess.litellmBaseUrl) {
      throw new Error("LiteLLM personal access is not configured");
    }
    if (!llmAccess.availableModels.some((model) => model.modelName === modelName)) {
      throw new ConflictException("Model is not available to the current user");
    }

    const session = await this.inspectMcpTarget(baseUrls);
    const toolCalls: Array<{ name: string; result: string }> = [];
    const conversation: LiteLlmMessage[] = [
      {
        role: "system",
        content: [
          `You are testing an MCP server named "${session.serverName}".`,
          "Use MCP tools when they are relevant to answer the user's request.",
          "Be concise and factual.",
          session.instructions ? `Server instructions: ${session.instructions}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      },
      ...messages.map((message) => ({
        role: (message.role === "assistant" ? "assistant" : "user") as "assistant" | "user",
        content: message.content,
      })),
    ];

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const completion = await this.requestLiteLlmCompletion(
        llmAccess.litellmBaseUrl,
        llmAccess.personalKey,
        modelName,
        conversation,
        session.tools,
      );
      const assistantMessage = completion.choices?.[0]?.message;
      if (!assistantMessage) {
        throw new Error("LiteLLM returned no message");
      }

      if (assistantMessage.tool_calls?.length) {
        conversation.push({
          role: "assistant",
          content: assistantMessage.content ?? "",
          tool_calls: assistantMessage.tool_calls,
        });

        for (const toolCall of assistantMessage.tool_calls) {
          const toolResult = await this.callMcpTool(
            session,
            toolCall.function.name,
            this.parseJsonSafely(toolCall.function.arguments),
          );
          toolCalls.push({ name: toolCall.function.name, result: toolResult });
          conversation.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: toolResult,
          });
        }
        continue;
      }

      const finalReply = assistantMessage.content?.trim() || "No response.";
      return {
        reply: toolCalls.length > 0 ? `${toolCalls.map((tool) => `Tool ${tool.name} called.`).join("\n")}\n\n${finalReply}` : finalReply,
        toolCalls,
        serverCard: this.toServerCard(session),
      };
    }

    throw new Error("MCP tool-calling loop exceeded the maximum number of steps");
  }

  private async refreshMcpStatus(mcp: McpDeploymentEntity): Promise<McpDeploymentEntity> {
    if (["building", "deploying", "pending_approval"].includes(mcp.status)) {
      return this.refreshBuildAndDeployStatus(mcp);
    }

    if (mcp.status === "running") {
      const deployment = await this.safeReadDeployment(mcp);
      const readyReplicas = deployment?.status?.readyReplicas ?? 0;
      const desiredReplicas = deployment?.spec?.replicas ?? 1;
      if (readyReplicas < desiredReplicas) {
        mcp.status = "deploying";
        mcp.lastMessage = "Waiting for serving endpoint";
        return this.mcpRepository.save(mcp);
      }
    }

    return mcp;
  }

  private async refreshBuildAndDeployStatus(mcp: McpDeploymentEntity): Promise<McpDeploymentEntity> {
    const job = await this.safeReadJob(mcp);
    const succeeded = job?.status?.succeeded ?? 0;
    const failed = job?.status?.failed ?? 0;

    if (failed > 0) {
      mcp.status = "failed";
      mcp.lastMessage = "Build job failed";
      return this.mcpRepository.save(mcp);
    }

    if (succeeded > 0) {
      if (mcp.modelAccessRequestId) {
        const request = await this.modelAccessRequestRepository.findOne({ where: { id: mcp.modelAccessRequestId } });
        if (!request || request.status === "pending") {
          mcp.status = "pending_approval";
          mcp.lastMessage = "Build complete. Waiting for admin model approval.";
          return this.mcpRepository.save(mcp);
        }
        if (request.status === "rejected") {
          mcp.status = "failed";
          mcp.lastMessage = "Model approval rejected by administrator.";
          return this.mcpRepository.save(mcp);
        }
        await this.llmService.configureProjectKeyModels(mcp.litellmApiKey ?? "", [mcp.litellmModel]);
      }

      const deployment = await this.safeReadDeployment(mcp);
      if (!deployment) {
        await this.ensureServingResources(mcp);
        mcp.status = "deploying";
        mcp.lastMessage = "Build complete. Deploying MCP server.";
        return this.mcpRepository.save(mcp);
      }

      const readyReplicas = deployment.status?.readyReplicas ?? 0;
      const desiredReplicas = deployment.spec?.replicas ?? 1;
      mcp.status = readyReplicas >= desiredReplicas ? "running" : "deploying";
      mcp.lastMessage = mcp.status === "running" ? "MCP server is ready." : "Waiting for serving endpoint";
      return this.mcpRepository.save(mcp);
    }

    return mcp;
  }

  private async ensureBuildJob(
    mcp: McpDeploymentEntity,
    repo: GitlabRepoEntity,
    options: {
      gitUserName: string;
      gitUserEmail: string;
      gitlabToken: string;
    },
  ): Promise<void> {
    const repoCloneUrl = repo.cloneUrl ?? repo.webUrl?.concat(".git") ?? "";
    const dockerfilePath = this.normalizeDockerfilePath(mcp.dockerfilePath);
    const awsRegion = this.extractEcrRegion(mcp.ecrRepository);
    const cloneScript = [
      "set -e",
      `TARGET_URL="${repoCloneUrl}"`,
      "mkdir -p /workspace",
      "if [ -n \"$TARGET_URL\" ] && [ -n \"$GITLAB_TOKEN\" ] && echo \"$TARGET_URL\" | grep -q '^https://'; then",
      "  TARGET_URL=$(echo \"$TARGET_URL\" | sed \"s#https://#https://oauth2:${GITLAB_TOKEN}@#\")",
      "fi",
      "git config --global user.name \"$GIT_USER_NAME\"",
      "git config --global user.email \"$GIT_USER_EMAIL\"",
      "git clone \"$TARGET_URL\" /workspace/repo",
      `if [ ! -f "/workspace/repo/${dockerfilePath.replace(/"/g, '\\"')}" ]; then echo "Dockerfile not found"; exit 1; fi`,
    ].join("\n");

    await this.kubeClientBatch!.createNamespacedJob({
      namespace: mcp.namespace,
      body: {
        apiVersion: "batch/v1",
        kind: "Job",
        metadata: {
          name: mcp.buildJobName,
          labels: this.getMcpLabels(mcp),
        },
        spec: {
          backoffLimit: 0,
          template: {
            metadata: {
              labels: this.getMcpLabels(mcp),
            },
            spec: {
              restartPolicy: "Never",
              serviceAccountName:
                this.getConfig("K8S_MCP_BUILD_SERVICE_ACCOUNT", "K8S_SERVING_BUILD_SERVICE_ACCOUNT") ||
                this.getConfig("K8S_AGENT_BUILD_SERVICE_ACCOUNT") ||
                "agent-builder",
              nodeSelector: this.getNodeSelector(),
              tolerations: this.getTolerations(),
              initContainers: [
                {
                  name: "clone-source",
                  image: this.getConfig("MCP_GIT_IMAGE", "AGENT_GIT_IMAGE") || "alpine/git:2.47.2",
                  command: ["sh", "-c", cloneScript],
                  env: [
                    { name: "GITLAB_TOKEN", value: options.gitlabToken },
                    { name: "GIT_USER_NAME", value: options.gitUserName },
                    { name: "GIT_USER_EMAIL", value: options.gitUserEmail },
                  ],
                  volumeMounts: [{ name: "workspace", mountPath: "/workspace" }],
                },
              ],
              containers: [
                {
                  name: "kaniko",
                  image: this.configService.get<string>("KANIKO_EXECUTOR_IMAGE", "gcr.io/kaniko-project/executor:latest"),
                  env: [
                    { name: "AWS_REGION", value: awsRegion },
                    { name: "AWS_DEFAULT_REGION", value: awsRegion },
                    { name: "AWS_SDK_LOAD_CONFIG", value: "true" },
                  ],
                  args: [
                    "--context=/workspace/repo",
                    `--dockerfile=/workspace/repo/${dockerfilePath}`,
                    `--destination=${mcp.imageUrl}`,
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

  private async ensureServingResources(mcp: McpDeploymentEntity): Promise<void> {
    await this.ensureMcpDeployment(mcp);
    await this.ensureMcpService(mcp);
    await this.ensureMcpIngress(mcp);
  }

  private async ensureMcpDeployment(mcp: McpDeploymentEntity): Promise<void> {
    const env = [
      { name: "PORT", value: "8080" },
      { name: "MCP_NAME", value: mcp.mcpName },
      { name: "MCP_DESCRIPTION", value: mcp.description },
    ];
    if (mcp.useLlm === "Y") {
      env.push(
        { name: "LITELLM_API_KEY", value: mcp.litellmApiKey ?? "" },
        { name: "LITELLM_BASE_URL", value: this.configService.get<string>("LITELLM_BASE_URL", "") },
        { name: "LITELLM_MODEL", value: mcp.litellmModel },
      );
    }

    await this.kubeClientApps!.createNamespacedDeployment({
      namespace: mcp.namespace,
      body: {
        apiVersion: "apps/v1",
        kind: "Deployment",
        metadata: {
          name: mcp.deploymentName,
          labels: this.getMcpLabels(mcp),
        },
        spec: {
          replicas: 1,
          selector: { matchLabels: this.getMcpSelectorLabels(mcp) },
          template: {
            metadata: {
              labels: {
                ...this.getMcpLabels(mcp),
                ...this.getMcpSelectorLabels(mcp),
              },
            },
            spec: {
              nodeSelector: this.getNodeSelector(),
              tolerations: this.getTolerations(),
              containers: [
                {
                  name: "mcp",
                  image: mcp.imageUrl,
                  imagePullPolicy: "Always",
                  ports: [{ containerPort: 8080 }],
                  env,
                },
              ],
            },
          },
        },
      } as k8s.V1Deployment,
    });
  }

  private async ensureMcpService(mcp: McpDeploymentEntity): Promise<void> {
    await this.kubeClientCore!.createNamespacedService({
      namespace: mcp.namespace,
      body: {
        apiVersion: "v1",
        kind: "Service",
        metadata: { name: mcp.serviceName, labels: this.getMcpLabels(mcp) },
        spec: {
          selector: this.getMcpSelectorLabels(mcp),
          ports: [{ port: 8080, targetPort: 8080 }],
        },
      } as k8s.V1Service,
    });
  }

  private async ensureMcpIngress(mcp: McpDeploymentEntity): Promise<void> {
    const { host, ingressPath } = this.parseEndpoint(mcp.endpointUrl);
    const ingressClassName =
      this.getConfig("K8S_MCP_INGRESS_CLASS", "K8S_SERVING_INGRESS_CLASS") || this.getConfig("K8S_AGENT_INGRESS_CLASS") || "nginx";
    await this.kubeClientNetworking!.createNamespacedIngress({
      namespace: mcp.namespace,
      body: {
        apiVersion: "networking.k8s.io/v1",
        kind: "Ingress",
        metadata: {
          name: mcp.ingressName,
          labels: this.getMcpLabels(mcp),
          annotations: {
            "kubernetes.io/ingress.class": ingressClassName,
            ...this.getIngressAnnotations(),
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
                    backend: { service: { name: mcp.serviceName, port: { number: 8080 } } },
                  },
                ],
              },
            },
          ],
        },
      } as k8s.V1Ingress,
    });
  }

  private async deleteServingResources(mcp: McpDeploymentEntity): Promise<void> {
    await Promise.allSettled([
      this.kubeClientApps?.deleteNamespacedDeployment({ namespace: mcp.namespace, name: mcp.deploymentName }),
      this.kubeClientCore?.deleteNamespacedService({ namespace: mcp.namespace, name: mcp.serviceName }),
      this.kubeClientNetworking?.deleteNamespacedIngress({ namespace: mcp.namespace, name: mcp.ingressName }),
    ]);
  }

  private async deleteMcpResources(mcp: McpDeploymentEntity): Promise<void> {
    await this.deleteServingResources(mcp);
    await Promise.allSettled([
      this.kubeClientBatch?.deleteNamespacedJob({
        namespace: mcp.namespace,
        name: mcp.buildJobName,
        body: { propagationPolicy: "Background" } as k8s.V1DeleteOptions,
      }),
    ]);
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

  private async safeReadJob(mcp: McpDeploymentEntity): Promise<k8s.V1Job | null> {
    try {
      return await this.kubeClientBatch!.readNamespacedJob({ namespace: mcp.namespace, name: mcp.buildJobName });
    } catch {
      return null;
    }
  }

  private async safeReadDeployment(mcp: McpDeploymentEntity): Promise<k8s.V1Deployment | null> {
    try {
      return await this.kubeClientApps!.readNamespacedDeployment({ namespace: mcp.namespace, name: mcp.deploymentName });
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

  private async readPodLogSafely(params: {
    namespace: string;
    name: string;
    container?: string;
  }): Promise<string> {
    try {
      return await this.kubeClientCore!.readNamespacedPodLog(params);
    } catch (error) {
      const message = this.describePendingLogState(error);
      if (message) {
        this.logger.log(`Pod log pending namespace=${params.namespace} pod=${params.name} container=${params.container ?? "-"}`);
        return message;
      }
      throw error;
    }
  }

  private describePendingLogState(error: unknown): string | null {
    if (!(error instanceof Error)) {
      return null;
    }

    const body = "body" in error && typeof (error as { body?: unknown }).body === "string" ? (error as { body: string }).body : "";
    const source = `${error.message}\n${body}`;
    if (/ContainerCreating/i.test(source) || /waiting to start/i.test(source)) {
      return "Container is still starting. Logs will appear once the MCP container is running.";
    }
    if (/PodInitializing/i.test(source) || /Pending/i.test(source)) {
      return "Pod is still initializing. Logs will appear after startup completes.";
    }
    return null;
  }

  private async requestLiteLlmCompletion(
    baseUrl: string,
    apiKey: string,
    modelName: string,
    messages: LiteLlmMessage[],
    tools: McpToolDefinition[],
  ): Promise<LiteLlmChatResponse> {
    const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
    const endpoint = `${normalizedBaseUrl.endsWith("/v1") ? normalizedBaseUrl : `${normalizedBaseUrl}/v1`}/chat/completions`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelName,
        temperature: 0,
        messages,
        tools: tools.map((tool) => ({
          type: "function",
          function: {
            name: tool.name,
            description: tool.description || tool.name,
            parameters: this.normalizeToolSchema(tool.inputSchema),
          },
        })),
        tool_choice: tools.length ? "auto" : undefined,
      }),
    });
    if (!response.ok) {
      throw new Error(`LiteLLM completion failed (${response.status})`);
    }
    return (await response.json()) as LiteLlmChatResponse;
  }

  private normalizeToolSchema(inputSchema: Record<string, unknown>): Record<string, unknown> {
    const schema = inputSchema && Object.keys(inputSchema).length > 0 ? inputSchema : { type: "object", properties: {} };
    return "type" in schema ? schema : { type: "object", properties: schema };
  }

  private parseJsonSafely(raw: string): Record<string, unknown> {
    try {
      const parsed = JSON.parse(raw || "{}");
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }

  private async inspectMcpTarget(baseUrls: string[]): Promise<McpHttpSession> {
    let lastError: Error | null = null;
    for (const baseUrl of this.expandMcpTransportUrls(baseUrls)) {
      try {
        return await this.connectMcpHttp(baseUrl);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger.warn(`MCP inspect failed endpoint=${baseUrl}: ${lastError.message}`);
      }
    }

    throw lastError ?? new Error("Failed to inspect MCP server");
  }

  private expandMcpTransportUrls(baseUrls: string[]): string[] {
    return Array.from(
      new Set(
        baseUrls.flatMap((baseUrl) => {
          const trimmed = baseUrl.replace(/\/+$/, "");
          return [trimmed, `${trimmed}/mcp`];
        }),
      ),
    );
  }

  private async connectMcpHttp(transportUrl: string): Promise<McpHttpSession> {
    const initializeResult = await this.sendMcpRequest(transportUrl, null, {
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: {
          name: "agent-portal",
          version: "1.0.0",
        },
      },
    });
    const initializePayload = this.extractJsonRpcResult(initializeResult.body);
    const sessionId = initializeResult.sessionId;

    await this.sendMcpNotification(transportUrl, sessionId, {
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {},
    });

    const toolsResult = await this.sendMcpRequest(transportUrl, sessionId, {
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "tools/list",
      params: {},
    });
    const toolsPayload = this.extractJsonRpcResult(toolsResult.body);
    const toolRows = Array.isArray((toolsPayload as { tools?: unknown[] }).tools)
      ? ((toolsPayload as { tools: unknown[] }).tools ?? [])
      : [];
    const tools = toolRows
      .map((tool) => this.normalizeMcpTool(tool))
      .filter((tool): tool is McpToolDefinition => tool !== null);

    return {
      transportUrl,
      sessionId,
      protocolVersion: this.readString(initializePayload, "protocolVersion") || "2024-11-05",
      serverName: this.readNestedString(initializePayload, ["serverInfo", "name"]) || "MCP Server",
      serverVersion: this.readNestedString(initializePayload, ["serverInfo", "version"]) || "",
      instructions: this.readString(initializePayload, "instructions"),
      tools,
    };
  }

  private toServerCard(session: McpHttpSession): McpServerCard {
    return {
      name: session.serverName,
      description: session.instructions || (session.serverVersion ? `Version ${session.serverVersion}` : "No description"),
      endpointUrl: session.transportUrl,
      protocolVersion: session.protocolVersion,
      tools: session.tools,
    };
  }

  private normalizeMcpTool(tool: unknown): McpToolDefinition | null {
    if (!tool || typeof tool !== "object") {
      return null;
    }
    const row = tool as Record<string, unknown>;
    const name = typeof row.name === "string" ? row.name.trim() : "";
    if (!name) {
      return null;
    }
    return {
      name,
      description: typeof row.description === "string" ? row.description : "",
      inputSchema: row.inputSchema && typeof row.inputSchema === "object" ? (row.inputSchema as Record<string, unknown>) : {},
    };
  }

  private async callMcpTool(session: McpHttpSession, name: string, args: Record<string, unknown>): Promise<string> {
    const response = await this.sendMcpRequest(session.transportUrl, session.sessionId, {
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "tools/call",
      params: {
        name,
        arguments: args,
      },
    });
    const payload = this.extractJsonRpcResult(response.body);
    return this.stringifyMcpToolResult(payload);
  }

  private stringifyMcpToolResult(payload: unknown): string {
    if (!payload || typeof payload !== "object") {
      return JSON.stringify(payload, null, 2);
    }
    const result = payload as Record<string, unknown>;
    const content = Array.isArray(result.content) ? result.content : [];
    const textParts = content
      .map((item) => {
        if (!item || typeof item !== "object") {
          return "";
        }
        const row = item as Record<string, unknown>;
        if (typeof row.text === "string") {
          return row.text;
        }
        if (typeof row.content === "string") {
          return row.content;
        }
        return JSON.stringify(row);
      })
      .filter(Boolean);
    if (textParts.length) {
      return textParts.join("\n");
    }
    return JSON.stringify(payload, null, 2);
  }

  private extractJsonRpcResult(payload: unknown): Record<string, unknown> {
    if (!payload || typeof payload !== "object") {
      return {};
    }
    const record = payload as Record<string, unknown>;
    if (record.error) {
      throw new Error(JSON.stringify(record.error));
    }
    const result = record.result;
    return result && typeof result === "object" ? (result as Record<string, unknown>) : {};
  }

  private readString(payload: Record<string, unknown>, key: string): string | null {
    const value = payload[key];
    return typeof value === "string" && value.trim() ? value : null;
  }

  private readNestedString(payload: Record<string, unknown>, path: string[]): string | null {
    let current: unknown = payload;
    for (const key of path) {
      if (!current || typeof current !== "object") {
        return null;
      }
      current = (current as Record<string, unknown>)[key];
    }
    return typeof current === "string" && current.trim() ? current : null;
  }

  private async sendMcpNotification(transportUrl: string, sessionId: string | null, body: Record<string, unknown>): Promise<void> {
    try {
      await this.httpJsonRequest(transportUrl, body, sessionId);
    } catch {
      // ignore notification failures
    }
  }

  private async sendMcpRequest(
    transportUrl: string,
    sessionId: string | null,
    body: Record<string, unknown>,
  ): Promise<{ body: unknown; sessionId: string | null }> {
    const response = await this.httpJsonRequest(transportUrl, body, sessionId);
    return {
      body: response.body,
      sessionId: response.sessionId ?? sessionId,
    };
  }

  private async httpJsonRequest(
    url: string,
    body: Record<string, unknown>,
    sessionId: string | null,
  ): Promise<{ body: unknown; sessionId: string | null }> {
    const response = await this.fetchWithOptionalInsecureTls(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...(sessionId ? { "mcp-session-id": sessionId } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`MCP request failed (${response.status})`);
    }
    const raw = await response.text();
    return {
      body: this.parseJsonOrSse(raw),
      sessionId: response.headers.get("mcp-session-id") ?? response.headers.get("Mcp-Session-Id"),
    };
  }

  private parseJsonOrSse(raw: string): unknown {
    const trimmed = raw.trim();
    if (!trimmed) {
      return {};
    }
    if (!trimmed.startsWith("data:")) {
      return JSON.parse(trimmed);
    }
    const dataLines = trimmed
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.replace(/^data:\s*/, ""))
      .filter(Boolean);
    return JSON.parse(dataLines[dataLines.length - 1] ?? "{}");
  }

  private fetchWithOptionalInsecureTls(
    url: string,
    init?: RequestInit,
  ): Promise<{
    ok: boolean;
    status: number;
    headers: { get(name: string): string | null };
    text(): Promise<string>;
  }> {
    const method = init?.method ?? "GET";
    const headers = this.toHeaderRecord(init?.headers);
    const body = typeof init?.body === "string" ? init.body : undefined;
    return new Promise((resolve, reject) => {
      const target = new URL(url);
      const client = target.protocol === "https:" ? https : http;
      const req = client.request(
        {
          protocol: target.protocol,
          hostname: target.hostname,
          port: target.port || undefined,
          path: `${target.pathname}${target.search}`,
          method,
          headers,
          rejectUnauthorized: target.protocol === "https:" ? false : undefined,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
          res.on("end", () => {
            const raw = Buffer.concat(chunks).toString("utf8");
            resolve({
              ok: (res.statusCode ?? 500) >= 200 && (res.statusCode ?? 500) < 300,
              status: res.statusCode ?? 500,
              headers: {
                get: (name: string) => {
                  const value = res.headers[name.toLowerCase()];
                  if (Array.isArray(value)) {
                    return value.join(", ");
                  }
                  return value ?? null;
                },
              },
              text: async () => raw,
            });
          });
        },
      );

      req.on("error", reject);
      if (body) {
        req.write(body);
      }
      req.end();
    });
  }

  private toHeaderRecord(headers: RequestInit["headers"]): Record<string, string> {
    if (!headers) {
      return {};
    }
    if (headers instanceof Headers) {
      return Object.fromEntries(headers.entries());
    }
    if (Array.isArray(headers)) {
      return Object.fromEntries(headers);
    }
    return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key, String(value)]));
  }

  private getDeployedMcpBaseUrls(mcp: McpDeploymentEntity): string[] {
    return [
      `http://${mcp.serviceName}.${mcp.namespace}.svc.cluster.local:8080`,
      mcp.endpointUrl.replace(/\/+$/, ""),
    ];
  }

  private normalizeExternalMcpUrl(rawUrl: string): string {
    const trimmed = rawUrl.trim();
    if (!trimmed) {
      throw new Error("MCP URL is required");
    }
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withProtocol);
    return url.toString().replace(/\/+$/, "");
  }

  private getMcpLabels(mcp: McpDeploymentEntity): Record<string, string> {
    return {
      "app.kubernetes.io/managed-by": "agent-portal",
      "agent-portal/mcp-id": mcp.id,
      "agent-portal/mcp-name": mcp.deploymentName,
      "agent-portal/mcp-resource": "true",
    };
  }

  private getMcpSelectorLabels(mcp: McpDeploymentEntity): Record<string, string> {
    return {
      "agent-portal/mcp-name": mcp.deploymentName,
    };
  }

  private getNodeSelector(): Record<string, string> | undefined {
    const raw = this.getConfig("K8S_MCP_NODE_SELECTOR_JSON", "K8S_SERVING_NODE_SELECTOR_JSON") ?? this.getConfig("K8S_AGENT_NODE_SELECTOR_JSON");
    if (!raw) {
      return undefined;
    }
    return JSON.parse(raw) as Record<string, string>;
  }

  private getTolerations(): k8s.V1Toleration[] | undefined {
    const raw = this.getConfig("K8S_MCP_TOLERATIONS_JSON", "K8S_SERVING_TOLERATIONS_JSON") ?? this.getConfig("K8S_AGENT_TOLERATIONS_JSON");
    if (!raw) {
      return undefined;
    }
    return JSON.parse(raw) as k8s.V1Toleration[];
  }

  private getIngressAnnotations(): Record<string, string> {
    const raw =
      this.getConfig("K8S_MCP_INGRESS_ANNOTATIONS_JSON", "K8S_SERVING_INGRESS_ANNOTATIONS_JSON") ??
      this.getConfig("K8S_AGENT_INGRESS_ANNOTATIONS_JSON");
    if (!raw) {
      return {};
    }
    return JSON.parse(raw) as Record<string, string>;
  }

  private buildMcpEndpointUrl(deploymentName: string): string {
    const hostTemplate = this.getConfig("MCP_HOST_TEMPLATE", "SERVING_HOST_TEMPLATE") ?? this.getConfig("AGENT_HOST_TEMPLATE") ?? "";
    const host = hostTemplate ? hostTemplate.replace(/\{\{\s*name\s*\}\}/g, deploymentName) : `${deploymentName}.127.0.0.1.nip.io`;
    const pathTemplate = (this.getConfig("MCP_PATH_TEMPLATE", "SERVING_PATH_TEMPLATE") ?? this.getConfig("AGENT_PATH_TEMPLATE") ?? "/").trim() || "/";
    const path = pathTemplate.replace(/\{\{\s*name\s*\}\}/g, deploymentName);
    const scheme = (this.getConfig("MCP_URL_SCHEME", "SERVING_URL_SCHEME") ?? this.getConfig("AGENT_URL_SCHEME") ?? "http").trim() || "http";
    return `${scheme}://${host}${path === "/" ? "" : path}`;
  }

  private parseEndpoint(endpointUrl: string): { host: string; ingressPath: string } {
    const url = new URL(endpointUrl);
    return {
      host: url.host,
      ingressPath: url.pathname && url.pathname !== "" ? url.pathname : "/",
    };
  }

  private normalizeDockerfilePath(rawPath: string): string {
    const trimmed = rawPath.trim().replace(/^\.\/+/, "");
    return trimmed || "Dockerfile";
  }

  private getConfig(primaryKey: string, fallbackKey?: string): string | undefined {
    const primaryValue = this.configService.get<string>(primaryKey)?.trim();
    if (primaryValue) {
      return primaryValue;
    }
    if (!fallbackKey) {
      return undefined;
    }
    const fallbackValue = this.configService.get<string>(fallbackKey)?.trim();
    return fallbackValue || undefined;
  }

  private getRequiredConfig(primaryKey: string, fallbackKey?: string): string {
    const value = this.getConfig(primaryKey, fallbackKey);
    if (!value) {
      throw new Error(`${primaryKey} is not configured`);
    }
    return value;
  }

  private async hasProjectServingCapacity(projectId: string, excludeMcpId?: string): Promise<boolean> {
    const activeCount = await this.countProjectServingMcps(projectId, excludeMcpId);
    return activeCount < 2;
  }

  private async ensureProjectServingCapacity(projectId: string, excludeMcpId?: string): Promise<void> {
    if (!(await this.hasProjectServingCapacity(projectId, excludeMcpId))) {
      throw new ConflictException("No serving slot available for this project");
    }
  }

  private async countProjectServingMcps(projectId: string, excludeMcpId?: string): Promise<number> {
    const mcps = await this.mcpRepository.find({ where: { projectId, deleteYn: "N" } });
    return mcps.filter((mcp) => mcp.id !== excludeMcpId && ["running", "deploying"].includes(mcp.status)).length;
  }

  private extractEcrRegion(repository: string): string {
    const match = repository.match(/ecr\.([a-z0-9-]+)\.amazonaws\.com/i);
    return match?.[1] ?? this.configService.get<string>("AWS_REGION", "us-east-1");
  }
}
