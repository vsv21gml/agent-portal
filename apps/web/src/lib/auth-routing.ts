export function getPortalLoginPath(nextPath: string): string {
  return `/login?next=${encodeURIComponent(nextPath || "/portal")}`;
}

export function getPortalResetPasswordPath(nextPath: string): string {
  return `/reset-password?next=${encodeURIComponent(nextPath || "/portal")}`;
}
