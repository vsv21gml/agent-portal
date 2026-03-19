import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

class K8sApiRequestError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

@Injectable()
export class K8sApiService {
  constructor(private readonly configService: ConfigService) {}

  private getBaseUrl(): string {
    return (this.configService.get<string>("K8S_API_BASE_URL", "http://agent-portal-k8s-api:4300") ?? "").replace(/\/+$/, "");
  }

  private getToken(): string {
    return this.configService.get<string>("K8S_API_INTERNAL_TOKEN", "") ?? "";
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.getBaseUrl()}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        "x-internal-token": this.getToken(),
        ...(init?.headers ?? {}),
      },
    });
    if (!response.ok) {
      let message = `k8s-api request failed: ${response.status}`;
      try {
        const payload = (await response.json()) as { message?: string };
        if (payload?.message) {
          message = payload.message;
        }
      } catch {}
      throw new K8sApiRequestError(message, response.status);
    }
    return (await response.json()) as T;
  }

  isNotFound(error: unknown): boolean {
    return error instanceof K8sApiRequestError && error.statusCode === 404;
  }

  readNamespace(name: string) {
    return this.request<Record<string, unknown>>("/internal/core/read-namespace", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  }

  createNamespace(body: Record<string, unknown>) {
    return this.request<Record<string, unknown>>("/internal/core/create-namespace", {
      method: "POST",
      body: JSON.stringify({ body }),
    });
  }

  readPersistentVolumeClaim(namespace: string, name: string) {
    return this.request<Record<string, unknown>>("/internal/core/read-persistent-volume-claim", {
      method: "POST",
      body: JSON.stringify({ namespace, name }),
    });
  }

  createPersistentVolumeClaim(namespace: string, body: Record<string, unknown>) {
    return this.request<Record<string, unknown>>("/internal/core/create-persistent-volume-claim", {
      method: "POST",
      body: JSON.stringify({ namespace, body }),
    });
  }

  deletePersistentVolumeClaim(namespace: string, name: string) {
    return this.request<Record<string, unknown>>("/internal/core/delete-persistent-volume-claim", {
      method: "POST",
      body: JSON.stringify({ namespace, name }),
    });
  }

  listPersistentVolumeClaims(namespace: string) {
    return this.request<{ items: Array<Record<string, unknown>> }>("/internal/core/list-persistent-volume-claims", {
      method: "POST",
      body: JSON.stringify({ namespace }),
    });
  }

  readService(namespace: string, name: string) {
    return this.request<Record<string, unknown>>("/internal/core/read-service", {
      method: "POST",
      body: JSON.stringify({ namespace, name }),
    });
  }

  createService(namespace: string, body: Record<string, unknown>) {
    return this.request<Record<string, unknown>>("/internal/core/create-service", {
      method: "POST",
      body: JSON.stringify({ namespace, body }),
    });
  }

  deleteService(namespace: string, name: string) {
    return this.request<Record<string, unknown>>("/internal/core/delete-service", {
      method: "POST",
      body: JSON.stringify({ namespace, name }),
    });
  }

  listServices(namespace: string) {
    return this.request<{ items: Array<Record<string, unknown>> }>("/internal/core/list-services", {
      method: "POST",
      body: JSON.stringify({ namespace }),
    });
  }

  listPods(namespace: string, labelSelector?: string) {
    return this.request<{ items: Array<Record<string, unknown>> }>("/internal/core/list-pods", {
      method: "POST",
      body: JSON.stringify({ namespace, labelSelector }),
    });
  }

  listPodsAllNamespaces(labelSelector?: string) {
    return this.request<{ items: Array<Record<string, unknown>> }>("/internal/core/list-pods-all-namespaces", {
      method: "POST",
      body: JSON.stringify({ labelSelector }),
    });
  }

  readPodLog(namespace: string, name: string, container?: string) {
    return this.request<{ logs: string }>("/internal/core/read-pod-log", {
      method: "POST",
      body: JSON.stringify({ namespace, name, container }),
    });
  }

  listNodes() {
    return this.request<{ items: Array<Record<string, unknown>> }>("/internal/core/list-nodes");
  }

  readDeployment(namespace: string, name: string) {
    return this.request<Record<string, unknown>>("/internal/apps/read-deployment", {
      method: "POST",
      body: JSON.stringify({ namespace, name }),
    });
  }

  createDeployment(namespace: string, body: Record<string, unknown>) {
    return this.request<Record<string, unknown>>("/internal/apps/create-deployment", {
      method: "POST",
      body: JSON.stringify({ namespace, body }),
    });
  }

  deleteDeployment(namespace: string, name: string) {
    return this.request<Record<string, unknown>>("/internal/apps/delete-deployment", {
      method: "POST",
      body: JSON.stringify({ namespace, name }),
    });
  }

  listDeployments(namespace: string) {
    return this.request<{ items: Array<Record<string, unknown>> }>("/internal/apps/list-deployments", {
      method: "POST",
      body: JSON.stringify({ namespace }),
    });
  }

  createJob(namespace: string, body: Record<string, unknown>) {
    return this.request<Record<string, unknown>>("/internal/batch/create-job", {
      method: "POST",
      body: JSON.stringify({ namespace, body }),
    });
  }

  readJob(namespace: string, name: string) {
    return this.request<Record<string, unknown>>("/internal/batch/read-job", {
      method: "POST",
      body: JSON.stringify({ namespace, name }),
    });
  }

  deleteJob(namespace: string, name: string, body: Record<string, unknown>) {
    return this.request<Record<string, unknown>>("/internal/batch/delete-job", {
      method: "POST",
      body: JSON.stringify({ namespace, name, body }),
    });
  }

  readIngress(namespace: string, name: string) {
    return this.request<Record<string, unknown>>("/internal/networking/read-ingress", {
      method: "POST",
      body: JSON.stringify({ namespace, name }),
    });
  }

  createIngress(namespace: string, body: Record<string, unknown>) {
    return this.request<Record<string, unknown>>("/internal/networking/create-ingress", {
      method: "POST",
      body: JSON.stringify({ namespace, body }),
    });
  }

  replaceIngress(namespace: string, name: string, body: Record<string, unknown>) {
    return this.request<Record<string, unknown>>("/internal/networking/replace-ingress", {
      method: "POST",
      body: JSON.stringify({ namespace, name, body }),
    });
  }

  deleteIngress(namespace: string, name: string) {
    return this.request<Record<string, unknown>>("/internal/networking/delete-ingress", {
      method: "POST",
      body: JSON.stringify({ namespace, name }),
    });
  }

  listIngresses(namespace: string) {
    return this.request<{ items: Array<Record<string, unknown>> }>("/internal/networking/list-ingresses", {
      method: "POST",
      body: JSON.stringify({ namespace }),
    });
  }

  getManagedNodeGroupOverview(poolType: "workspace" | "serving") {
    return this.request<Record<string, unknown>>(`/internal/eks/managed-nodegroups/${poolType}`);
  }

  createManagedNodeGroup(poolType: "workspace" | "serving", body: Record<string, unknown>) {
    return this.request<Record<string, unknown>>("/internal/eks/managed-nodegroups", {
      method: "POST",
      body: JSON.stringify({ poolType, body }),
    });
  }

  deleteManagedNodeGroup(poolType: "workspace" | "serving", nodeGroupName: string) {
    return this.request<Record<string, unknown>>(`/internal/eks/managed-nodegroups/${poolType}/${nodeGroupName}`, {
      method: "DELETE",
    });
  }
}
