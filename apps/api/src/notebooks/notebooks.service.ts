import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import * as k8s from "@kubernetes/client-node";
import { BadRequestException } from "@nestjs/common";
import { Repository } from "typeorm";
import { ProjectsService } from "../projects/projects.service";
import { CreateNotebookDto } from "./dto/create-notebook.dto";
import { NotebookSessionEntity } from "./entities/notebook-session.entity";

@Injectable()
export class NotebooksService {
  private readonly logger = new Logger(NotebooksService.name);
  private readonly kubeClientApps: k8s.AppsV1Api | null;
  private readonly kubeClientCore: k8s.CoreV1Api | null;
  private readonly kubeClientNetworking: k8s.NetworkingV1Api | null;

  constructor(
    private readonly configService: ConfigService,
    private readonly projectsService: ProjectsService,
    @InjectRepository(NotebookSessionEntity)
    private readonly notebookRepository: Repository<NotebookSessionEntity>,
  ) {
    if (this.configService.get<string>("K8S_NOTEBOOK_ENABLED", "false") === "true") {
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
      this.logger.log(`Kubernetes notebook client enabled (namespace=${this.configService.get<string>("K8S_NOTEBOOK_NAMESPACE", "agent-notebooks")})`);
    } else {
      this.kubeClientApps = null;
      this.kubeClientCore = null;
      this.kubeClientNetworking = null;
      this.logger.log("Kubernetes notebook client disabled");
    }
  }

  async createForUser(dto: CreateNotebookDto, userId: string): Promise<NotebookSessionEntity> {
    this.logger.log(`Create notebook requested project=${dto.projectId} user=${userId}`);
    const existing = await this.notebookRepository.findOne({
      where: { projectId: dto.projectId, userId },
    });
    if (existing) {
      this.logger.log(`Notebook already exists session=${existing.id} project=${dto.projectId} user=${userId}`);
      return existing;
    }

    const endpointPath = `/notebooks/${dto.projectId}/${userId}`;
    const namespace = this.configService.get<string>("K8S_NOTEBOOK_NAMESPACE", "agent-notebooks");
    const cpuRequest = Number(this.configService.get<string>("NOTEBOOK_REQUEST_CPU", "1"));
    const memoryGiRequest = Number(this.configService.get<string>("NOTEBOOK_REQUEST_MEM_GI", "2"));

    const usage = await this.getProjectUsage(dto.projectId);
    const limit = await this.projectsService.getResourceLimit(dto.projectId);
    if (usage.usedCpu + cpuRequest > limit.cpu || usage.usedMemoryGi + memoryGiRequest > limit.memoryGi) {
      throw new BadRequestException("Project resource limit exceeded");
    }

    const session = await this.notebookRepository.save(
      this.notebookRepository.create({
        projectId: dto.projectId,
        userId,
        endpointPath,
        status: "provisioning",
        namespace,
        pvcSubPath: `${dto.projectId}/${userId}`,
        cpuRequest,
        memoryGiRequest,
      }),
    );
    try {
      await this.provisionK8sNotebook(session);
    } catch (error) {
      this.logger.error(`Notebook provisioning failed session=${session.id} namespace=${session.namespace}: ${this.describeError(error)}`);
      throw error;
    }
    session.status = "running";
    return this.notebookRepository.save(session);
  }

  listByProject(projectId: string): Promise<NotebookSessionEntity[]> {
    return this.notebookRepository.find({ where: { projectId } });
  }

  listMine(userId: string): Promise<NotebookSessionEntity[]> {
    return this.notebookRepository.find({ where: { userId } });
  }

  async getProjectUsage(projectId: string): Promise<{ usedCpu: number; usedMemoryGi: number }> {
    const sessions = await this.notebookRepository.find({ where: { projectId } });
    return {
      usedCpu: sessions.reduce((acc, item) => acc + item.cpuRequest, 0),
      usedMemoryGi: sessions.reduce((acc, item) => acc + item.memoryGiRequest, 0),
    };
  }

