import { ConflictException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import * as k8s from "@kubernetes/client-node";
import { Repository } from "typeorm";
import { AuthService } from "../auth/auth.service";
import { GitlabService } from "../gitlab/gitlab.service";
import { GitlabRepoEntity } from "../gitlab/entities/gitlab-repo.entity";
import { LlmService } from "../llm/llm.service";
import { LiteLlmModelAccessRequestEntity } from "../llm/entities/litellm-model-access-request.entity";
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

  async createAgent(dto: CreateAgentDto, userId: string): Promise<AgentDeploymentEntity> {
    await this.projectsService.getProject(dto.projectId);
    await this.ensureProjectServingCapacity(dto.projectId);
    const repo = await this.gitlabService.getRepo(dto.projectId, dto.repoId);
    const user = await this.authService.findById(userId);
    const displayAgentName = dto.agentName.trim();
    const selectedModel = dto.litellmModel.trim();
    if (!selectedModel) {
      throw new Error("LITELLM model is required");
    }
    const catalogModel = await this.llmService.getCatalogModel(selectedModel);
    const ecrRepository = this.configService.get<string>("AGENT_ECR_REPOSITORY")?.trim() ?? "";
    if (!ecrRepository) {
      throw new Error("AGENT_ECR_REPOSITORY is not configured");
    }
    const namespace = this.configService.get<string>("K8S_AGENT_NAMESPACE", "agent-serving");
    const id = crypto.randomUUID();
    const nameSuffix = id.replace(/-/g, "").slice(0, 12);
    const deploymentName = `agent-${nameSuffix}`;
    const buildJobName = `${deploymentName}-build`;
    const serviceName = deploymentName;
    const ingressName = `${deploymentName}-ing`;
    const imageTag = id;
    const imageUrl = `${ecrRepository.replace(/\/+$/, "")}:${imageTag}`;
    const endpointUrl = this.buildAgentEndpointUrl(deploymentName);
    const agentKey = await this.llmService.ensureProjectVirtualKey(dto.projectId, userId, `agent-${id}`);
    const userKey = user ? await this.llmService.ensureUserVirtualKey(userId, user.email, user.displayName) : null;

    const agent = await this.agentRepository.save(
      this.agentRepository.create({
        id,
        projectId: dto.projectId,
        repoId: dto.repoId,
        ownerUserId: userId,
        agentName: displayAgentName,
        description: dto.description?.trim() ?? "",
        dockerfilePath: dto.dockerfilePath?.trim() || "./Dockerfile",
        litellmModel: catalogModel.modelName,
        ecrRepository,
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
        modelAccessRequestId: null,
      }),
    );

    if (catalogModel.isDefault) {
      await this.llmService.configureProjectKeyModels(agent.litellmApiKey ?? "", [catalogModel.modelName]);
    } else {
      const request = await this.llmService.createModelAccessRequest(userId, {
        modelName: catalogModel.modelName,
        requestType: "agent_deploy",
        projectId: dto.projectId,
        agentId: agent.id,
      });
      agent.modelAccessRequestId = request.id;
      agent.lastMessage = "Build requested. Waiting for admin approval after successful build.";
      await this.agentRepository.save(agent);
    }

    await this.ensureNamespace(namespace);
    await this.ensureBuildJob(agent, repo, {
      gitUserName: user?.displayName?.trim() || user?.email || "Agent User",
      gitUserEmail: user?.email || "agent@example.com",
      gitlabToken: this.configService.get<string>("GITLAB_TOKEN")?.trim() ?? "",
      liteLlmApiKey: agent.litellmApiKey ?? "",
      validatorLiteLlmApiKey: userKey?.apiKey ?? "",
      validatorLiteLlmBaseUrl: this.configService.get<string>("LITELLM_BASE_URL", ""),
      validatorLiteLlmModel: this.configService.get<string>("AGENT_VALIDATOR_LLM_MODEL", "gpt-4.1-mini"),
    });

    return this.refreshAgentStatus(agent);
  }

  async stopAgent(agentId: string, userId: string): Promise<AgentDeploymentEntity> {
    const agent = await this.agentRepository.findOneByOrFail({ id: agentId, ownerUserId: userId });
    await this.deleteServingResources(agent);
    agent.status = "stopped";
    agent.lastMessage = "Agent stopped.";
    return this.agentRepository.save(agent);
  }

  async restartAgent(agentId: string, userId: string): Promise<AgentDeploymentEntity> {
    const agent = await this.agentRepository.findOneByOrFail({ id: agentId, ownerUserId: userId });
    await this.ensureProjectServingCapacity(agent.projectId, agent.id);
    if (agent.modelAccessRequestId) {
      const request = await this.modelAccessRequestRepository.findOne({ where: { id: agent.modelAccessRequestId } });
      if (!request || request.status === "pending") {
        agent.status = "pending_approval";
        agent.lastMessage = "Waiting for admin model approval.";
        return this.agentRepository.save(agent);
      }
      if (request.status === "rejected") {
        agent.status = "failed";
        agent.lastMessage = "Model approval rejected by administrator.";
        return this.agentRepository.save(agent);
      }
    }

    agent.status = "deploying";
    agent.lastMessage = "Restart requested.";
    await this.agentRepository.save(agent);
    await this.deleteServingResources(agent);
    await this.ensureServingResources(agent);
    return this.refreshAgentStatus(agent);
  }

  async deleteAgent(agentId: string, userId: string): Promise<{ id: string }> {
    const agent = await this.agentRepository.findOneByOrFail({ id: agentId, ownerUserId: userId });
    await this.deleteAgentResources(agent);
    if (agent.modelAccessRequestId) {
      await this.modelAccessRequestRepository.delete({ id: agent.modelAccessRequestId });
    }
    await this.agentRepository.delete({ id: agent.id, ownerUserId: userId });
    return { id: agent.id };
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

    if (agent.status === "building" || agent.status === "failed" || agent.status === "pending_approval") {
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

  async chatWithAgent(agentId: string, _userId: string, message: string): Promise<{ reply: string; endpoint: string }> {
    const agent = await this.agentRepository.findOneByOrFail({ id: agentId });
    const refreshed = await this.refreshAgentStatus(agent);
    if (refreshed.status !== "running") {
      throw new Error("Agent is not running");
    }

    const externalBaseUrl = refreshed.endpointUrl.replace(/\/+$/, "");
    const internalBaseUrl = `http://${refreshed.serviceName}.${refreshed.namespace}.svc.cluster.local:8080`;
    const endpointCandidates: Array<{ url: string; body: Record<string, unknown> }> = [
      {
        url: `${internalBaseUrl}/a2a/rest`,
        body: {
          message,
          input: message,
        },
      },
      {
        url: `${internalBaseUrl}/a2a/jsonrpc`,
        body: {
          jsonrpc: "2.0",
          id: crypto.randomUUID(),
          method: "message/send",
          params: {
            message: {
              role: "user",
              parts: [{ type: "text", text: message }],
            },
          },
        },
      },
      {
        url: `${externalBaseUrl}/a2a/rest`,
        body: {
          message,
          input: message,
        },
      },
      {
        url: `${externalBaseUrl}/a2a/jsonrpc`,
        body: {
          jsonrpc: "2.0",
          id: crypto.randomUUID(),
          method: "message/send",
          params: {
            message: {
              role: "user",
              parts: [{ type: "text", text: message }],
            },
          },
        },
      },
    ];

    for (const endpoint of endpointCandidates) {
      try {
        const response = await fetch(endpoint.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(endpoint.body),
        });
        if (!response.ok) {
          this.logger.warn(`Agent chat request failed endpoint=${endpoint.url} status=${response.status}`);
          continue;
        }

        const contentType = response.headers.get("content-type") ?? "";
        if (contentType.includes("application/json")) {
          const payload = (await response.json()) as Record<string, unknown>;
          const reply = this.extractAgentReply(payload);
          return { reply, endpoint: endpoint.url };
        }

        const reply = await response.text();
        return { reply: reply.trim(), endpoint: endpoint.url };
      } catch (error) {
        this.logger.warn(
          `Agent chat request error endpoint=${endpoint.url}: ${error instanceof Error ? error.message : String(error)}`,
        );
        continue;
      }
    }

    throw new Error("Failed to reach agent A2A endpoint");
  }

  private async refreshAgentStatus(agent: AgentDeploymentEntity): Promise<AgentDeploymentEntity> {
    if (agent.status === "building" || agent.status === "deploying" || agent.status === "pending_approval") {
      const refreshed = await this.refreshBuildAndDeployStatus(agent);
      return refreshed;
    }

    if (agent.status === "running") {
      const deployment = await this.safeReadDeployment(agent);
      const readyReplicas = deployment?.status?.readyReplicas ?? 0;
      const desiredReplicas = deployment?.spec?.replicas ?? 1;
      if (readyReplicas < desiredReplicas) {
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
      if (agent.modelAccessRequestId) {
        const request = await this.modelAccessRequestRepository.findOne({ where: { id: agent.modelAccessRequestId } });
        if (!request || request.status === "pending") {
          agent.status = "pending_approval";
          agent.lastMessage = "Build complete. Waiting for admin model approval.";
          return this.agentRepository.save(agent);
        }
        if (request.status === "rejected") {
          agent.status = "failed";
          agent.lastMessage = "Model approval rejected by administrator.";
          return this.agentRepository.save(agent);
        }
        await this.llmService.configureProjectKeyModels(agent.litellmApiKey ?? "", [agent.litellmModel]);
      }

      const deployment = await this.safeReadDeployment(agent);
      if (!deployment) {
        if (!(await this.hasProjectServingCapacity(agent.projectId, agent.id))) {
          agent.status = "stopped";
          agent.lastMessage = "Build complete. No serving slot available. Stop another agent and restart this one.";
          return this.agentRepository.save(agent);
        }
        await this.ensureServingResources(agent);
        agent.status = "deploying";
        agent.lastMessage = "Build complete. Deploying agent.";
        return this.agentRepository.save(agent);
      }

      const readyReplicas = deployment.status?.readyReplicas ?? 0;
      const desiredReplicas = deployment.spec?.replicas ?? 1;
      agent.status = readyReplicas >= desiredReplicas ? "running" : "deploying";
      agent.lastMessage = agent.status === "running" ? "Agent is ready." : "Waiting for serving endpoint";
      return this.agentRepository.save(agent);
    }

    return agent;
  }

  private async ensureBuildJob(
    agent: AgentDeploymentEntity,
    repo: GitlabRepoEntity,
    options: {
      gitUserName: string;
      gitUserEmail: string;
      gitlabToken: string;
      liteLlmApiKey: string;
      validatorLiteLlmApiKey: string;
      validatorLiteLlmBaseUrl: string;
      validatorLiteLlmModel: string;
    },
  ): Promise<void> {
    const repoCloneUrl = repo.cloneUrl ?? repo.webUrl?.concat(".git") ?? "";
    const dockerfilePath = this.normalizeDockerfilePath(agent.dockerfilePath);
    const awsRegion = this.extractEcrRegion(agent.ecrRepository);
    const cloneScript = [
      "set -e",
      `TARGET_URL="${repoCloneUrl}"`,
      "mkdir -p /workspace",
      "if [ -n \"$TARGET_URL\" ] && [ -n \"$GITLAB_TOKEN\" ] && echo \"$TARGET_URL\" | grep -q '^https://'; then",
      "  TARGET_URL=$(echo \"$TARGET_URL\" | sed \"s#https://#https://oauth2:${GITLAB_TOKEN}@#\")",
      "fi",
      "git clone \"$TARGET_URL\" /workspace/repo",
    ].join("\n");
    const validateScript = this.buildValidatorScript(agent, dockerfilePath);

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
              serviceAccountName: this.configService.get<string>("K8S_AGENT_BUILD_SERVICE_ACCOUNT", "agent-builder"),
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
                  env: [
                    { name: "VALIDATOR_LITELLM_API_KEY", value: options.validatorLiteLlmApiKey },
                    { name: "VALIDATOR_LITELLM_BASE_URL", value: options.validatorLiteLlmBaseUrl },
                    { name: "VALIDATOR_LITELLM_MODEL", value: options.validatorLiteLlmModel },
                    { name: "DEPLOY_LITELLM_BASE_URL", value: this.configService.get<string>("LITELLM_BASE_URL", "") },
                    { name: "DEPLOY_LITELLM_API_KEY", value: options.liteLlmApiKey },
                    { name: "DEPLOY_LITELLM_MODEL", value: agent.litellmModel },
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

  private buildValidatorScript(agent: AgentDeploymentEntity, dockerfilePath: string): string {
    const escapedDockerfilePath = dockerfilePath.replace(/"/g, '\\"');

    return [
      "set -e",
      "if [ -z \"$VALIDATOR_LITELLM_API_KEY\" ]; then echo \"Validator LiteLLM key is missing\"; exit 1; fi",
      "if [ -z \"$VALIDATOR_LITELLM_BASE_URL\" ]; then echo \"Validator LiteLLM base URL is missing\"; exit 1; fi",
      `if [ ! -f "/workspace/repo/${escapedDockerfilePath}" ]; then echo "Dockerfile not found"; exit 1; fi`,
      "mkdir -p /tmp/agent-validator",
      "cd /tmp/agent-validator",
      "npm init -y >/dev/null 2>&1",
      "npm install --silent @langchain/openai >/dev/null 2>&1",
      "cat <<'EOF' > /tmp/agent-validator/validate.js",
      "const fs = require(\"fs\");",
      "const path = require(\"path\");",
      "const { ChatOpenAI } = require(\"@langchain/openai\");",
      "",
      "const repoRoot = \"/workspace/repo\";",
      "const maxFiles = 120;",
      "const maxSnippetLength = 1200;",
      "const includeExt = new Set([\".ts\", \".tsx\", \".js\", \".jsx\", \".mjs\", \".cjs\", \".py\", \".go\", \".java\", \".kt\", \".rs\", \".json\", \".yaml\", \".yml\", \".sh\", \".md\", \".txt\"]);",
      "const suspiciousPatterns = [",
      "  /rm\\s+-rf\\s+\\//i,",
      "  /curl[^\\n]+\\|\\s*(sh|bash)/i,",
      "  /wget[^\\n]+\\|\\s*(sh|bash)/i,",
      "  /child_process/i,",
      "  /execSync\\s*\\(/i,",
      "  /spawn\\s*\\(/i,",
      "  /eval\\s*\\(/i,",
      "  /new Function\\s*\\(/i,",
      "  /subprocess\\.(Popen|run|call)/i,",
      "  /os\\.system\\s*\\(/i",
      "];",
      "",
      "function shouldSkip(name) {",
      "  return [\".git\", \"node_modules\", \".next\", \"dist\", \"build\", \"coverage\", \".turbo\", \".venv\", \"venv\", \"__pycache__\"].includes(name);",
      "}",
      "",
      "function walk(dir, acc = []) {",
      "  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {",
      "    if (shouldSkip(entry.name)) continue;",
      "    const full = path.join(dir, entry.name);",
      "    if (entry.isDirectory()) {",
      "      walk(full, acc);",
      "      continue;",
      "    }",
      "    if (!includeExt.has(path.extname(entry.name))) continue;",
      "    acc.push(full);",
      "    if (acc.length >= maxFiles) return acc;",
      "  }",
      "  return acc;",
      "}",
      "",
      "function safeRead(filePath) {",
      "  try {",
      "    return fs.readFileSync(filePath, \"utf8\");",
      "  } catch {",
      "    return \"\";",
      "  }",
      "}",
      "",
      "const files = walk(repoRoot);",
      "const a2aMatches = [];",
      "const envMatches = { LITELLM_API_KEY: [], LITELLM_BASE_URL: [], LITELLM_MODEL: [] };",
      "const suspiciousMatches = [];",
      "const snippets = [];",
      "",
      "for (const filePath of files) {",
      "  const content = safeRead(filePath);",
      "  if (!content) continue;",
      "  const rel = path.relative(repoRoot, filePath);",
      "  if (/A2A|a2a/.test(content)) a2aMatches.push(rel);",
      "  for (const key of Object.keys(envMatches)) {",
      "    if (content.includes(key)) envMatches[key].push(rel);",
      "  }",
      "  for (const pattern of suspiciousPatterns) {",
      "    const match = content.match(pattern);",
      "    if (match) {",
      "      suspiciousMatches.push({ file: rel, pattern: pattern.toString(), sample: match[0].slice(0, 200) });",
      "    }",
      "  }",
      "  if ((/A2A|a2a/.test(content) || /LITELLM_API_KEY|LITELLM_BASE_URL|LITELLM_MODEL/.test(content)) && snippets.length < 18) {",
      "    snippets.push({ file: rel, content: content.slice(0, maxSnippetLength) });",
      "  }",
      "}",
      "",
      "if (a2aMatches.length === 0) {",
      "  console.error(\"A2A usage not found in repository\");",
      "  process.exit(1);",
      "}",
      "for (const key of Object.keys(envMatches)) {",
      "  if (envMatches[key].length === 0) {",
      "    console.error(`${key} usage not found in repository`);",
      "    process.exit(1);",
      "  }",
      "}",
      "",
      "const llm = new ChatOpenAI({",
      "  model: process.env.VALIDATOR_LITELLM_MODEL || \"gpt-4.1-mini\",",
      "  apiKey: process.env.VALIDATOR_LITELLM_API_KEY,",
      "  configuration: { baseURL: `${String(process.env.VALIDATOR_LITELLM_BASE_URL || \"\").replace(/\\/+$/, \"\")}/v1` },",
      "  temperature: 0,",
      "});",
      "",
      "const prompt = [",
      "  \"You are reviewing a repository before container build.\",",
      "  \"Decide if it is safe and compatible for agent deployment.\",",
      "  \"Validation requirements:\",",
      "  \"1. The code must appear to implement an A2A-callable agent/service.\",",
      "  \"2. The code must be structured to receive and use injected env vars LITELLM_BASE_URL, LITELLM_API_KEY, LITELLM_MODEL at runtime.\",",
      "  \"3. Flag obviously malicious, destructive, or suspicious code paths.\",",
      "  \"Return strict JSON only: {\\\"pass\\\":boolean,\\\"summary\\\":string,\\\"reasons\\\":string[],\\\"risks\\\":string[]}\",",
      "  `Deployment env LITELLM_BASE_URL=${process.env.DEPLOY_LITELLM_BASE_URL || \"\"}`,",
      "  `Deployment env LITELLM_MODEL=${process.env.DEPLOY_LITELLM_MODEL || \"\"}`,",
      "  `A2A matches: ${JSON.stringify(a2aMatches)}`,",
      "  `Env matches: ${JSON.stringify(envMatches)}`,",
      "  `Suspicious matches: ${JSON.stringify(suspiciousMatches)}`,",
      "  `Relevant snippets: ${JSON.stringify(snippets)}`",
      "].join(\"\\n\");",
      "",
      "async function main() {",
      "  const response = await llm.invoke(prompt);",
      "  const text = typeof response.content === \"string\" ? response.content : JSON.stringify(response.content);",
      "  const jsonText = text.slice(text.indexOf(\"{\"), text.lastIndexOf(\"}\") + 1);",
      "  let parsed;",
      "  try {",
      "    parsed = JSON.parse(jsonText);",
      "  } catch (error) {",
      "    console.error(\"Validator returned invalid JSON:\", text);",
      "    process.exit(1);",
      "  }",
      "  if (!parsed.pass) {",
      "    console.error(parsed.summary || \"Validation failed\");",
      "    for (const reason of parsed.reasons || []) console.error(`- ${reason}`);",
      "    for (const risk of parsed.risks || []) console.error(`risk: ${risk}`);",
      "    process.exit(1);",
      "  }",
      "  console.log(parsed.summary || \"Validation passed\");",
      "}",
      "",
      "main().catch((error) => {",
      "  console.error(error instanceof Error ? error.message : String(error));",
      "  process.exit(1);",
      "});",
      "EOF",
      "node /tmp/agent-validator/validate.js",
    ].join("\n");
  }

  private async ensureServingResources(agent: AgentDeploymentEntity): Promise<void> {
    await this.ensureAgentDeployment(agent);
    await this.ensureAgentService(agent);
    await this.ensureAgentIngress(agent);
  }

  private async deleteServingResources(agent: AgentDeploymentEntity): Promise<void> {
    await Promise.allSettled([
      this.kubeClientApps?.deleteNamespacedDeployment({ namespace: agent.namespace, name: agent.deploymentName }),
      this.kubeClientCore?.deleteNamespacedService({ namespace: agent.namespace, name: agent.serviceName }),
      this.kubeClientNetworking?.deleteNamespacedIngress({ namespace: agent.namespace, name: agent.ingressName }),
    ]);
  }

  private async deleteAgentResources(agent: AgentDeploymentEntity): Promise<void> {
    await this.deleteServingResources(agent);
    await Promise.allSettled([
      this.kubeClientBatch?.deleteNamespacedJob({
        namespace: agent.namespace,
        name: agent.buildJobName,
        body: { propagationPolicy: "Background" } as k8s.V1DeleteOptions,
      }),
    ]);
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
                    { name: "LITELLM_BASE_URL", value: this.configService.get<string>("LITELLM_BASE_URL", "") },
                    { name: "LITELLM_MODEL", value: agent.litellmModel },
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

  private extractAgentReply(payload: Record<string, unknown>): string {
    const candidates = [
      payload.reply,
      payload.message,
      payload.output,
      payload.content,
      (payload.result as Record<string, unknown> | undefined)?.message,
      (payload.result as Record<string, unknown> | undefined)?.output,
      ((payload.result as Record<string, unknown> | undefined)?.message as Record<string, unknown> | undefined)?.content,
      ((((payload.result as Record<string, unknown> | undefined)?.message as Record<string, unknown> | undefined)?.parts ??
        []) as Array<Record<string, unknown>>)
        .map((part) => (typeof part?.text === "string" ? part.text : ""))
        .filter(Boolean)
        .join("\n"),
      (payload.data as Record<string, unknown> | undefined)?.reply,
      (payload.data as Record<string, unknown> | undefined)?.message,
      (payload.result as Record<string, unknown> | undefined)?.reply,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate;
      }
    }

    return JSON.stringify(payload, null, 2);
  }

  private normalizeDockerfilePath(rawPath: string): string {
    const trimmed = rawPath.trim().replace(/^\.\/+/, "");
    return trimmed || "Dockerfile";
  }

  private async hasProjectServingCapacity(projectId: string, excludeAgentId?: string): Promise<boolean> {
    const activeCount = await this.countProjectServingAgents(projectId, excludeAgentId);
    return activeCount < 2;
  }

  private async ensureProjectServingCapacity(projectId: string, excludeAgentId?: string): Promise<void> {
    if (!(await this.hasProjectServingCapacity(projectId, excludeAgentId))) {
      throw new ConflictException("No serving slot available for this project");
    }
  }

  private async countProjectServingAgents(projectId: string, excludeAgentId?: string): Promise<number> {
    const agents = await this.agentRepository.find({ where: { projectId } });
    return agents.filter((agent) => agent.id !== excludeAgentId && ["running", "deploying"].includes(agent.status)).length;
  }

  private sanitizeName(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50);
  }

  private extractEcrRegion(repository: string): string {
    const match = repository.match(/ecr\.([a-z0-9-]+)\.amazonaws\.com/i);
    return match?.[1] ?? this.configService.get<string>("AWS_REGION", "us-east-1");
  }
}
