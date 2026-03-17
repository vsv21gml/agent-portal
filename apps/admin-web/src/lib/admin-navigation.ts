export type AdminSection = "approvals" | "users" | "projects" | "resources" | "serving" | "models" | "gitlab" | "audit" | "access";

export const adminNavigation: Array<{ key: AdminSection; label: string; href: string }> = [
  { key: "approvals", label: "Approvals", href: "/approvals" },
  { key: "users", label: "Users", href: "/users" },
  { key: "projects", label: "Projects", href: "/projects" },
  { key: "resources", label: "Resources", href: "/resources" },
  { key: "serving", label: "Serving", href: "/serving" },
  { key: "models", label: "Models", href: "/models" },
  { key: "gitlab", label: "GitLab", href: "/gitlab" },
  { key: "audit", label: "Audit", href: "/audit" },
  { key: "access", label: "Access", href: "/access" },
];
