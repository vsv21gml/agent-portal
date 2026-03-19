import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { K8sService } from "./k8s.service";

type NameRequest = { name: string };
type NamespacedNameRequest = { namespace: string; name: string };
type NamespacedBodyRequest = { namespace: string; body: Record<string, unknown> };
type ReplaceRequest = { namespace: string; name: string; body: Record<string, unknown> };
type ListRequest = { namespace?: string; labelSelector?: string };
type PodLogRequest = { namespace: string; name: string; container?: string };
type ManagedNodeGroupRequest = {
  poolType: "workspace" | "serving";
  body?: Record<string, unknown>;
};

@Controller("internal")
export class K8sController {
  constructor(private readonly k8sService: K8sService) {}

  private authorize(token: string | undefined): void {
    const expected = (process.env.K8S_API_INTERNAL_TOKEN ?? "").trim();
    if (!expected || token !== expected) {
      throw new UnauthorizedException("Invalid internal token");
    }
  }

  @Post("core/read-namespace")
  readNamespace(@Headers("x-internal-token") token: string | undefined, @Body() body: NameRequest) {
    this.authorize(token);
    return this.k8sService.readNamespace(body.name);
  }

  @Post("core/create-namespace")
  createNamespace(@Headers("x-internal-token") token: string | undefined, @Body() body: { body: Record<string, unknown> }) {
    this.authorize(token);
    return this.k8sService.createNamespace(body.body);
  }

  @Post("core/read-persistent-volume-claim")
  readPersistentVolumeClaim(@Headers("x-internal-token") token: string | undefined, @Body() body: NamespacedNameRequest) {
    this.authorize(token);
    return this.k8sService.readPersistentVolumeClaim(body.namespace, body.name);
  }

  @Post("core/create-persistent-volume-claim")
  createPersistentVolumeClaim(@Headers("x-internal-token") token: string | undefined, @Body() body: NamespacedBodyRequest) {
    this.authorize(token);
    return this.k8sService.createPersistentVolumeClaim(body.namespace, body.body);
  }

  @Post("core/delete-persistent-volume-claim")
  deletePersistentVolumeClaim(@Headers("x-internal-token") token: string | undefined, @Body() body: NamespacedNameRequest) {
    this.authorize(token);
    return this.k8sService.deletePersistentVolumeClaim(body.namespace, body.name);
  }

  @Post("core/list-persistent-volume-claims")
  listPersistentVolumeClaims(@Headers("x-internal-token") token: string | undefined, @Body() body: ListRequest) {
    this.authorize(token);
    return this.k8sService.listPersistentVolumeClaims(body.namespace ?? "");
  }

  @Post("core/read-service")
  readService(@Headers("x-internal-token") token: string | undefined, @Body() body: NamespacedNameRequest) {
    this.authorize(token);
    return this.k8sService.readService(body.namespace, body.name);
  }

  @Post("core/create-service")
  createService(@Headers("x-internal-token") token: string | undefined, @Body() body: NamespacedBodyRequest) {
    this.authorize(token);
    return this.k8sService.createService(body.namespace, body.body);
  }

  @Post("core/delete-service")
  deleteService(@Headers("x-internal-token") token: string | undefined, @Body() body: NamespacedNameRequest) {
    this.authorize(token);
    return this.k8sService.deleteService(body.namespace, body.name);
  }

  @Post("core/list-services")
  listServices(@Headers("x-internal-token") token: string | undefined, @Body() body: ListRequest) {
    this.authorize(token);
    return this.k8sService.listServices(body.namespace ?? "");
  }

  @Post("core/list-pods")
  listPods(@Headers("x-internal-token") token: string | undefined, @Body() body: ListRequest) {
    this.authorize(token);
    return this.k8sService.listPods(body.namespace ?? "", body.labelSelector);
  }

  @Post("core/list-pods-all-namespaces")
  listPodsAllNamespaces(@Headers("x-internal-token") token: string | undefined, @Body() body: ListRequest) {
    this.authorize(token);
    return this.k8sService.listPodsAllNamespaces(body.labelSelector);
  }

  @Post("core/read-pod-log")
  readPodLog(@Headers("x-internal-token") token: string | undefined, @Body() body: PodLogRequest) {
    this.authorize(token);
    return this.k8sService.readPodLog(body);
  }