  private async provisionK8sNotebook(session: NotebookSessionEntity): Promise<void> {
    if (!this.kubeClientApps || !this.kubeClientCore || !this.kubeClientNetworking || !session.namespace || !session.pvcSubPath) {
      this.logger.warn(`Skipping notebook provisioning because Kubernetes clients are unavailable session=${session.id}`);
      return;
    }

    const deploymentName = `nb-${session.projectId.slice(0, 8)}-${session.userId.slice(0, 8)}`;
    const notebookImage = this.configService.get<string>("NOTEBOOK_IMAGE", "jupyter/base-notebook:latest");
    const pvcName = this.configService.get<string>("NOTEBOOK_PVC", "shared-notebooks-pvc");
    const ingressClassName = this.configService.get<string>("K8S_NOTEBOOK_INGRESS_CLASS", "nginx");
    const albOidcIssuer = this.configService.get<string>("ALB_OIDC_ISSUER");
    const albOidcClientId = this.configService.get<string>("ALB_OIDC_CLIENT_ID");
    const albOidcClientSecret = this.configService.get<string>("ALB_OIDC_CLIENT_SECRET");
    const ingressAnnotations: Record<string, string> = {
      "kubernetes.io/ingress.class": ingressClassName,
    };
    if (ingressClassName === "alb" && albOidcIssuer && albOidcClientId && albOidcClientSecret) {
      ingressAnnotations["alb.ingress.kubernetes.io/auth-type"] = "oidc";
      ingressAnnotations["alb.ingress.kubernetes.io/auth-idp-oidc"] = JSON.stringify({
        issuer: albOidcIssuer,
        authorizationEndpoint: `${albOidcIssuer}/authorize`,
        tokenEndpoint: `${albOidcIssuer}/oauth/token`,
        userInfoEndpoint: `${albOidcIssuer}/userinfo`,
        secretName: albOidcClientSecret,
        clientId: albOidcClientId,
      });
    }

    this.logger.log(
      `Provisioning notebook session=${session.id} namespace=${session.namespace} deployment=${deploymentName} image=${notebookImage} pvc=${pvcName}`,
    );
    await this.kubeClientApps.createNamespacedDeployment({
      namespace: session.namespace,
      body: {
        apiVersion: "apps/v1",
        kind: "Deployment",
        metadata: { name: deploymentName },
        spec: {
          replicas: 1,
          selector: { matchLabels: { app: deploymentName } },
          template: {
            metadata: { labels: { app: deploymentName } },
            spec: {
              containers: [
                {
                  name: "notebook",
                  image: notebookImage,
                  ports: [{ containerPort: 8888 }],
                  volumeMounts: [
                    {
                      name: "workspace",
                      mountPath: "/home/jovyan/work",
                      subPath: session.pvcSubPath,
                    },
                  ],
                  resources: {
                    limits: {
                      cpu: this.configService.get<string>("NOTEBOOK_DEFAULT_CPU", "2"),
                      memory: this.configService.get<string>("NOTEBOOK_DEFAULT_MEM", "8Gi"),
                    },
                  },
                },
              ],
              volumes: [{ name: "workspace", persistentVolumeClaim: { claimName: pvcName } }],
            },
          },
        },
      } as k8s.V1Deployment,
    });

    await this.kubeClientCore.createNamespacedService({
      namespace: session.namespace,
      body: {
        apiVersion: "v1",
        kind: "Service",
        metadata: { name: deploymentName },
        spec: {
          selector: { app: deploymentName },
          ports: [{ port: 8888, targetPort: 8888 }],
        },
      } as k8s.V1Service,
    });

    await this.kubeClientNetworking.createNamespacedIngress({
      namespace: session.namespace,
      body: {
        apiVersion: "networking.k8s.io/v1",
        kind: "Ingress",
        metadata: {
          name: `${deploymentName}-ing`,
          annotations: ingressAnnotations,
        },
        spec: {
          rules: [
            {
              http: {
                paths: [
                  {
                    path: session.endpointPath,
                    pathType: "Prefix",
                    backend: {
                      service: {
                        name: deploymentName,
                        port: { number: 8888 },
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
    this.logger.log(`Notebook resources ensured session=${session.id} namespace=${session.namespace} deployment=${deploymentName}`);
  }

  private describeError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }
}
