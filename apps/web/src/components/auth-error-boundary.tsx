"use client";

import { notifications } from "@mantine/notifications";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { clearToken } from "../lib/auth";
import { PORTAL_AUTH_ERROR_EVENT } from "../lib/api-client";

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
        router.replace(`/login?next=${encodeURIComponent(pathname || "/portal")}`);
        return;
      }

      if (status === 403) {
        notifications.show({
          title: "Access denied",
          message: "You do not have permission to access that resource.",
          color: "red",
        });
        router.replace("/portal");
      }
    };

    window.addEventListener(PORTAL_AUTH_ERROR_EVENT, handleAuthError as EventListener);
    return () => {
      window.removeEventListener(PORTAL_AUTH_ERROR_EVENT, handleAuthError as EventListener);
    };
  }, [pathname, router]);

  return null;
}
