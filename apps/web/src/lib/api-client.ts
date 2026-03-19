import { clearToken, getToken } from "./auth";

export const PORTAL_AUTH_ERROR_EVENT = "agent-portal-portal-auth-error";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const response = await fetch(`/api/${path.replace(/^\/+/, "")}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
    const errorMessage = Array.isArray(errorBody?.message)
      ? errorBody.message.join(", ")
      : errorBody?.message ?? `${response.status} ${response.statusText}`;
    if (response.status === 401) {
      clearToken();
    }
    if (typeof window !== "undefined" && (response.status === 401 || response.status === 403)) {
      window.dispatchEvent(
        new CustomEvent(PORTAL_AUTH_ERROR_EVENT, {
          detail: {
            status: response.status,
            path: path.replace(/^\/+/, ""),
          },
        }),
      );
    }
    throw new ApiError(response.status, errorMessage);
  }

  return (await response.json()) as T;
}
