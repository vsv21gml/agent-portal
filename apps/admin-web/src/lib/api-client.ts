import { clearToken, getToken } from "./auth";

export const ADMIN_AUTH_ERROR_EVENT = "agent-portal-admin-auth-error";

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
    const rawBody = await response.text();
    let message = `${response.status} ${response.statusText}`;
    if (rawBody) {
      try {
        const parsed = JSON.parse(rawBody) as { message?: string | string[] };
        if (Array.isArray(parsed.message)) {
          message = parsed.message.join(", ");
        } else if (typeof parsed.message === "string" && parsed.message.trim()) {
          message = parsed.message;
        } else {
          message = rawBody;
        }
      } catch {
        message = rawBody;
      }
    }
    if (response.status === 401) {
      clearToken();
    }
    if (typeof window !== "undefined" && (response.status === 401 || response.status === 403)) {
      window.dispatchEvent(
        new CustomEvent(ADMIN_AUTH_ERROR_EVENT, {
          detail: {
            status: response.status,
            path: path.replace(/^\/+/, ""),
          },
        }),
      );
    }
    throw new ApiError(response.status, message);
  }

  return (await response.json()) as T;
}
