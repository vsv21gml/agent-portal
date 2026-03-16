import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import * as k8s from "@kubernetes/client-node";
import { Repository } from "typeorm";
import { AuthService } from "../auth/auth.service";
import { GitlabService } from "../gitlab/gitlab.service";
import { GitlabRepoEntity } from "../gitlab/entities/gitlab-repo.entity";
import { LlmService } from "../llm/llm.service";
import { LogsService } from "../logs/logs.service";
import { ProjectsService } from "../projects/projects.service";
import { CreateWorkspaceDto } from "./dto/create-workspace.dto";
import { WorkspaceSessionEntity } from "./entities/workspace-session.entity";

@Injectable()
export class WorkspacesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkspacesService.name);
  private readonly kubeClientApps: k8s.AppsV1Api | null;
  private readonly kubeClientCore: k8s.CoreV1Api | null;
  private readonly kubeClientNetworking: k8s.NetworkingV1Api | null;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private cleanupRunning = false;
  private readonly healingSessions = new Set<string>();

  constructor(
    private readonly configService: ConfigService,
    private readonly projectsService: ProjectsService,
    private readonly gitlabService: GitlabService,
    private readonly authService: AuthService,
    private readonly llmService: LlmService,
    private readonly logsService: LogsService,
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

  onModuleInit(): void {
    if (!this.kubeClientApps || !this.kubeClientCore || !this.kubeClientNetworking) {
      return;
    }

    const cleanupIntervalMs = 5 * 60 * 1000;
    this.logger.log(`Starting workspace cleanup loop intervalMs=${cleanupIntervalMs}`);
    void this.cleanupOrphanedWorkspaceResources();
    this.cleanupTimer = setInterval(() => {
      void this.cleanupOrphanedWorkspaceResources();
    }, cleanupIntervalMs);
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
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

    await this.stopOtherUserWorkspaces(userId);

    const namespace = this.configService.get<string>("K8S_WORKSPACE_NAMESPACE", "agent-workspaces");
    const shortProject = dto.projectId.replace(/-/g, "").slice(0, 6);
    const shortRepo = dto.repoId.replace(/-/g, "").slice(0, 6);
    const shortUser = userId.replace(/-/g, "").slice(0, 6);
    const suffix = `${shortProject}-${shortRepo}-${shortUser}`;
    const deploymentName = `ws-${suffix}`;
    const serviceName = deploymentName;
    const ingressName = `${deploymentName}-ing`;
    const pvcName = `${deploymentName}-pvc`;
    const endpointUrl = this.buildWorkspaceEndpointUrl(deploymentName);

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
    await this.logsService.writeAuditLog({
      userId,
      actionKey: "WORKSPACE_CREATED",
      targetType: "workspace",
      targetId: session.id,
      projectId: session.projectId,
      metadata: { repoId: session.repoId, runtime: session.runtime, repoName: session.repoName },
    });

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

  async stopWorkspace(workspaceId: string, userId: string): Promise<WorkspaceSessionEntity> {
    const session = await this.workspaceRepository.findOneByOrFail({ id: workspaceId, userId });
    await this.deleteActiveWorkspaceResources(session);
    session.status = "stopped";
    const saved = await this.workspaceRepository.save(session);
    await this.logsService.writeAuditLog({
      userId,
      actionKey: "WORKSPACE_STOPPED",
      targetType: "workspace",
      targetId: session.id,
      projectId: session.projectId,
      metadata: { repoId: session.repoId, repoName: session.repoName },
    });
    return saved;
  }

  async restartWorkspace(workspaceId: string, userId: string): Promise<WorkspaceSessionEntity> {
    const session = await this.workspaceRepository.findOneByOrFail({ id: workspaceId, userId });
    const repo = await this.gitlabService.getRepo(session.projectId, session.repoId);
    const user = await this.authService.findById(userId);
    const llmUserKey = user
      ? await this.llmService.ensureUserVirtualKey(userId, user.email, user.displayName)
      : null;

    await this.stopOtherUserWorkspaces(userId, session.id);
    session.status = "provisioning";
    await this.workspaceRepository.save(session);
    await this.provisionWorkspace(session, repo, {
      gitUserName: user?.displayName?.trim() || user?.email || "Workspace User",
      gitUserEmail: user?.email || "workspace@example.com",
      liteLlmApiKey: llmUserKey?.apiKey ?? "",
    });
    await this.logsService.writeAuditLog({
      userId,
      actionKey: "WORKSPACE_RESTARTED",
      targetType: "workspace",
      targetId: session.id,
      projectId: session.projectId,
      metadata: { repoId: session.repoId, runtime: session.runtime, repoName: session.repoName },
    });
    return this.refreshWorkspaceStatus(session);
  }

  async deleteWorkspace(workspaceId: string, userId: string): Promise<{ id: string }> {
    const session = await this.workspaceRepository.findOneByOrFail({ id: workspaceId, userId });

    await this.deleteWorkspaceResources(session);
    await this.workspaceRepository.delete({ id: session.id, userId });
    await this.logsService.writeAuditLog({
      userId,
      actionKey: "WORKSPACE_DELETED",
      targetType: "workspace",
      targetId: session.id,
      projectId: session.projectId,
      metadata: { repoId: session.repoId, repoName: session.repoName },
    });

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
          metadata: {
            name: session.pvcName,
            labels: this.getWorkspaceResourceLabels(session),
          },
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
      "git config --global --add safe.directory /workspace/repo || true",
      "if git -C /workspace/repo rev-parse --is-inside-work-tree >/dev/null 2>&1; then",
      "  git -C /workspace/repo config user.name \"$GIT_USER_NAME\"",
      "  git -C /workspace/repo config user.email \"$GIT_USER_EMAIL\"",
      "  git -C /workspace/repo config push.autoSetupRemote true",
      "  if [ -n \"$TARGET_URL\" ]; then",
      "    if git -C /workspace/repo remote get-url origin >/dev/null 2>&1; then",
      "      git -C /workspace/repo remote set-url origin \"$TARGET_URL\"",
      "    else",
      "      git -C /workspace/repo remote add origin \"$TARGET_URL\"",
      "    fi",
      "  fi",
      "  if [ -n \"$GIT_CREDENTIAL_URL\" ]; then",
      "    printf '%s\\n' \"$GIT_CREDENTIAL_URL\" > /workspace/repo/.git-credentials",
      "    chmod 600 /workspace/repo/.git-credentials",
      "    git config --global credential.helper 'store --file=/workspace/repo/.git-credentials'",
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
      "if ! git -C /workspace/repo rev-parse --is-inside-work-tree >/dev/null 2>&1; then",
      "  rm -rf /workspace/repo",
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
    const codeServerCommand = [
      "code-server",
      "--auth none",
      "--bind-addr 0.0.0.0:8080",
      "/workspace/repo",
    ].join(" ");

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
          metadata: {
            name: session.deploymentName,
            labels: this.getWorkspaceResourceLabels(session),
          },
          spec: {
            replicas: 1,
            selector: { matchLabels: this.getWorkspaceSelectorLabels(session) },
            template: {
              metadata: {
                labels: {
                  ...this.getWorkspaceResourceLabels(session),
                  ...this.getWorkspaceSelectorLabels(session),
                },
              },
              spec: {
                nodeSelector: this.getWorkspaceNodeSelector(),
                tolerations: this.getWorkspaceTolerations(),
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
                    resources: {
                      requests: {
                        cpu: "1",
                        memory: "2Gi",
                      },
                      limits: {
                        cpu: "1",
                        memory: "4Gi",
                      },
                    },
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
                    resources: {
                      requests: {
                        cpu: "1",
                        memory: "2Gi",
                      },
                      limits: {
                        cpu: "1",
                        memory: "4Gi",
                      },
                    },
                    volumeMounts: [{ name: "workspace", mountPath: "/workspace" }],
                    command: ["sh", "-c"],
                    args: [
                      `${runtimeSetupScript}\n${codeServerCommand}`,
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
    await this.deleteActiveWorkspaceResources(session);
    await this.deletePvc(session);
  }

  private async deleteActiveWorkspaceResources(session: WorkspaceSessionEntity): Promise<void> {
    await Promise.all([
      this.deleteIngress(session),
      this.deleteService(session),
    ]);
    await this.deleteDeployment(session);
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
          metadata: {
            name: session.serviceName,
            labels: this.getWorkspaceResourceLabels(session),
          },
          spec: {
            selector: this.getWorkspaceSelectorLabels(session),
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

    const { host, ingressPath } = this.parseWorkspaceEndpoint(session.endpointUrl);
    const ingressClassName = this.configService.get<string>("K8S_WORKSPACE_INGRESS_CLASS", "nginx");
    const ingressAnnotations: Record<string, string> = {
      "kubernetes.io/ingress.class": ingressClassName,
      ...this.getWorkspaceIngressAnnotations(),
    };
    const desiredIngress = {
      apiVersion: "networking.k8s.io/v1",
      kind: "Ingress",
      metadata: {
        name: session.ingressName,
        labels: this.getWorkspaceResourceLabels(session),
        annotations: ingressAnnotations,
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
    } as k8s.V1Ingress;

    try {
      const existing = await this.kubeClientNetworking.readNamespacedIngress({
        namespace: session.namespace,
        name: session.ingressName,
      });
      const existingHost = existing.spec?.rules?.[0]?.host ?? "";
      const existingPath = existing.spec?.rules?.[0]?.http?.paths?.[0]?.path ?? "";
      const existingClassName = existing.spec?.ingressClassName ?? "";
      const existingAnnotations = existing.metadata?.annotations ?? {};
      const needsUpdate =
        existingHost !== host ||
        existingPath !== ingressPath ||
        existingClassName !== ingressClassName ||
        JSON.stringify(existingAnnotations) !== JSON.stringify(ingressAnnotations);

      if (!needsUpdate) {
        this.logger.log(`Workspace ingress already exists namespace=${session.namespace} ingress=${session.ingressName}`);
        return;
      }

      this.logger.log(
        `Updating workspace ingress namespace=${session.namespace} ingress=${session.ingressName} host=${host} path=${ingressPath}`,
      );
      await this.kubeClientNetworking.replaceNamespacedIngress({
        namespace: session.namespace,
        name: session.ingressName,
        body: {
          ...desiredIngress,
          metadata: {
            ...desiredIngress.metadata,
            resourceVersion: existing.metadata?.resourceVersion,
          },
        },
      });
      return;
    } catch {
      this.logger.log(
        `Creating workspace ingress namespace=${session.namespace} ingress=${session.ingressName} host=${host} path=${ingressPath}`,
      );
      await this.kubeClientNetworking.createNamespacedIngress({
        namespace: session.namespace,
        body: desiredIngress,
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

  private buildWorkspaceEndpointUrl(deploymentName: string): string {
    const { host, path } = this.buildWorkspaceRoute(deploymentName);
    return `${this.getWorkspaceUrlScheme()}://${host}${path}`;
  }

  private getWorkspaceUrlScheme(): string {
    return this.configService.get<string>("WORKSPACE_URL_SCHEME", "http").trim() || "http";
  }

  private buildWorkspaceRoute(deploymentName: string): { host: string; path: string } {
    const rawHostTemplate = this.configService.get<string>("WORKSPACE_HOST_TEMPLATE")?.trim() ?? "";
    const rawPathTemplate = this.configService.get<string>("WORKSPACE_PATH_TEMPLATE")?.trim() ?? "";
    const [hostTemplate, embeddedPathTemplate] = this.splitHostTemplate(rawHostTemplate);

    const host = hostTemplate
      ? hostTemplate.replace(/\{\{\s*name\s*\}\}/g, deploymentName)
      : `${deploymentName}.${this.configService.get<string>("WORKSPACE_HOST_SUFFIX", "127.0.0.1.nip.io")}`;
    const pathTemplate = rawPathTemplate || embeddedPathTemplate || "/";
    const path = this.normalizeWorkspacePath(pathTemplate.replace(/\{\{\s*name\s*\}\}/g, deploymentName));

    return { host, path };
  }

  private splitHostTemplate(hostTemplate: string): [string, string] {
    const slashIndex = hostTemplate.indexOf("/");
    if (slashIndex === -1) {
      return [hostTemplate, ""];
    }

    const host = hostTemplate.slice(0, slashIndex).trim();
    const path = hostTemplate.slice(slashIndex).trim();
    return [host, path];
  }

  private parseWorkspaceEndpoint(endpointUrl: string): { host: string; path: string; ingressPath: string } {
    const url = new URL(endpointUrl);
    const path = this.normalizeWorkspacePath(url.pathname);

    return {
      host: url.host,
      path,
      ingressPath: path === "/" ? "/" : path.replace(/\/+$/, ""),
    };
  }

  private normalizeWorkspacePath(path: string): string {
    const trimmed = path.trim();
    if (!trimmed || trimmed === "/") {
      return "/";
    }

    const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
    const normalized = withLeadingSlash.replace(/\/{2,}/g, "/");
    return normalized.endsWith("/") ? normalized : `${normalized}/`;
  }

  private getWorkspaceSelectorLabels(session: WorkspaceSessionEntity): Record<string, string> {
    return {
      "agent-portal/workspace-name": session.deploymentName,
    };
  }

  private getWorkspaceResourceLabels(session: WorkspaceSessionEntity): Record<string, string> {
    return {
      "app.kubernetes.io/managed-by": "agent-portal",
      "agent-portal/workspace-resource": "true",
      "agent-portal/workspace-session-id": session.id,
      "agent-portal/workspace-name": session.deploymentName,
    };
  }

  private async cleanupOrphanedWorkspaceResources(): Promise<void> {
    if (this.cleanupRunning || !this.kubeClientApps || !this.kubeClientCore || !this.kubeClientNetworking) {
      return;
    }

    this.cleanupRunning = true;
    const namespace = this.configService.get<string>("K8S_WORKSPACE_NAMESPACE", "agent-workspaces");

    try {
      const sessions = await this.workspaceRepository.find({
        where: { namespace },
      });
      const expectedDeploymentNames = new Set(sessions.map((session) => session.deploymentName));
      const expectedServiceNames = new Set(sessions.map((session) => session.serviceName));
      const expectedIngressNames = new Set(sessions.map((session) => session.ingressName));
      const expectedPvcNames = new Set(sessions.map((session) => session.pvcName));

      this.logger.log(
        `Workspace cleanup scan started namespace=${namespace} sessions=${sessions.length}`,
      );

      const [deployments, services, ingresses, pvcs] = await Promise.all([
        this.kubeClientApps.listNamespacedDeployment({ namespace }),
        this.kubeClientCore.listNamespacedService({ namespace }),
        this.kubeClientNetworking.listNamespacedIngress({ namespace }),
        this.kubeClientCore.listNamespacedPersistentVolumeClaim({ namespace }),
      ]);

      await this.cleanupNamedResources(
        "deployment",
        namespace,
        deployments.items,
        expectedDeploymentNames,
        (item) => this.kubeClientApps!.deleteNamespacedDeployment({ namespace, name: item.metadata?.name ?? "" }),
      );
      await this.cleanupNamedResources(
        "service",
        namespace,
        services.items,
        expectedServiceNames,
        (item) => this.kubeClientCore!.deleteNamespacedService({ namespace, name: item.metadata?.name ?? "" }),
      );
      await this.cleanupNamedResources(
        "ingress",
        namespace,
        ingresses.items,
        expectedIngressNames,
        (item) => this.kubeClientNetworking!.deleteNamespacedIngress({ namespace, name: item.metadata?.name ?? "" }),
      );
      await this.cleanupNamedResources(
        "pvc",
        namespace,
        pvcs.items,
        expectedPvcNames,
        (item) =>
          this.kubeClientCore!.deleteNamespacedPersistentVolumeClaim({ namespace, name: item.metadata?.name ?? "" }),
      );
      this.logger.log(`Workspace cleanup scan finished namespace=${namespace}`);
    } catch (error) {
      this.logger.error(`Workspace cleanup scan failed namespace=${namespace}: ${this.describeError(error)}`);
    } finally {
      this.cleanupRunning = false;
    }
  }

  private async cleanupNamedResources<
    T extends { metadata?: { name?: string; labels?: Record<string, string> | undefined } },
  >(
    resourceType: string,
    namespace: string,
    items: T[],
    expectedNames: Set<string>,
    deleteResource: (item: T) => Promise<unknown>,
  ): Promise<void> {
    for (const item of items) {
      const name = item.metadata?.name?.trim() ?? "";
      if (!name || !this.shouldManageWorkspaceResource(name, item.metadata?.labels)) {
        continue;
      }
      if (expectedNames.has(name)) {
        continue;
      }

      this.logger.warn(`Deleting orphaned workspace ${resourceType} namespace=${namespace} name=${name}`);
      try {
        await deleteResource(item);
      } catch (error) {
        this.logger.error(
          `Failed to delete orphaned workspace ${resourceType} namespace=${namespace} name=${name}: ${this.describeError(error)}`,
        );
      }
    }
  }

  private shouldManageWorkspaceResource(name: string, labels?: Record<string, string>): boolean {
    if (labels?.["agent-portal/workspace-resource"] === "true") {
      return true;
    }

    return name.startsWith("ws-");
  }

  private getWorkspaceIngressAnnotations(): Record<string, string> {
    const raw = this.configService.get<string>("K8S_WORKSPACE_INGRESS_ANNOTATIONS_JSON")?.trim() ?? "";
    if (!raw) {
      return {};
    }

    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return Object.fromEntries(
        Object.entries(parsed).map(([key, value]) => [key, String(value)]),
      );
    } catch (error) {
      this.logger.warn(`Failed to parse workspace ingress annotations JSON: ${this.describeError(error)}`);
      return {};
    }
  }

  private getWorkspaceNodeSelector(): Record<string, string> | undefined {
    const raw = this.configService.get<string>("K8S_WORKSPACE_NODE_SELECTOR_JSON")?.trim() ?? "";
    if (!raw) {
      return undefined;
    }

    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return Object.fromEntries(
        Object.entries(parsed).map(([key, value]) => [key, String(value)]),
      );
    } catch (error) {
      this.logger.warn(`Failed to parse workspace node selector JSON: ${this.describeError(error)}`);
      return undefined;
    }
  }

  private getWorkspaceTolerations(): k8s.V1Toleration[] | undefined {
    const raw = this.configService.get<string>("K8S_WORKSPACE_TOLERATIONS_JSON")?.trim() ?? "";
    if (!raw) {
      return undefined;
    }

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        this.logger.warn("Workspace tolerations JSON is not an array");
        return undefined;
      }

      return parsed.map((item) => ({
        key: typeof item?.key === "string" ? item.key : undefined,
        operator: typeof item?.operator === "string" ? item.operator : undefined,
        value: typeof item?.value === "string" ? item.value : undefined,
        effect: typeof item?.effect === "string" ? item.effect : undefined,
        tolerationSeconds: typeof item?.tolerationSeconds === "number" ? item.tolerationSeconds : undefined,
      }));
    } catch (error) {
      this.logger.warn(`Failed to parse workspace tolerations JSON: ${this.describeError(error)}`);
      return undefined;
    }
  }

  private async stopOtherUserWorkspaces(userId: string, excludeSessionId?: string): Promise<void> {
    const sessions = await this.workspaceRepository.find({
      where: { userId },
      order: { createdAt: "DESC" },
    });

    for (const session of sessions) {
      if (excludeSessionId && session.id === excludeSessionId) {
        continue;
      }
      if (session.status === "stopped") {
        continue;
      }

      this.logger.log(`Stopping other workspace session=${session.id} user=${userId} deployment=${session.deploymentName}`);
      await this.deleteActiveWorkspaceResources(session);
      session.status = "stopped";
      await this.workspaceRepository.save(session);
    }
  }

  private async refreshWorkspaceStatus(session: WorkspaceSessionEntity): Promise<WorkspaceSessionEntity> {
    if (!this.kubeClientApps) {
      return session;
    }

    if (session.status === "provisioning") {
      await this.healWorkspaceResources(session);
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
      if (session.status === "stopped") {
        return session;
      }
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

  private async healWorkspaceResources(session: WorkspaceSessionEntity): Promise<void> {
    if (
      this.healingSessions.has(session.id) ||
      !this.kubeClientApps ||
      !this.kubeClientCore ||
      !this.kubeClientNetworking
    ) {
      return;
    }

    this.healingSessions.add(session.id);
    try {
      this.logger.log(
        `Healing workspace resources session=${session.id} namespace=${session.namespace} deployment=${session.deploymentName}`,
      );
      const repo = await this.gitlabService.getRepo(session.projectId, session.repoId);
      const user = await this.authService.findById(session.userId);
      const llmUserKey = user
        ? await this.llmService.ensureUserVirtualKey(session.userId, user.email, user.displayName)
        : null;

      await this.provisionWorkspace(session, repo, {
        gitUserName: user?.displayName?.trim() || user?.email || "Workspace User",
        gitUserEmail: user?.email || "workspace@example.com",
        liteLlmApiKey: llmUserKey?.apiKey ?? "",
      });
    } catch (error) {
      this.logger.warn(
        `Workspace heal failed session=${session.id} namespace=${session.namespace} deployment=${session.deploymentName}: ${this.describeError(error)}`,
      );
    } finally {
      this.healingSessions.delete(session.id);
    }
  }

  private describeError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }
}