  @Get("core/list-nodes")
  listNodes(@Headers("x-internal-token") token: string | undefined) {
    this.authorize(token);
    return this.k8sService.listNodes();
  }

  @Post("apps/read-deployment")
  readDeployment(@Headers("x-internal-token") token: string | undefined, @Body() body: NamespacedNameRequest) {
    this.authorize(token);
    return this.k8sService.readDeployment(body.namespace, body.name);
  }

  @Post("apps/create-deployment")
  createDeployment(@Headers("x-internal-token") token: string | undefined, @Body() body: NamespacedBodyRequest) {
    this.authorize(token);
    return this.k8sService.createDeployment(body.namespace, body.body);
  }

  @Post("apps/delete-deployment")
  deleteDeployment(@Headers("x-internal-token") token: string | undefined, @Body() body: NamespacedNameRequest) {
    this.authorize(token);
    return this.k8sService.deleteDeployment(body.namespace, body.name);
  }

  @Post("apps/list-deployments")
  listDeployments(@Headers("x-internal-token") token: string | undefined, @Body() body: ListRequest) {
    this.authorize(token);
    return this.k8sService.listDeployments(body.namespace ?? "");
  }

  @Post("batch/create-job")
  createJob(@Headers("x-internal-token") token: string | undefined, @Body() body: NamespacedBodyRequest) {
    this.authorize(token);
    return this.k8sService.createJob(body.namespace, body.body);
  }

  @Post("batch/read-job")
  readJob(@Headers("x-internal-token") token: string | undefined, @Body() body: NamespacedNameRequest) {
    this.authorize(token);
    return this.k8sService.readJob(body.namespace, body.name);
  }

  @Post("batch/delete-job")
  deleteJob(@Headers("x-internal-token") token: string | undefined, @Body() body: ReplaceRequest) {
    this.authorize(token);
    return this.k8sService.deleteJob(body.namespace, body.name, body.body);
  }

  @Post("networking/read-ingress")
  readIngress(@Headers("x-internal-token") token: string | undefined, @Body() body: NamespacedNameRequest) {
    this.authorize(token);
    return this.k8sService.readIngress(body.namespace, body.name);
  }

  @Post("networking/create-ingress")
  createIngress(@Headers("x-internal-token") token: string | undefined, @Body() body: NamespacedBodyRequest) {
    this.authorize(token);
    return this.k8sService.createIngress(body.namespace, body.body);
  }

  @Post("networking/replace-ingress")
  replaceIngress(@Headers("x-internal-token") token: string | undefined, @Body() body: ReplaceRequest) {
    this.authorize(token);
    return this.k8sService.replaceIngress(body.namespace, body.name, body.body);
  }

  @Post("networking/delete-ingress")
  deleteIngress(@Headers("x-internal-token") token: string | undefined, @Body() body: NamespacedNameRequest) {
    this.authorize(token);
    return this.k8sService.deleteIngress(body.namespace, body.name);
  }

  @Post("networking/list-ingresses")
  listIngresses(@Headers("x-internal-token") token: string | undefined, @Body() body: ListRequest) {
    this.authorize(token);
    return this.k8sService.listIngresses(body.namespace ?? "");
  }

  @Get("eks/managed-nodegroups/:poolType")
  getManagedNodeGroupOverview(
    @Headers("x-internal-token") token: string | undefined,
    @Param("poolType") poolType: "workspace" | "serving",
  ) {
    this.authorize(token);
    return this.k8sService.getManagedNodeGroupOverview(poolType);
  }

  @Post("eks/managed-nodegroups")
  createManagedNodeGroup(@Headers("x-internal-token") token: string | undefined, @Body() body: ManagedNodeGroupRequest) {
    this.authorize(token);
    return this.k8sService.createManagedNodeGroup(body.poolType, body.body ?? {});
  }

  @Delete("eks/managed-nodegroups/:poolType/:nodeGroupName")
  deleteManagedNodeGroup(
    @Headers("x-internal-token") token: string | undefined,
    @Param("poolType") poolType: "workspace" | "serving",
    @Param("nodeGroupName") nodeGroupName: string,
  ) {
    this.authorize(token);
    return this.k8sService.deleteManagedNodeGroup(poolType, nodeGroupName);
  }
}
