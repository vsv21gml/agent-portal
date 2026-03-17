"use client";

import { notifications } from "@mantine/notifications";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { clearToken } from "../lib/auth";
import { getAdminLoginPath, getPortalOrigin } from "../lib/auth-routing";
import { ADMIN_AUTH_ERROR_EVENT } from "../lib/api-client";

export function AuthErrorBoundary() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const handleAuthError = (event: Event) => {
      const detail =
        event instanceof CustomEvent && event.detail && typeof event.detail === "object"
          ? (event.detail as { status?: unknown })
          : null;
      const status = typeof detail?.status === "number" ? detail.status : null;

      if (status === 401) {
        clearToken();
        router.replace(getAdminLoginPath(pathname || "/"));
        return;
      }

      if (status === 403) {
        notifications.show({
          title: "Access denied",
          message: "Admin permission is required.",
          color: "red",
        });
        window.location.assign(getPortalOrigin());
      }
    };

    window.addEventListener(ADMIN_AUTH_ERROR_EVENT, handleAuthError as EventListener);
    return () => {
      window.removeEventListener(ADMIN_AUTH_ERROR_EVENT, handleAuthError as EventListener);
    };
  }, [pathname, router]);

  return null;
}
