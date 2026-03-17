export function getPortalOrigin(): string {
  if (typeof window === "undefined") {
    return "/portal";
  }
  return `${window.location.origin.replace("://admin.", "://")}/portal`;
}

export function getAdminLoginPath(nextPath: string): string {
  return `/login?next=${encodeURIComponent(nextPath || "/")}`;
}
