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
import { CreateWorkspaceDto } from "./dto/create-workspace.dto";
import { WorkspaceSessionEntity } from "./entities/workspace-session.entity";

@Injectable()
export class WorkspacesService {
  private readonly logger = new Logger(WorkspacesService.name);
  private readonly kubeClientApps: k8s.AppsV1Api | null;
  private readonly kubeClientCore: k8s.CoreV1Api | null;
  private readonly kubeClientNetworking: k8s.NetworkingV1Api | null;

  constructor(
    private readonly configService: ConfigService,
    private readonly projectsService: ProjectsService,
    private readonly gitlabService: GitlabService,
    private readonly authService: AuthService,
    private readonly llmService: LlmService,
    @InjectRepository(WorkspaceSessionEntity)
    private readonly workspaceRepository: Repository<WorkspaceSessionEntity>,
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
      this.kubeClientApps = kc.makeApiClient(k8s.AppsV1Api);
      this.kubeClientCore = kc.makeApiClient(k8s.CoreV1Api);
      this.kubeClientNetworking = kc.makeApiClient(k8s.NetworkingV1Api);
      this.logger.log(`Kubernetes workspace client enabled (namespace=${this.configService.get<string>("K8S_WORKSPACE_NAMESPACE", "agent-workspaces")})`);
    } else {
      this.kubeClientApps = null;
      this.kubeClientCore = null;
      this.kubeClientNetworking = null;
      this.logger.log("Kubernetes workspace client disabled");
    }
  }

  async createWorkspace(dto: CreateWorkspaceDto, userId: string): Promise<WorkspaceSessionEntity> {
    this.logger.log(`Create workspace requested project=${dto.projectId} repo=${dto.repoId} user=${userId} runtime=${dto.runtime}`);
    await this.projectsService.getProject(dto.projectId);
    const repo = await this.gitlabService.getRepo(dto.projectId, dto.repoId);
    const user = await this.authService.findById(userId);
    const llmUserKey = user
      ? await this.llmService.ensureUserVirtualKey(userId, user.email, user.displayName)
      : null;

    const existing = await this.workspaceRepository.findOne({
      where: { projectId: dto.projectId, repoId: dto.repoId, userId },
    });
    if (existing) {
      this.logger.log(`Workspace already exists session=${existing.id} deployment=${existing.deploymentName}`);
      return this.refreshWorkspaceStatus(existing);
    }

    const namespace = this.configService.get<string>("K8S_WORKSPACE_NAMESPACE", "agent-workspaces");
    const shortProject = dto.projectId.replace(/-/g, "").slice(0, 6);
    const shortRepo = dto.repoId.replace(/-/g, "").slice(0, 6);
    const shortUser = userId.replace(/-/g, "").slice(0, 6);
    const suffix = `${shortProject}-${shortRepo}-${shortUser}`;
    const deploymentName = `ws-${suffix}`;
    const serviceName = deploymentName;
    const ingressName = `${deploymentName}-ing`;
    const pvcName = `${deploymentName}-pvc`;
    const hostSuffix = this.configService.get<string>("WORKSPACE_HOST_SUFFIX", "127.0.0.1.nip.io");
    const endpointUrl = `http://${deploymentName}.${hostSuffix}`;

    const session = await this.workspaceRepository.save(
      this.workspaceRepository.create({
        projectId: dto.projectId,
        repoId: dto.repoId,
        userId,
        runtime: dto.runtime,
        repoName: repo.repoName,
        endpointUrl,
        status: "provisioning",
        namespace,
        pvcName,
        deploymentName,
        serviceName,
        ingressName,
      }),
    );
    this.logger.log(
      `Workspace session created id=${session.id} namespace=${session.namespace} deployment=${session.deploymentName} pvc=${session.pvcName} image=${this.getRuntimeImage(session.runtime)}`,
    );

    try {
      await this.provisionWorkspace(session, repo, {
        gitUserName: user?.displayName?.trim() || user?.email || "Workspace User",
        gitUserEmail: user?.email || "workspace@example.com",
        liteLlmApiKey: llmUserKey?.apiKey ?? "",
      });
    } catch (error) {
      this.logger.error(
        `Workspace provisioning failed session=${session.id} namespace=${session.namespace} deployment=${session.deploymentName}: ${this.describeError(error)}`,
      );
      throw error;
    }
    return this.refreshWorkspaceStatus(session);
  }

  async listByProject(projectId: string, userId: string): Promise<WorkspaceSessionEntity[]> {
    const sessions = await this.workspaceRepository.find({
      where: { projectId, userId },
      order: { createdAt: "DESC" },
    });
    return Promise.all(sessions.map((session) => this.refreshWorkspaceStatus(session)));
  }

  async getWorkspace(workspaceId: string, userId: string): Promise<WorkspaceSessionEntity> {
    const session = await this.workspaceRepository.findOneByOrFail({ id: workspaceId, userId });
    return this.refreshWorkspaceStatus(session);
  }

  async updateWorkspaceRuntime(workspaceId: string, userId: string, runtime: string): Promise<WorkspaceSessionEntity> {
    const session = await this.workspaceRepository.findOneByOrFail({ id: workspaceId, userId });
    const repo = await this.gitlabService.getRepo(session.projectId, session.repoId);
    const user = await this.authService.findById(userId);
    const llmUserKey = user
      ? await this.llmService.ensureUserVirtualKey(userId, user.email, user.displayName)
      : null;

    session.runtime = runtime;
    session.status = "provisioning";
    await this.workspaceRepository.save(session);
    await this.deleteDeployment(session);
    await this.ensureDeployment(session, repo, {
      gitUserName: user?.displayName?.trim() || user?.email || "Workspace User",
      gitUserEmail: user?.email || "workspace@example.com",
      liteLlmApiKey: llmUserKey?.apiKey ?? "",
    });

    return this.refreshWorkspaceStatus(session);
  }

  async deleteWorkspace(workspaceId: string, userId: string): Promise<{ id: string }> {
    const session = await this.workspaceRepository.findOneByOrFail({ id: workspaceId, userId });

    await this.deleteWorkspaceResources(session);
    await this.workspaceRepository.delete({ id: session.id, userId });

    return { id: session.id };
  }

  private async provisionWorkspace(
    session: WorkspaceSessionEntity,
    repo: GitlabRepoEntity,
    gitIdentity: { gitUserName: string; gitUserEmail: string; liteLlmApiKey: string },
  ): Promise<void> {
    if (!this.kubeClientApps || !this.kubeClientCore || !this.kubeClientNetworking) {
      this.logger.warn(`Skipping workspace provisioning because Kubernetes clients are unavailable session=${session.id}`);
      return;
    }

    this.logger.log(`Provisioning workspace session=${session.id} namespace=${session.namespace} deployment=${session.deploymentName}`);
    await this.ensureNamespace(session.namespace);
    await this.ensurePvc(session);
    await this.ensureDeployment(session, repo, gitIdentity);
    await this.ensureService(session);
    await this.ensureIngress(session);
    this.logger.log(`Workspace resources ensured session=${session.id} namespace=${session.namespace} deployment=${session.deploymentName}`);
  }

  private async ensureNamespace(namespace: string): Promise<void> {
    if (!this.kubeClientCore) {
      return;
    }
    try {
      await this.kubeClientCore.readNamespace({ name: namespace });
    } catch (error) {
      this.logger.warn(`Workspace namespace check failed or namespace missing: ${namespace} (${this.describeError(error)})`);
      return;
    }
  }

  private async ensurePvc(session: WorkspaceSessionEntity): Promise<void> {
    if (!this.kubeClientCore) {
      return;
    }

    try {
      await this.kubeClientCore.readNamespacedPersistentVolumeClaim({
        namespace: session.namespace,
        name: session.pvcName,
      });
      this.logger.log(`Workspace PVC already exists namespace=${session.namespace} pvc=${session.pvcName}`);
    } catch {
      this.logger.log(`Creating workspace PVC namespace=${session.namespace} pvc=${session.pvcName}`);
      await this.kubeClientCore.createNamespacedPersistentVolumeClaim({
        namespace: session.namespace,
        body: {
          apiVersion: "v1",
          kind: "PersistentVolumeClaim",
          metadata: { name: session.pvcName },
          spec: {
            accessModes: ["ReadWriteOnce"],
            resources: {
              requests: {
                storage: "10Gi",
              },
            },
          },
        } as k8s.V1PersistentVolumeClaim,
      });
    }
  }

  private async ensureDeployment(
    session: WorkspaceSessionEntity,
    repo: GitlabRepoEntity,
    gitIdentity: { gitUserName: string; gitUserEmail: string; liteLlmApiKey: string },
  ): Promise<void> {
    if (!this.kubeClientApps) {
      return;
    }

    const repoCloneUrl = repo.cloneUrl ?? repo.webUrl?.concat(".git") ?? this.buildRepoCloneUrl(repo.namespacePath);
    const runtimeImage = this.getRuntimeImage(session.runtime);
    const gitToken = this.configService.get<string>("GITLAB_TOKEN")?.trim() ?? "";
    const liteLlmBaseUrl = this.configService.get<string>("LITELLM_BASE_URL")?.trim().replace(/\/+$/, "") ?? "";
    const devcontainer = this.buildDevcontainerJson(session.runtime);
    const gitSetupScript = [
      "if [ -d /workspace/repo/.git ]; then",
      "  cd /workspace/repo",
      "  git config user.name \"$GIT_USER_NAME\"",
      "  git config user.email \"$GIT_USER_EMAIL\"",
      "  git config push.autoSetupRemote true",
      "  if [ -n \"$TARGET_URL\" ]; then",
      "    if git remote get-url origin >/dev/null 2>&1; then",
      "      git remote set-url origin \"$TARGET_URL\"",
      "    else",
      "      git remote add origin \"$TARGET_URL\"",
      "    fi",
      "  fi",
      "  if [ -n \"$GIT_CREDENTIAL_URL\" ]; then",
        "    git config credential.helper 'store --file=/workspace/repo/.git-credentials'",
      "    printf '%s\\n' \"$GIT_CREDENTIAL_URL\" > /workspace/repo/.git-credentials",
      "    chmod 600 /workspace/repo/.git-credentials",
      "  fi",
      "fi",
    ].join("\n");
    const opencodeConfigScript = [
      "mkdir -p /workspace/.config/opencode",
      "cat <<'EOF' > /workspace/.config/opencode/opencode.json",
      "{",
      "  \"$schema\": \"https://opencode.ai/config.json\",",
      "  \"model\": \"litellm/us.anthropic.claude-sonnet-4-6\",",
      "  \"provider\": {",
      "    \"litellm\": {",
      "      \"npm\": \"@ai-sdk/openai-compatible\",",
      "      \"name\": \"LiteLLM\",",
      "      \"options\": {",
      `        \"baseURL\": \"${liteLlmBaseUrl}/v1\",`,
      "        \"apiKey\": \"__LITELLM_API_KEY__\"",
      "      },",
      "      \"models\": {",
      "        \"us.anthropic.claude-sonnet-4-6\": {",
      "          \"name\": \"Claude 4.6 Sonnet\"",
      "        },",
      "        \"us.anthropic.claude-opus-4-6-v1\": {",
      "          \"name\": \"Claude 4.6 Opus\"",
      "        },",
      "        \"gpt-oss-120b-1:0\": {",
      "          \"name\": \"GPT-OSS-120b\"",
      "        }",
      "      }",
      "    }",
      "  }",
      "}",
      "EOF",
      "sed -i \"s|__LITELLM_API_KEY__|${LITELLM_API_KEY}|g\" /workspace/.config/opencode/opencode.json",
      "chmod 600 /workspace/.config/opencode/opencode.json",
    ].join("\n");
    const initScript = [
      "set -e",
      `TARGET_URL="${repoCloneUrl}"`,
      "GIT_CREDENTIAL_URL=\"\"",
      "if [ -n \"$TARGET_URL\" ] && [ -n \"$GITLAB_TOKEN\" ] && echo \"$TARGET_URL\" | grep -q '^https://'; then",
      "  GIT_CREDENTIAL_URL=$(echo \"$TARGET_URL\" | sed \"s#https://#https://oauth2:${GITLAB_TOKEN}@#\")",
      "fi",
      "mkdir -p /workspace",
      "if [ ! -d /workspace/repo/.git ]; then",
      "  if [ -n \"$TARGET_URL\" ]; then",
      "    CLONE_URL=\"$TARGET_URL\"",
      "    if [ -n \"$GIT_CREDENTIAL_URL\" ]; then",
      "      CLONE_URL=\"$GIT_CREDENTIAL_URL\"",
      "    fi",
      "    git clone \"$CLONE_URL\" /workspace/repo",
      "  else",
      "    mkdir -p /workspace/repo",
      "    cd /workspace/repo",
      "    git init",
      "    git branch -M main",
      `    printf '# ${repo.repoName}\\n' > README.md`,
      "  fi",
      "fi",
      gitSetupScript,
      "mkdir -p /workspace/repo/.devcontainer",
      "cat <<'EOF' > /workspace/repo/.devcontainer/devcontainer.json",
      devcontainer,
      "EOF",
      opencodeConfigScript,
    ].join("\n");
    const runtimeSetupScript = [
      "set -e",
      "mkdir -p /root/.config/opencode",
      "if [ -f /workspace/.config/opencode/opencode.json ]; then",
      "  cp /workspace/.config/opencode/opencode.json /root/.config/opencode/opencode.json",
      "  chmod 600 /root/.config/opencode/opencode.json",
      "fi",
      `TARGET_URL="${repoCloneUrl}"`,
      "GIT_CREDENTIAL_URL=\"\"",
      "if [ -n \"$TARGET_URL\" ] && [ -n \"$GITLAB_TOKEN\" ] && echo \"$TARGET_URL\" | grep -q '^https://'; then",
      "  GIT_CREDENTIAL_URL=$(echo \"$TARGET_URL\" | sed \"s#https://#https://oauth2:${GITLAB_TOKEN}@#\")",
      "fi",
      gitSetupScript,
    ].join("\n");

    try {
      await this.kubeClientApps.readNamespacedDeployment({
        namespace: session.namespace,
        name: session.deploymentName,
      });
      this.logger.log(`Workspace deployment already exists namespace=${session.namespace} deployment=${session.deploymentName}`);
      return;
    } catch {
      this.logger.log(`Creating workspace deployment namespace=${session.namespace} deployment=${session.deploymentName} image=${runtimeImage}`);
      await this.kubeClientApps.createNamespacedDeployment({
        namespace: session.namespace,
        body: {
          apiVersion: "apps/v1",
          kind: "Deployment",
          metadata: { name: session.deploymentName },
          spec: {
            replicas: 1,
            selector: { matchLabels: { app: session.deploymentName } },
            template: {
              metadata: { labels: { app: session.deploymentName } },
              spec: {
                initContainers: [
                  {
                    name: "repo-bootstrap",
                    image: runtimeImage,
                    imagePullPolicy: "IfNotPresent",
                    command: ["sh", "-c", initScript],
                    env: [
                      { name: "GITLAB_TOKEN", value: gitToken },
                      { name: "GIT_USER_NAME", value: gitIdentity.gitUserName },
                      { name: "GIT_USER_EMAIL", value: gitIdentity.gitUserEmail },
                      { name: "LITELLM_API_KEY", value: gitIdentity.liteLlmApiKey },
                    ],
                    volumeMounts: [{ name: "workspace", mountPath: "/workspace" }],
                  },
                ],
                containers: [
                  {
                    name: "code-server",
                    image: runtimeImage,
                    imagePullPolicy: "IfNotPresent",
                    ports: [{ containerPort: 8080 }],
                    env: [
                      { name: "PASSWORD", value: "" },
                      { name: "SUDO_PASSWORD", value: "" },
                      { name: "GITLAB_TOKEN", value: gitToken },
                      { name: "GIT_USER_NAME", value: gitIdentity.gitUserName },
                      { name: "GIT_USER_EMAIL", value: gitIdentity.gitUserEmail },
                      { name: "LITELLM_API_KEY", value: gitIdentity.liteLlmApiKey },
                    ],
                    volumeMounts: [{ name: "workspace", mountPath: "/workspace" }],
                    command: ["sh", "-c"],
                    args: [
                      `${runtimeSetupScript}\ncode-server --auth none --bind-addr 0.0.0.0:8080 /workspace/repo`,
                    ],
                  },
                ],
                volumes: [{ name: "workspace", persistentVolumeClaim: { claimName: session.pvcName } }],
              },
            },
          },
        } as k8s.V1Deployment,
      });
    }
  }

  private async deleteDeployment(session: WorkspaceSessionEntity): Promise<void> {
    if (!this.kubeClientApps) {
      return;
    }

    try {
      await this.kubeClientApps.deleteNamespacedDeployment({
        namespace: session.namespace,
        name: session.deploymentName,
      });
    } catch {
      this.logger.warn(`Workspace deployment delete skipped namespace=${session.namespace} deployment=${session.deploymentName}`);
      return;
    }
  }

  private async deleteService(session: WorkspaceSessionEntity): Promise<void> {
    if (!this.kubeClientCore) {
      return;
    }

    try {
      await this.kubeClientCore.deleteNamespacedService({
        namespace: session.namespace,
        name: session.serviceName,
      });
    } catch {
      this.logger.warn(`Workspace service delete skipped namespace=${session.namespace} service=${session.serviceName}`);
      return;
    }
  }

  private async deleteIngress(session: WorkspaceSessionEntity): Promise<void> {
    if (!this.kubeClientNetworking) {
      return;
    }

    try {
      await this.kubeClientNetworking.deleteNamespacedIngress({
        namespace: session.namespace,
        name: session.ingressName,
      });
    } catch {
      this.logger.warn(`Workspace ingress delete skipped namespace=${session.namespace} ingress=${session.ingressName}`);
      return;
    }
  }

  private async deletePvc(session: WorkspaceSessionEntity): Promise<void> {
    if (!this.kubeClientCore) {
      return;
    }

    try {
      await this.kubeClientCore.deleteNamespacedPersistentVolumeClaim({
        namespace: session.namespace,
        name: session.pvcName,
      });
    } catch {
      this.logger.warn(`Workspace PVC delete skipped namespace=${session.namespace} pvc=${session.pvcName}`);
      return;
    }
  }

  private async deleteWorkspaceResources(session: WorkspaceSessionEntity): Promise<void> {
    await Promise.all([
      this.deleteIngress(session),
      this.deleteService(session),
    ]);
    await this.deleteDeployment(session);
    await this.deletePvc(session);
  }

  private async ensureService(session: WorkspaceSessionEntity): Promise<void> {
    if (!this.kubeClientCore) {
      return;
    }

    try {
      await this.kubeClientCore.readNamespacedService({
        namespace: session.namespace,
        name: session.serviceName,
      });
      this.logger.log(`Workspace service already exists namespace=${session.namespace} service=${session.serviceName}`);
      return;
    } catch {
      this.logger.log(`Creating workspace service namespace=${session.namespace} service=${session.serviceName}`);
      await this.kubeClientCore.createNamespacedService({
        namespace: session.namespace,
        body: {
          apiVersion: "v1",
          kind: "Service",
          metadata: { name: session.serviceName },
          spec: {
            selector: { app: session.deploymentName },
            ports: [{ port: 8080, targetPort: 8080 }],
          },
        } as k8s.V1Service,
      });
    }
  }

  private async ensureIngress(session: WorkspaceSessionEntity): Promise<void> {
    if (!this.kubeClientNetworking) {
      return;
    }

    const host = session.endpointUrl.replace(/^https?:\/\//, "");
    const ingressClassName = this.configService.get<string>("K8S_WORKSPACE_INGRESS_CLASS", "nginx");

    try {
      await this.kubeClientNetworking.readNamespacedIngress({
        namespace: session.namespace,
        name: session.ingressName,
      });
      this.logger.log(`Workspace ingress already exists namespace=${session.namespace} ingress=${session.ingressName}`);
      return;
    } catch {
      this.logger.log(`Creating workspace ingress namespace=${session.namespace} ingress=${session.ingressName} host=${host}`);
      await this.kubeClientNetworking.createNamespacedIngress({
        namespace: session.namespace,
        body: {
          apiVersion: "networking.k8s.io/v1",
          kind: "Ingress",
          metadata: {
            name: session.ingressName,
            annotations: {
              "kubernetes.io/ingress.class": ingressClassName,
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
                      path: "/",
                      pathType: "Prefix",
                      backend: {
                        service: {
                          name: session.serviceName,
                          port: { number: 8080 },
                        },
                      },
                    },
                  ],
                },
              },
            ],
          },
        } as k8s.V1Ingress,
      });
    }
  }

  private getRuntimeImage(runtime: string): string {
    if (runtime === "NODE22") {
      return this.configService.get<string>("WORKSPACE_IMAGE_NODE22", "agent-portal-vscode-node22:latest");
    }
    if (runtime === "NODE23") {
      return this.configService.get<string>("WORKSPACE_IMAGE_NODE23", "agent-portal-vscode-node23:latest");
    }
    if (runtime === "NODE24") {
      return this.configService.get<string>("WORKSPACE_IMAGE_NODE24", "agent-portal-vscode-node24:latest");
    }
    return this.configService.get<string>("WORKSPACE_IMAGE_PYTHON38", "agent-portal-vscode-python38:latest");
  }

  private buildDevcontainerJson(runtime: string): string {
    const config = {
      name: `${runtime.toLowerCase()} workspace`,
      image: this.getRuntimeImage(runtime),
      customizations: {
        vscode: {
          settings: {
            "files.autoSave": "afterDelay",
            "terminal.integrated.defaultProfile.linux": "bash",
          },
          extensions:
            runtime === "PYTHON3.8"
              ? ["ms-python.python", "ms-python.vscode-pylance", "ms-toolsai.jupyter"]
              : ["dbaeumer.vscode-eslint", "esbenp.prettier-vscode", "ms-vscode.vscode-typescript-next"],
        },
      },
      remoteUser: "root",
    };
    return JSON.stringify(config, null, 2);
  }

  private buildRepoCloneUrl(namespacePath: string): string {
    const gitBaseUrl =
      this.configService.get<string>("GITLAB_BASE_URL")?.trim() ||
      "";
    if (!gitBaseUrl || !namespacePath) {
      return "";
    }

    return `${gitBaseUrl.replace(/\/+$/, "")}/${namespacePath}.git`;
  }

  private async refreshWorkspaceStatus(session: WorkspaceSessionEntity): Promise<WorkspaceSessionEntity> {
    if (!this.kubeClientApps) {
      return session;
    }

    try {
      const deployment = await this.kubeClientApps.readNamespacedDeployment({
        namespace: session.namespace,
        name: session.deploymentName,
      });
      const readyReplicas = deployment.status?.readyReplicas ?? 0;
      const desiredReplicas = deployment.spec?.replicas ?? 1;
      const nextStatus = readyReplicas >= desiredReplicas ? "running" : "provisioning";
      this.logger.log(
        `Workspace status check session=${session.id} namespace=${session.namespace} deployment=${session.deploymentName} ready=${readyReplicas}/${desiredReplicas} status=${nextStatus}`,
      );

      if (session.status !== nextStatus) {
        session.status = nextStatus;
        return this.workspaceRepository.save(session);
      }

      return session;
    } catch (error) {
      this.logger.warn(
        `Workspace status check failed session=${session.id} namespace=${session.namespace} deployment=${session.deploymentName}: ${this.describeError(error)}`,
      );
      if (session.status !== "provisioning") {
        session.status = "provisioning";
        return this.workspaceRepository.save(session);
      }

      return session;
    }
  }

  private describeError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }
}
