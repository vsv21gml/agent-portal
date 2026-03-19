import {
  AMITypes,
  CapacityTypes,
  CreateNodegroupCommand,
  DeleteNodegroupCommand,
  DescribeNodegroupCommand,
  EKSClient,
  ListNodegroupsCommand,
} from "@aws-sdk/client-eks";
import { HttpException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as k8s from "@kubernetes/client-node";

type ManagedNodeGroupPoolType = "workspace" | "serving";

@Injectable()
export class K8sService {
  private readonly logger = new Logger(K8sService.name);
  private readonly kubeClientApps: k8s.AppsV1Api;
  private readonly kubeClientBatch: k8s.BatchV1Api;
  private readonly kubeClientCore: k8s.CoreV1Api;
  private readonly kubeClientNetworking: k8s.NetworkingV1Api;
  private readonly eksClient: EKSClient | null;

  constructor(private readonly configService: ConfigService) {
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

    const awsRegion = this.configService.get<string>("AWS_REGION", "us-east-1");
    const clusterName = this.configService.get<string>("AWS_EKS_CLUSTER_NAME")?.trim() ?? "";
    const subnetIds = this.getEksSubnetIds();
    const nodeRoleArn = this.configService.get<string>("AWS_EKS_NODE_ROLE_ARN")?.trim() ?? "";
    this.eksClient = clusterName && subnetIds.length > 0 && nodeRoleArn ? new EKSClient({ region: awsRegion }) : null;
  }

  async readNamespace(name: string) {
    try {
      return await this.kubeClientCore.readNamespace({ name });
    } catch (error) {
      throw this.toHttpError(error);
    }
  }

  async createNamespace(body: Record<string, unknown>) {
    try {
      return await this.kubeClientCore.createNamespace({ body: body as k8s.V1Namespace });
    } catch (error) {
      throw this.toHttpError(error);
    }
  }

  async readPersistentVolumeClaim(namespace: string, name: string) {
    try {
      return await this.kubeClientCore.readNamespacedPersistentVolumeClaim({ namespace, name });
    } catch (error) {
      throw this.toHttpError(error);
    }
  }

  async createPersistentVolumeClaim(namespace: string, body: Record<string, unknown>) {
    try {
      return await this.kubeClientCore.createNamespacedPersistentVolumeClaim({
        namespace,
        body: body as k8s.V1PersistentVolumeClaim,
      });
    } catch (error) {
      throw this.toHttpError(error);
    }
  }

  async deletePersistentVolumeClaim(namespace: string, name: string) {
    try {
      return await this.kubeClientCore.deleteNamespacedPersistentVolumeClaim({ namespace, name });
    } catch (error) {
      throw this.toHttpError(error);
    }
  }

  async listPersistentVolumeClaims(namespace: string) {
    try {
      return await this.kubeClientCore.listNamespacedPersistentVolumeClaim({ namespace });
    } catch (error) {
      throw this.toHttpError(error);
    }
  }

  async readService(namespace: string, name: string) {
    try {
      return await this.kubeClientCore.readNamespacedService({ namespace, name });
    } catch (error) {
      throw this.toHttpError(error);
    }
  }

  async createService(namespace: string, body: Record<string, unknown>) {
    try {
      return await this.kubeClientCore.createNamespacedService({
        namespace,
        body: body as k8s.V1Service,
      });
    } catch (error) {
      throw this.toHttpError(error);
    }
  }

  async deleteService(namespace: string, name: string) {
    try {
      return await this.kubeClientCore.deleteNamespacedService({ namespace, name });
    } catch (error) {
      throw this.toHttpError(error);
    }
  }

  async listServices(namespace: string) {
    try {
      return await this.kubeClientCore.listNamespacedService({ namespace });
    } catch (error) {
      throw this.toHttpError(error);
    }
  }

  async listPods(namespace: string, labelSelector?: string) {
    try {
      return await this.kubeClientCore.listNamespacedPod({ namespace, labelSelector });
    } catch (error) {
      throw this.toHttpError(error);
    }
  }

  async listPodsAllNamespaces(labelSelector?: string) {
    try {
      return await this.kubeClientCore.listPodForAllNamespaces({ labelSelector });
    } catch (error) {
      throw this.toHttpError(error);
    }
  }

  async readPodLog(params: { namespace: string; name: string; container?: string }) {
    try {
      const logs = await this.kubeClientCore.readNamespacedPodLog(params);
      return { logs };
    } catch (error) {
      throw this.toHttpError(error);
    }
  }

  async listNodes() {
    try {
      return await this.kubeClientCore.listNode();
    } catch (error) {
      throw this.toHttpError(error);
    }
  }

  async readDeployment(namespace: string, name: string) {
    try {
      return await this.kubeClientApps.readNamespacedDeployment({ namespace, name });
    } catch (error) {
      throw this.toHttpError(error);
    }
  }

  async createDeployment(namespace: string, body: Record<string, unknown>) {
    try {
      return await this.kubeClientApps.createNamespacedDeployment({
        namespace,
        body: body as k8s.V1Deployment,
      });
    } catch (error) {
      throw this.toHttpError(error);
    }
  }

  async deleteDeployment(namespace: string, name: string) {
    try {
      return await this.kubeClientApps.deleteNamespacedDeployment({ namespace, name });
    } catch (error) {
      throw this.toHttpError(error);
    }
  }

  async listDeployments(namespace: string) {
    try {
      return await this.kubeClientApps.listNamespacedDeployment({ namespace });
    } catch (error) {
      throw this.toHttpError(error);
    }
  }

  async createJob(namespace: string, body: Record<string, unknown>) {
    try {
      return await this.kubeClientBatch.createNamespacedJob({
        namespace,
        body: body as k8s.V1Job,
      });
    } catch (error) {
      throw this.toHttpError(error);
    }
  }

  async readJob(namespace: string, name: string) {
    try {
      return await this.kubeClientBatch.readNamespacedJob({ namespace, name });
    } catch (error) {
      throw this.toHttpError(error);
    }
  }

  async deleteJob(namespace: string, name: string, body: Record<string, unknown>) {
    try {
      return await this.kubeClientBatch.deleteNamespacedJob({
        namespace,
        name,
        body: body as k8s.V1DeleteOptions,
      });
    } catch (error) {
      throw this.toHttpError(error);
    }
  }

  async readIngress(namespace: string, name: string) {
    try {
      return await this.kubeClientNetworking.readNamespacedIngress({ namespace, name });
    } catch (error) {
      throw this.toHttpError(error);
    }
  }

  async createIngress(namespace: string, body: Record<string, unknown>) {
    try {
      return await this.kubeClientNetworking.createNamespacedIngress({
        namespace,
        body: body as k8s.V1Ingress,
      });
    } catch (error) {
      throw this.toHttpError(error);
    }
  }

  async replaceIngress(namespace: string, name: string, body: Record<string, unknown>) {
    try {
      return await this.kubeClientNetworking.replaceNamespacedIngress({
        namespace,
        name,
        body: body as k8s.V1Ingress,
      });
    } catch (error) {
      throw this.toHttpError(error);
    }
  }

  async deleteIngress(namespace: string, name: string) {
    try {
      return await this.kubeClientNetworking.deleteNamespacedIngress({ namespace, name });
    } catch (error) {
      throw this.toHttpError(error);
    }
  }

  async listIngresses(namespace: string) {
    try {
      return await this.kubeClientNetworking.listNamespacedIngress({ namespace });
    } catch (error) {
      throw this.toHttpError(error);
    }
  }

  async getManagedNodeGroupOverview(poolType: ManagedNodeGroupPoolType) {
    const awsRegion = this.configService.get<string>("AWS_REGION", "us-east-1");
    const clusterName = this.configService.get<string>("AWS_EKS_CLUSTER_NAME")?.trim() ?? "";
    const nodeRoleArn = this.configService.get<string>("AWS_EKS_NODE_ROLE_ARN")?.trim() ?? "";
    const subnetIds = this.getEksSubnetIds();
    const selector = this.parseNodeSelectorConfig(
      poolType === "workspace" ? "K8S_WORKSPACE_NODE_SELECTOR_JSON" : "K8S_SERVING_NODE_SELECTOR_JSON",
    );
    const tolerations = this.parseTolerationsConfig(
      poolType === "workspace" ? "K8S_WORKSPACE_TOLERATIONS_JSON" : "K8S_SERVING_TOLERATIONS_JSON",
    );

    if (!this.eksClient || !clusterName || !nodeRoleArn || subnetIds.length === 0) {
      return {
        configured: false,
        poolType,
        clusterName: clusterName || null,
        region: awsRegion,
        nodeRoleArnConfigured: Boolean(nodeRoleArn),
        subnetCount: subnetIds.length,
        scheduling: { selector, tolerations },
        defaults: this.getNodeGroupDefaults(poolType),
        nodeGroups: [],
        message: "AWS EKS nodegroup configuration is incomplete.",
      };
    }

    const list = await this.eksClient.send(new ListNodegroupsCommand({ clusterName }));
    const nodeGroups = list.nodegroups ?? [];
    const nodeNamesByGroup = await this.getNodeNamesByNodeGroup();
    const rows = await Promise.all(
      nodeGroups.map(async (nodeGroupName) => {
        const detail = await this.eksClient!.send(new DescribeNodegroupCommand({ clusterName, nodegroupName: nodeGroupName }));
        const nodeGroup = detail.nodegroup;
        if (!nodeGroup || !this.matchesManagedNodeGroup(nodeGroup.labels ?? {}, selector)) {
          return null;
        }
        return {
          nodeGroupName,
          status: nodeGroup.status ?? "UNKNOWN",
          desiredSize: nodeGroup.scalingConfig?.desiredSize ?? 0,
          minSize: nodeGroup.scalingConfig?.minSize ?? 0,
          maxSize: nodeGroup.scalingConfig?.maxSize ?? 0,
          diskSize: nodeGroup.diskSize ?? null,
          capacityType: nodeGroup.capacityType ?? null,
          amiType: nodeGroup.amiType ?? null,
          instanceTypes: nodeGroup.instanceTypes ?? [],
          labels: nodeGroup.labels ?? {},
          taints: (nodeGroup.taints ?? []).map((item) => ({
            key: item.key ?? "",
            value: item.value ?? "",
            effect: this.fromEksTaintEffect(item.effect ?? "NO_SCHEDULE"),
          })),
          matchingNodeCount: (nodeNamesByGroup.get(nodeGroupName) ?? []).length,
          matchingNodeNames: nodeNamesByGroup.get(nodeGroupName) ?? [],
          createdAt: nodeGroup.createdAt?.toISOString() ?? null,
        };
      }),
    );

    return {
      configured: true,
      poolType,
      clusterName,
      region: awsRegion,
      nodeRoleArnConfigured: true,
      subnetCount: subnetIds.length,
      scheduling: { selector, tolerations },
      defaults: this.getNodeGroupDefaults(poolType),
      nodeGroups: rows.filter(Boolean),
      message: null,
    };
  }

  async createManagedNodeGroup(poolType: ManagedNodeGroupPoolType, body: Record<string, unknown>) {
    if (!this.eksClient) {
      throw new HttpException("AWS EKS nodegroup configuration is incomplete.", 409);
    }
    const clusterName = this.configService.get<string>("AWS_EKS_CLUSTER_NAME")!.trim();
    const nodeRoleArn = this.configService.get<string>("AWS_EKS_NODE_ROLE_ARN")!.trim();
    const subnetIds = this.getEksSubnetIds();
    const selector = this.parseNodeSelectorConfig(
      poolType === "workspace" ? "K8S_WORKSPACE_NODE_SELECTOR_JSON" : "K8S_SERVING_NODE_SELECTOR_JSON",
    );
    const tolerations = this.parseTolerationsConfig(
      poolType === "workspace" ? "K8S_WORKSPACE_TOLERATIONS_JSON" : "K8S_SERVING_TOLERATIONS_JSON",
    );

    await this.eksClient.send(
      new CreateNodegroupCommand({
        clusterName,
        nodegroupName: String(body.nodeGroupName ?? "").trim(),
        nodeRole: nodeRoleArn,
        subnets: subnetIds,
        instanceTypes: Array.isArray(body.instanceTypes) ? body.instanceTypes.map((item) => String(item)) : undefined,
        diskSize: typeof body.diskSize === "number" ? body.diskSize : undefined,
        capacityType: body.capacityType ? (String(body.capacityType) as CapacityTypes) : undefined,
        amiType: body.amiType ? (String(body.amiType) as AMITypes) : undefined,
        scalingConfig: {
          minSize: Number(body.minSize ?? 1),
          maxSize: Number(body.maxSize ?? 3),
          desiredSize: Number(body.desiredSize ?? 1),
        },
        labels: selector,
        taints: tolerations
          .filter((item) => item.key && item.effect)
          .map((item) => ({
            key: item.key!,
            value: item.value,
            effect: this.toEksTaintEffect(item.effect!),
          })),
      }),
    );

    return this.getManagedNodeGroupOverview(poolType);
  }

  async deleteManagedNodeGroup(poolType: ManagedNodeGroupPoolType, nodeGroupName: string) {
    if (!this.eksClient) {
      throw new HttpException("AWS EKS nodegroup configuration is incomplete.", 409);
    }
    const clusterName = this.configService.get<string>("AWS_EKS_CLUSTER_NAME")!.trim();
    await this.eksClient.send(new DeleteNodegroupCommand({ clusterName, nodegroupName: nodeGroupName }));
    return this.getManagedNodeGroupOverview(poolType);
  }

  private toHttpError(error: unknown): HttpException {
    const status = typeof (error as { statusCode?: unknown })?.statusCode === "number" ? Number((error as { statusCode: number }).statusCode) : 500;
    const body = (error as { body?: unknown })?.body;
    const message =
      typeof body === "string"
        ? body
        : body && typeof body === "object" && typeof (body as { message?: unknown }).message === "string"
          ? String((body as { message: string }).message)
          : error instanceof Error
            ? error.message
            : "k8s-api request failed";
    this.logger.warn(`k8s-api operation failed status=${status} message=${message}`);
    return new HttpException({ message, statusCode: status }, status);
  }

  private getEksSubnetIds(): string[] {
    return (this.configService.get<string>("AWS_EKS_SUBNET_IDS", "") ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private getNodeGroupDefaults(poolType: ManagedNodeGroupPoolType) {
    const prefix = poolType === "workspace" ? "AWS_EKS_WORKSPACE_NODE" : "AWS_EKS_SERVING_NODE";
    return {
      instanceTypes: (this.configService.get<string>(`${prefix}_INSTANCE_TYPES`, "t3.large") ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      minSize: Number(this.configService.get<string>(`${prefix}_MIN_SIZE`, "1")),
      maxSize: Number(this.configService.get<string>(`${prefix}_MAX_SIZE`, "3")),
      desiredSize: Number(this.configService.get<string>(`${prefix}_DESIRED_SIZE`, "1")),
      diskSize: Number(this.configService.get<string>(`${prefix}_DISK_SIZE`, "50")),
      capacityType: this.configService.get<string>(`${prefix}_CAPACITY_TYPE`)?.trim() ?? null,
      amiType: this.configService.get<string>(`${prefix}_AMI_TYPE`)?.trim() ?? null,
    };
  }

  private parseNodeSelectorConfig(configKey: string): Record<string, string> {
    const raw = this.configService.get<string>(configKey, "")?.trim() ?? "";
    if (!raw) {
      return {};
    }
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, String(value)]));
    } catch {
      return {};
    }
  }

  private parseTolerationsConfig(configKey: string): Array<{ key?: string; operator?: string; value?: string; effect?: string }> {
    const raw = this.configService.get<string>(configKey, "")?.trim() ?? "";
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.map((item) => ({
        key: typeof item?.key === "string" ? item.key : undefined,
        operator: typeof item?.operator === "string" ? item.operator : undefined,
        value: typeof item?.value === "string" ? item.value : undefined,
        effect: typeof item?.effect === "string" ? item.effect : undefined,
      }));
    } catch {
      return [];
    }
  }

  private async getNodeNamesByNodeGroup(): Promise<Map<string, string[]>> {
    const nodes = await this.listNodes();
    const result = new Map<string, string[]>();
    for (const node of nodes.items ?? []) {
      const labels = (node.metadata as { labels?: Record<string, string> } | undefined)?.labels ?? {};
      const nodeGroupName = labels["eks.amazonaws.com/nodegroup"] ?? labels["alpha.eksctl.io/nodegroup-name"];
      if (!nodeGroupName) {
        continue;
      }
      const names = result.get(nodeGroupName) ?? [];
      names.push((node.metadata as { name?: string } | undefined)?.name ?? "");
      result.set(nodeGroupName, names.filter(Boolean));
    }
    return result;
  }

  private matchesManagedNodeGroup(labels: Record<string, string>, selector: Record<string, string>): boolean {
    if (Object.keys(selector).length === 0) {
      return false;
    }
    return Object.entries(selector).every(([key, value]) => labels[key] === value);
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
}
