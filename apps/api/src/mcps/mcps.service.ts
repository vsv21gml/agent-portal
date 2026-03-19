import { ConflictException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import * as k8s from "@kubernetes/client-node";
import { spawn } from "node:child_process";
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
  transportType: "streamable-http" | "sse" | "stdio";
  transportUrl: string;
  requestUrl: string;
  sessionId: string | null;
  protocolVersion: string;
  serverName: string;
  serverVersion: string;
  instructions: string | null;
  tools: McpToolDefinition[];
  close?: () => void;
  sseConnection?: McpSseConnection;
  stdioConnection?: McpStdioConnection;
};

type McpSseConnection = {
  nextEvent: (timeoutMs?: number) => Promise<{ event: string | null; data: string }>;
  close: () => void;
};

type McpStdioConnection = {
  send: (body: Record<string, unknown>, timeoutMs?: number) => Promise<unknown>;
  notify: (body: Record<string, unknown>) => Promise<void>;
  close: () => void;
};

type McpInspectorConnectionInput = {
  url: string;
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
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
    try {
      return this.toServerCard(session);
    } finally {
      session.close?.();
    }
  }

  async inspectExternalMcp(
    transportType: "streamable-http" | "sse" | "stdio",
    input: McpInspectorConnectionInput,
    _userId: string,
    _userEmail: string,
  ): Promise<{
    normalizedUrl: string;
    serverCard: McpServerCard;
  }> {
    const normalizedUrl = transportType === "stdio" ? this.normalizeInspectorCommandLabel(input.command, input.args) : this.normalizeExternalMcpUrl(input.url);
    const session = await this.connectExternalMcpTarget(transportType, input);
    try {
      return {
        normalizedUrl,
        serverCard: this.toServerCard(session),
      };
    } finally {
      session.close?.();
    }
  }

  async inspectInspectorMcp(
    transportType: "streamable-http" | "sse" | "stdio",
    input: McpInspectorConnectionInput,
    _userId: string,
    _userEmail: string,
  ): Promise<{
    normalizedUrl: string;
    serverCard: McpServerCard;
  }> {
    const normalizedUrl = transportType === "stdio" ? this.normalizeInspectorCommandLabel(input.command, input.args) : this.normalizeExternalMcpUrl(input.url);
    const session = await this.connectExternalMcpTarget(transportType, input);
    try {
      return {
        normalizedUrl,
        serverCard: this.toServerCard(session),
      };
    } finally {
      session.close?.();
    }
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
    await this.projectsService.ensureDeploymentNotBound(mcp.projectId, "mcp", mcp.id);
    return this.stopMcpDeployment(mcp, userId);
  }

  async adminStopMcp(mcpId: string, actorUserId: string): Promise<McpDeploymentEntity> {
    const mcp = await this.mcpRepository.findOneByOrFail({ id: mcpId, deleteYn: "N" });
    await this.projectsService.ensureDeploymentNotBound(mcp.projectId, "mcp", mcp.id);
    return this.stopMcpDeployment(mcp, actorUserId, true);
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
    await this.projectsService.ensureDeploymentNotBound(mcp.projectId, "mcp", mcp.id);
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
    transportType: "streamable-http" | "sse" | "stdio",
    input: McpInspectorConnectionInput,
    userId: string,
    userEmail: string,
    modelName: string,
    messages: PlaygroundMessage[],
  ): Promise<{ reply: string; toolCalls: Array<{ name: string; result: string }>; serverCard: McpServerCard }> {
    const session = await this.connectExternalMcpTarget(transportType, input);
    return this.chatWithMcpSession(session, userId, userEmail, modelName, messages);
  }

  async callInspectorExternalTool(
    transportType: "streamable-http" | "sse" | "stdio",
    input: McpInspectorConnectionInput,
    _userId: string,
    _userEmail: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<{ normalizedUrl: string; result: string; serverCard: McpServerCard }> {
    const normalizedUrl = transportType === "stdio" ? this.normalizeInspectorCommandLabel(input.command, input.args) : this.normalizeExternalMcpUrl(input.url);
    const session = await this.connectExternalMcpTarget(transportType, input);
    try {
      return {
        normalizedUrl,
        result: await this.callMcpTool(session, toolName, args),
        serverCard: this.toServerCard(session),
      };
    } finally {
      session.close?.();
    }
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
    const session = await this.inspectMcpTarget(this.getDeployedMcpBaseUrls(refreshed));
    return this.chatWithMcpSession(session, userId, userEmail, modelName, messages);
  }

  async callMcpToolById(
    mcpId: string,
    _userId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<{ result: string; serverCard: McpServerCard }> {
    const mcp = await this.mcpRepository.findOneByOrFail({ id: mcpId, deleteYn: "N" });
    const refreshed = await this.refreshMcpStatus(mcp);
    if (refreshed.status !== "running") {
      throw new Error("MCP server is not running");
    }
    const session = await this.inspectMcpTarget(this.getDeployedMcpBaseUrls(refreshed));
    try {
      return {
        result: await this.callMcpTool(session, toolName, args),
        serverCard: this.toServerCard(session),
      };
    } finally {
      session.close?.();
    }
  }

  private async chatWithMcpBaseUrls(
    baseUrls: string[],
    userId: string,
    userEmail: string,
    modelName: string,
    messages: PlaygroundMessage[],
  ): Promise<{ reply: string; toolCalls: Array<{ name: string; result: string }>; serverCard: McpServerCard }> {
    const session = await this.inspectMcpTarget(baseUrls);
    return this.chatWithMcpSession(session, userId, userEmail, modelName, messages);
  }

  private async chatWithMcpSession(
    session: McpHttpSession,
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
    try {
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
    } finally {
      session.close?.();
    }
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
      mcp.lastMessage = await this.buildFailureMessage(mcp.namespace, mcp.buildJobName, "Build job failed");
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

  private async buildFailureMessage(namespace: string, buildJobName: string, fallback: string): Promise<string> {
    try {
      const buildPod = await this.findFirstPodByLabel(namespace, "job-name", buildJobName);
      if (!buildPod) {
        return fallback;
      }
      const logs = await this.readPodLogSafely({
        namespace,
        name: buildPod.metadata?.name ?? "",
        container: buildPod.spec?.containers?.some((item) => item.name === "kaniko") ? "kaniko" : undefined,
      });
      return this.summarizeBuildFailure(logs, fallback);
    } catch (error) {
      this.logger.warn(
        `Failed to summarize MCP build failure namespace=${namespace} job=${buildJobName}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return fallback;
    }
  }

  private summarizeBuildFailure(logs: string, fallback: string): string {
    const cleanedLines = logs
      .replace(/\u001b\[[0-9;]*m/g, "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (!cleanedLines.length) {
      return fallback;
    }

    const failurePattern = /(error|failed|fatal|not found|denied|unauthorized|forbidden|no such file|cannot|unable)/i;
    const ignoredPattern = /^(info|time=|level=info\b|level=debug\b)/i;
    const matchedLine = [...cleanedLines]
      .reverse()
      .find((line) => failurePattern.test(line) && !ignoredPattern.test(line));
    const summary = matchedLine ?? cleanedLines[cleanedLines.length - 1];
    const normalized = summary.replace(/\s+/g, " ").trim();
    const truncated = normalized.length > 220 ? `${normalized.slice(0, 217)}...` : normalized;
    return truncated.toLowerCase().startsWith("build failed") ? truncated : `Build failed: ${truncated}`;
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
      try {
        return await this.connectMcpSse(baseUrl);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger.warn(`MCP SSE inspect failed endpoint=${baseUrl}: ${lastError.message}`);
      }
    }

    throw lastError ?? new Error("Failed to inspect MCP server");
  }

  private async inspectMcpHttpTarget(baseUrls: string[]): Promise<McpHttpSession> {
    let lastError: Error | null = null;
    for (const baseUrl of this.expandMcpTransportUrls(baseUrls)) {
      try {
        return await this.connectMcpHttp(baseUrl);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger.warn(`MCP HTTP inspect failed endpoint=${baseUrl}: ${lastError.message}`);
      }
    }

    throw lastError ?? new Error("Failed to inspect MCP server over streamable HTTP");
  }

  private async inspectMcpSseTarget(baseUrls: string[]): Promise<McpHttpSession> {
    let lastError: Error | null = null;
    for (const baseUrl of this.expandMcpTransportUrls(baseUrls)) {
      try {
        return await this.connectMcpSse(baseUrl);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger.warn(`MCP SSE inspect failed endpoint=${baseUrl}: ${lastError.message}`);
      }
    }

    throw lastError ?? new Error("Failed to inspect MCP server over SSE");
  }

  private async connectExternalMcpTarget(
    transportType: "streamable-http" | "sse" | "stdio",
    input: McpInspectorConnectionInput,
  ): Promise<McpHttpSession> {
    if (transportType === "stdio") {
      return this.connectMcpStdio(input);
    }
    if (transportType === "sse") {
      return this.inspectMcpSseTarget([this.normalizeExternalMcpUrl(input.url)]);
    }
    return this.inspectMcpHttpTarget([this.normalizeExternalMcpUrl(input.url)]);
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
      transportType: "streamable-http",
      transportUrl,
      requestUrl: transportUrl,
      sessionId,
      protocolVersion: this.readString(initializePayload, "protocolVersion") || "2024-11-05",
      serverName: this.readNestedString(initializePayload, ["serverInfo", "name"]) || "MCP Server",
      serverVersion: this.readNestedString(initializePayload, ["serverInfo", "version"]) || "",
      instructions: this.readString(initializePayload, "instructions"),
      tools,
      close: () => undefined,
    };
  }

  private async connectMcpSse(transportUrl: string): Promise<McpHttpSession> {
    const sse = await this.openSseConnection(transportUrl);
    try {
      const requestUrl = await this.readSseEndpoint(transportUrl, sse);
      const initializeId = crypto.randomUUID();
      const initializeResult = await this.sendMcpSseRequest(sse, requestUrl, {
        jsonrpc: "2.0",
        id: initializeId,
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

      await this.sendMcpSseNotification(sse, requestUrl, sessionId, {
        jsonrpc: "2.0",
        method: "notifications/initialized",
        params: {},
      });

      const toolsResult = await this.sendMcpSseRequest(sse, requestUrl, {
        jsonrpc: "2.0",
        id: crypto.randomUUID(),
        method: "tools/list",
        params: {},
      }, sessionId);
      const toolsPayload = this.extractJsonRpcResult(toolsResult.body);
      const toolRows = Array.isArray((toolsPayload as { tools?: unknown[] }).tools)
        ? ((toolsPayload as { tools: unknown[] }).tools ?? [])
        : [];
      const tools = toolRows
        .map((tool) => this.normalizeMcpTool(tool))
        .filter((tool): tool is McpToolDefinition => tool !== null);

      return {
        transportType: "sse",
        transportUrl,
        requestUrl,
        sessionId: toolsResult.sessionId ?? sessionId,
        protocolVersion: this.readString(initializePayload, "protocolVersion") || "2024-11-05",
        serverName: this.readNestedString(initializePayload, ["serverInfo", "name"]) || "MCP Server",
        serverVersion: this.readNestedString(initializePayload, ["serverInfo", "version"]) || "",
        instructions: this.readString(initializePayload, "instructions"),
        tools,
        close: () => sse.close(),
        sseConnection: sse,
      };
    } catch (error) {
      sse.close();
      throw error;
    }
  }

  private async connectMcpStdio(input: McpInspectorConnectionInput): Promise<McpHttpSession> {
    const command = input.command.trim();
    if (!command) {
      throw new Error("MCP stdio command is required");
    }
    const stdio = this.openStdioConnection(command, input.args, input.cwd, input.env);
    try {
      const initializePayload = this.extractJsonRpcResult(
        await stdio.send({
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
        }),
      );

      await stdio.notify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
        params: {},
      });

      const toolsPayload = this.extractJsonRpcResult(
        await stdio.send({
          jsonrpc: "2.0",
          id: crypto.randomUUID(),
          method: "tools/list",
          params: {},
        }),
      );
      const toolRows = Array.isArray((toolsPayload as { tools?: unknown[] }).tools)
        ? ((toolsPayload as { tools: unknown[] }).tools ?? [])
        : [];
      const tools = toolRows
        .map((tool) => this.normalizeMcpTool(tool))
        .filter((tool): tool is McpToolDefinition => tool !== null);

      return {
        transportType: "stdio",
        transportUrl: this.normalizeInspectorCommandLabel(command, input.args),
        requestUrl: "",
        sessionId: null,
        protocolVersion: this.readString(initializePayload, "protocolVersion") || "2024-11-05",
        serverName: this.readNestedString(initializePayload, ["serverInfo", "name"]) || "MCP Server",
        serverVersion: this.readNestedString(initializePayload, ["serverInfo", "version"]) || "",
        instructions: this.readString(initializePayload, "instructions"),
        tools,
        close: () => stdio.close(),
        stdioConnection: stdio,
      };
    } catch (error) {
      stdio.close();
      throw error;
    }
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
    const response =
      session.transportType === "stdio"
        ? await session.stdioConnection!.send({
            jsonrpc: "2.0",
            id: crypto.randomUUID(),
            method: "tools/call",
            params: {
              name,
              arguments: args,
            },
          })
        : session.transportType === "sse"
        ? await this.sendMcpSseRequest(
            session.sseConnection ?? null,
            session.requestUrl,
            {
              jsonrpc: "2.0",
              id: crypto.randomUUID(),
              method: "tools/call",
              params: {
                name,
                arguments: args,
              },
            },
            session.sessionId,
          )
        : await this.sendMcpRequest(session.transportUrl, session.sessionId, {
            jsonrpc: "2.0",
            id: crypto.randomUUID(),
            method: "tools/call",
            params: {
              name,
              arguments: args,
            },
          });
    const payload = this.extractJsonRpcResult("body" in (response as { body?: unknown }) ? (response as { body: unknown }).body : response);
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

  private async sendMcpSseNotification(
    sseConnection: McpSseConnection,
    requestUrl: string,
    sessionId: string | null,
    body: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.sendMcpSseRequest(sseConnection, requestUrl, body, sessionId);
    } catch {
      // ignore notification failures
    }
  }

  private async sendMcpSseRequest(
    sseConnection: McpSseConnection | null,
    requestUrl: string,
    body: Record<string, unknown>,
    sessionId?: string | null,
  ): Promise<{ body: unknown; sessionId: string | null }> {
    if (!sseConnection) {
      throw new Error("SSE connection is not available");
    }

    const requestId = typeof body.id === "string" || typeof body.id === "number" ? String(body.id) : null;
    const response = await this.fetchWithOptionalInsecureTls(requestUrl, {
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
    const nextSessionId = response.headers.get("mcp-session-id") ?? response.headers.get("Mcp-Session-Id") ?? sessionId ?? null;
    const parsedBody = raw.trim() ? this.parseJsonOrSse(raw) : null;
    if (parsedBody && requestId) {
      const responseId = this.readJsonRpcId(parsedBody);
      if (!responseId || responseId === requestId) {
        return {
          body: parsedBody,
          sessionId: nextSessionId,
        };
      }
    } else if (parsedBody) {
      return {
        body: parsedBody,
        sessionId: nextSessionId,
      };
    }

    if (!requestId) {
      return {
        body: {},
        sessionId: nextSessionId,
      };
    }

    return {
      body: await this.waitForSseJsonRpcResponse(sseConnection, requestId),
      sessionId: nextSessionId,
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

  private async openSseConnection(url: string): Promise<McpSseConnection> {
    return new Promise((resolve, reject) => {
      const target = new URL(url);
      const client = target.protocol === "https:" ? https : http;
      const queue: Array<{ event: string | null; data: string }> = [];
      const waiters: Array<{
        resolve: (event: { event: string | null; data: string }) => void;
        reject: (error: Error) => void;
        timeout: NodeJS.Timeout;
      }> = [];
      let buffer = "";
      let closed = false;
      let responseEnded = false;

      const failAll = (error: Error) => {
        while (waiters.length) {
          const waiter = waiters.shift()!;
          clearTimeout(waiter.timeout);
          waiter.reject(error);
        }
      };

      const close = () => {
        if (closed) {
          return;
        }
        closed = true;
        req.destroy();
        failAll(new Error("SSE connection closed"));
      };

      const pushEvent = (event: { event: string | null; data: string }) => {
        if (waiters.length) {
          const waiter = waiters.shift()!;
          clearTimeout(waiter.timeout);
          waiter.resolve(event);
          return;
        }
        queue.push(event);
      };

      const drainBuffer = () => {
        while (true) {
          const separatorIndex = buffer.search(/\r?\n\r?\n/);
          if (separatorIndex === -1) {
            return;
          }
          const rawEvent = buffer.slice(0, separatorIndex);
          const separatorLength = buffer.startsWith("\r\n\r\n", separatorIndex) ? 4 : buffer.slice(separatorIndex).startsWith("\n\n") ? 2 : 2;
          buffer = buffer.slice(separatorIndex + separatorLength);
          const event = this.parseSseEvent(rawEvent);
          if (event) {
            pushEvent(event);
          }
        }
      };

      const req = client.request(
        {
          protocol: target.protocol,
          hostname: target.hostname,
          port: target.port || undefined,
          path: `${target.pathname}${target.search}`,
          method: "GET",
          headers: {
            accept: "application/json, text/event-stream",
            "cache-control": "no-cache",
          },
          rejectUnauthorized: target.protocol === "https:" ? false : undefined,
        },
        (res) => {
          if ((res.statusCode ?? 500) < 200 || (res.statusCode ?? 500) >= 300) {
            reject(new Error(`MCP SSE connection failed (${res.statusCode ?? 500})`));
            req.destroy();
            return;
          }

          res.on("data", (chunk) => {
            buffer += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
            drainBuffer();
          });
          res.on("end", () => {
            responseEnded = true;
            if (!closed) {
              failAll(new Error("MCP SSE connection ended"));
            }
          });
          res.on("error", (error) => {
            if (!closed) {
              failAll(error instanceof Error ? error : new Error(String(error)));
            }
          });

          resolve({
            nextEvent: (timeoutMs = 5000) =>
              new Promise((nextResolve, nextReject) => {
                if (queue.length) {
                  nextResolve(queue.shift()!);
                  return;
                }
                if (closed || responseEnded) {
                  nextReject(new Error("MCP SSE connection closed"));
                  return;
                }
                const timeout = setTimeout(() => {
                  const index = waiters.findIndex((item) => item.resolve === nextResolve);
                  if (index >= 0) {
                    waiters.splice(index, 1);
                  }
                  nextReject(new Error("Timed out while waiting for MCP SSE event"));
                }, timeoutMs);
                waiters.push({ resolve: nextResolve, reject: nextReject, timeout });
              }),
            close,
          });
        },
      );

      req.on("error", (error) => {
        if (!closed) {
          reject(error instanceof Error ? error : new Error(String(error)));
          failAll(error instanceof Error ? error : new Error(String(error)));
        }
      });
      req.end();
    });
  }

  private openStdioConnection(command: string, args: string[], cwd: string, env: Record<string, string>): McpStdioConnection {
    const child = spawn(command, args, {
      cwd: cwd.trim() || undefined,
      env: {
        ...process.env,
        ...env,
      },
      stdio: "pipe",
      shell: false,
    });
    const pending = new Map<
      string,
      {
        resolve: (value: unknown) => void;
        reject: (error: Error) => void;
        timeout: NodeJS.Timeout;
      }
    >();
    let stdoutBuffer = Buffer.alloc(0);
    let stderrBuffer = "";
    let closed = false;

    const rejectPending = (error: Error) => {
      for (const pendingRequest of pending.values()) {
        clearTimeout(pendingRequest.timeout);
        pendingRequest.reject(error);
      }
      pending.clear();
    };

    const consumeFrames = () => {
      while (stdoutBuffer.length > 0) {
        const separatorIndex = stdoutBuffer.indexOf(Buffer.from("\r\n\r\n"));
        if (separatorIndex === -1) {
          return;
        }
        const headerText = stdoutBuffer.slice(0, separatorIndex).toString("utf8");
        const contentLengthMatch = headerText.match(/content-length:\s*(\d+)/i);
        if (!contentLengthMatch) {
          throw new Error("Invalid MCP stdio frame without Content-Length");
        }
        const contentLength = Number(contentLengthMatch[1]);
        const bodyStart = separatorIndex + 4;
        if (stdoutBuffer.length < bodyStart + contentLength) {
          return;
        }
        const payloadRaw = stdoutBuffer.slice(bodyStart, bodyStart + contentLength).toString("utf8");
        stdoutBuffer = stdoutBuffer.slice(bodyStart + contentLength);
        const payload = JSON.parse(payloadRaw) as Record<string, unknown>;
        const id = this.readJsonRpcId(payload);
        if (!id) {
          continue;
        }
        const request = pending.get(id);
        if (!request) {
          continue;
        }
        clearTimeout(request.timeout);
        pending.delete(id);
        request.resolve(payload);
      }
    };

    child.stdout.on("data", (chunk) => {
      stdoutBuffer = Buffer.concat([stdoutBuffer, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
      try {
        consumeFrames();
      } catch (error) {
        rejectPending(error instanceof Error ? error : new Error(String(error)));
      }
    });
    child.stderr.on("data", (chunk) => {
      stderrBuffer += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
    });
    child.on("error", (error) => {
      rejectPending(error instanceof Error ? error : new Error(String(error)));
    });
    child.on("exit", (code, signal) => {
      closed = true;
      rejectPending(new Error(`MCP stdio process exited${code !== null ? ` (${code})` : ""}${signal ? ` signal=${signal}` : ""}${stderrBuffer ? `: ${stderrBuffer.trim()}` : ""}`));
    });

    const close = () => {
      if (closed) {
        return;
      }
      closed = true;
      child.kill();
      rejectPending(new Error(`MCP stdio process closed${stderrBuffer ? `: ${stderrBuffer.trim()}` : ""}`));
    };

    const writeFrame = (body: Record<string, unknown>) => {
      const payload = Buffer.from(JSON.stringify(body), "utf8");
      const header = Buffer.from(`Content-Length: ${payload.length}\r\n\r\n`, "utf8");
      child.stdin.write(Buffer.concat([header, payload]));
    };

    return {
      send: (body: Record<string, unknown>, timeoutMs = 10000) =>
        new Promise((resolve, reject) => {
          if (closed) {
            reject(new Error("MCP stdio process is closed"));
            return;
          }
          const id = this.readJsonRpcId(body);
          if (!id) {
            reject(new Error("MCP stdio request id is required"));
            return;
          }
          const timeout = setTimeout(() => {
            pending.delete(id);
            reject(new Error(`Timed out while waiting for MCP stdio response (${id})${stderrBuffer ? `: ${stderrBuffer.trim()}` : ""}`));
          }, timeoutMs);
          pending.set(id, { resolve, reject, timeout });
          try {
            writeFrame(body);
          } catch (error) {
            clearTimeout(timeout);
            pending.delete(id);
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        }),
      notify: async (body: Record<string, unknown>) => {
        if (closed) {
          throw new Error("MCP stdio process is closed");
        }
        writeFrame(body);
      },
      close,
    };
  }

  private parseSseEvent(rawEvent: string): { event: string | null; data: string } | null {
    const lines = rawEvent.split(/\r?\n/);
    let eventName: string | null = null;
    const dataLines: string[] = [];
    for (const line of lines) {
      if (!line || line.startsWith(":")) {
        continue;
      }
      if (line.startsWith("event:")) {
        eventName = line.replace(/^event:\s*/, "").trim() || null;
        continue;
      }
      if (line.startsWith("data:")) {
        dataLines.push(line.replace(/^data:\s*/, ""));
      }
    }
    const data = dataLines.join("\n").trim();
    if (!eventName && !data) {
      return null;
    }
    return {
      event: eventName,
      data,
    };
  }

  private async readSseEndpoint(transportUrl: string, sseConnection: McpSseConnection): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const event = await sseConnection.nextEvent(5000);
      const endpointCandidate = event.event === "endpoint" ? event.data : event.data;
      if (!endpointCandidate) {
        continue;
      }
      if (/^https?:\/\//i.test(endpointCandidate) || endpointCandidate.startsWith("/")) {
        return new URL(endpointCandidate, transportUrl).toString();
      }
    }
    throw new Error("Failed to discover MCP SSE endpoint");
  }

  private async waitForSseJsonRpcResponse(sseConnection: McpSseConnection, requestId: string): Promise<unknown> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const event = await sseConnection.nextEvent(5000);
      if (!event.data) {
        continue;
      }
      const payload = this.parseJsonOrSse(event.data);
      if (this.readJsonRpcId(payload) === requestId) {
        return payload;
      }
    }
    throw new Error(`Timed out while waiting for MCP SSE response (${requestId})`);
  }

  private readJsonRpcId(payload: unknown): string | null {
    if (!payload || typeof payload !== "object") {
      return null;
    }
    const id = (payload as Record<string, unknown>).id;
    if (typeof id === "string" || typeof id === "number") {
      return String(id);
    }
    return null;
  }

  private normalizeInspectorCommandLabel(command: string, args: string[]): string {
    return [command.trim(), ...args.map((item) => item.trim()).filter(Boolean)].filter(Boolean).join(" ");
  }

  private parseJsonOrSse(raw: string): unknown {
    const trimmed = raw.trim();
    if (!trimmed) {
      return {};
    }
    if (!/(^|\n)\s*(event|data):/i.test(trimmed)) {
      return JSON.parse(trimmed);
    }

    const events = trimmed
      .split(/\r?\n\r?\n/)
      .map((chunk) => this.parseSseEvent(chunk.trim()))
      .filter((event): event is { event: string | null; data: string } => Boolean(event?.data));
    const lastPayload = events[events.length - 1]?.data ?? "";
    if (!lastPayload) {
      return {};
    }
    return JSON.parse(lastPayload);
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

  private async stopMcpDeployment(
    mcp: McpDeploymentEntity,
    actorUserId: string,
    adminOverride = false,
  ): Promise<McpDeploymentEntity> {
    await this.deleteServingResources(mcp);
    mcp.status = "stopped";
    mcp.lastMessage = "MCP stopped.";
    const saved = await this.mcpRepository.save(mcp);
    await this.logsService.writeAuditLog({
      userId: actorUserId,
      actionKey: "MCP_STOPPED",
      targetType: "mcp",
      targetId: mcp.id,
      projectId: mcp.projectId,
      metadata: {
        mcpName: mcp.mcpName,
        repoId: mcp.repoId,
        ownerUserId: mcp.ownerUserId,
        adminOverride,
      },
    });
    return saved;
  }

  private extractEcrRegion(repository: string): string {
    const match = repository.match(/ecr\.([a-z0-9-]+)\.amazonaws\.com/i);
    return match?.[1] ?? this.configService.get<string>("AWS_REGION", "us-east-1");
  }
}
