"use client";

import {
  Badge,
  Button,
  Drawer,
  Group,
  LoadingOverlay,
  Paper,
  Pagination,
  RingProgress,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AdminFrame } from "../src/components/admin-frame";
import { ProfileMenu } from "../src/components/profile-menu";
import { ApiError, apiFetch } from "../src/lib/api-client";
import { clearToken } from "../src/lib/auth";
import { AdminSection, adminNavigation } from "../src/lib/admin-navigation";

type UserRow = {
  id: string;
  email: string;
  displayName: string;
  globalRole: string;
};

type InvitationRow = {
  id: string;
  email: string;
  displayName: string;
  globalRole: string;
  token: string;
  createdAt: string;
};

type ProjectRow = {
  id: string;
  name: string;
  description: string;
  createdAt: string;
};

type AuditLogRow = {
  id: string;
  userId?: string | null;
  userEmail?: string | null;
  actionKey: string;
  targetType?: string | null;
  targetId?: string | null;
  projectId?: string | null;
  metadataJson?: string | null;
  createdAt: string;
};

type AccessLogRow = {
  id: string;
  userId?: string | null;
  userEmail?: string | null;
  clientIp?: string | null;
  eventType: string;
  authProvider?: string | null;
  status: string;
  detail?: string | null;
  createdAt: string;
};

type ResourceRow = {
  sessionId: string;
  projectId: string;
  projectName: string;
  repoId: string;
  repoName: string;
  userId: string;
  userEmail: string;
  userDisplayName: string;
  status: string;
  cpu: number;
  memoryGi: number;
  nodeName: string | null;
  createdAt: string;
};

type ResourceNodeRow = {
  nodeName: string;
  cpu: number;
  memoryGi: number;
};

type WorkspaceResourceOverview = {
  nodePool: {
    nodeCount: number;
    totalCpu: number;
    totalMemoryGi: number;
    nodes: ResourceNodeRow[];
  };
  running: {
    workspaceCount: number;
    usedCpu: number;
    usedMemoryGi: number;
    cpuUsagePercent: number;
    memoryUsagePercent: number;
  };
  rows: ResourceRow[];
};

type AgentResourceRow = {
  agentId: string;
  projectId: string;
  projectName: string;
  repoId: string;
  repoName: string;
  agentName: string;
  userId: string;
  userEmail: string;
  userDisplayName: string;
  status: string;
  cpu: number;
  memoryGi: number;
  nodeName: string | null;
  createdAt: string;
};

type AgentResourceOverview = {
  nodePool: {
    nodeCount: number;
    totalCpu: number;
    totalMemoryGi: number;
    nodes: ResourceNodeRow[];
  };
  running: {
    agentCount: number;
    usedCpu: number;
    usedMemoryGi: number;
    cpuUsagePercent: number;
    memoryUsagePercent: number;
  };
  rows: AgentResourceRow[];
};

type McpResourceRow = {
  mcpId: string;
  projectId: string;
  projectName: string;
  repoId: string;
  repoName: string;
  mcpName: string;
  userId: string;
  userEmail: string;
  userDisplayName: string;
  status: string;
  cpu: number;
  memoryGi: number;
  nodeName: string | null;
  createdAt: string;
};

type McpResourceOverview = {
  nodePool: {
    nodeCount: number;
    totalCpu: number;
    totalMemoryGi: number;
    nodes: ResourceNodeRow[];
  };
  running: {
    mcpCount: number;
    usedCpu: number;
    usedMemoryGi: number;
    cpuUsagePercent: number;
    memoryUsagePercent: number;
  };
  rows: McpResourceRow[];
};

type AgentAdminRow = {
  id: string;
  projectId: string;
  projectName: string;
  repoId: string;
  repoName: string;
  ownerUserId: string;
  ownerUserEmail: string;
  ownerUserDisplayName: string;
  agentName: string;
  description: string;
  litellmModel: string;
  status: string;
  endpointUrl: string;
  spendUsd: number;
  createdAt: string;
};

type McpAdminRow = {
  id: string;
  projectId: string;
  projectName: string;
  repoId: string;
  repoName: string;
  ownerUserId: string;
  ownerUserEmail: string;
  ownerUserDisplayName: string;
  mcpName: string;
  description: string;
  useLlm: string;
  litellmModel: string;
  status: string;
  endpointUrl: string;
  spendUsd: number;
  createdAt: string;
};

type GitlabGroup = {
  id: string;
  projectId: string;
  groupPath: string;
};

type GitlabRepo = {
  id: string;
  projectId: string;
  repoName: string;
  namespacePath: string;
};

type VectorKey = {
  id: string;
  projectId: string;
  ownerUserId: string;
  keyAlias: string;
  indexName: string;
  remoteKeyId: string | null;
  createdAt: string;
  apiKey?: string | null;
};

type CatalogModel = {
  id: string;
  modelName: string;
  isDefault: boolean;
};

type ModelAccessRequest = {
  id: string;
  ownerUserId: string;
  userEmail: string;
  userDisplayName: string;
  requestType: "personal" | "agent_deploy" | "mcp_deploy";
  projectId: string | null;
  projectName: string | null;
  agentId: string | null;
  agentName: string | null;
  mcpId: string | null;
  mcpName: string | null;
  modelName: string;
  status: string;
  reviewNote: string | null;
  reviewerUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

const PAGE_SIZE = 8;

const sectionMeta: Record<AdminSection, { title: string; description: string }> = {
  users: { title: "Users", description: "Manage portal users, invitations, and roles." },
  projects: { title: "Projects", description: "Review projects and open project-level administration actions." },
  resources: { title: "Resources", description: "Track workspace and serving resource usage across dedicated node pools." },
  serving: { title: "Serving", description: "Review deployed Agents and MCP servers together with their LiteLLM spend." },
  models: { title: "Models", description: "Manage LiteLLM catalog defaults and review model access requests." },
  gitlab: { title: "GitLab", description: "Review GitLab groups and repositories mapped to portal projects." },
  audit: { title: "Audit", description: "Inspect keyed user actions performed through the portal." },
  access: { title: "Access", description: "Inspect authentication events such as login and logout." },
};

function fallbackCopyText(text: string): boolean {
  if (typeof document === "undefined") {
    return false;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    return document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
}

function getSectionFromPathname(pathname: string): AdminSection {
  if (pathname === "/projects") {
    return "projects";
  }
  if (pathname === "/resources") {
    return "resources";
  }
  if (pathname === "/serving" || pathname === "/agents" || pathname === "/mcps") {
    return "serving";
  }
  if (pathname === "/models") {
    return "models";
  }
  if (pathname === "/gitlab") {
    return "gitlab";
  }
  if (pathname === "/audit") {
    return "audit";
  }
  if (pathname === "/access") {
    return "access";
  }
  return "users";
}

export default function AdminPage() {
  const router = useRouter();
  const pathname = usePathname();
  const activeSection = getSectionFromPathname(pathname);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [adminAgents, setAdminAgents] = useState<AgentAdminRow[]>([]);
  const [adminMcps, setAdminMcps] = useState<McpAdminRow[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
  const [accessLogs, setAccessLogs] = useState<AccessLogRow[]>([]);
  const [workspaceResourceOverview, setWorkspaceResourceOverview] = useState<WorkspaceResourceOverview | null>(null);
  const [agentResourceOverview, setAgentResourceOverview] = useState<AgentResourceOverview | null>(null);
  const [mcpResourceOverview, setMcpResourceOverview] = useState<McpResourceOverview | null>(null);
  const [resourceTab, setResourceTab] = useState<string | null>("workspace");
  const [workspaceResourceTab, setWorkspaceResourceTab] = useState<string | null>("deployments");
  const [servingResourceTab, setServingResourceTab] = useState<string | null>("deployments");
  const [groups, setGroups] = useState<GitlabGroup[]>([]);
  const [repos, setRepos] = useState<GitlabRepo[]>([]);
  const [vectorKeys, setVectorKeys] = useState<VectorKey[]>([]);
  const [catalogModels, setCatalogModels] = useState<CatalogModel[]>([]);
  const [modelRequests, setModelRequests] = useState<ModelAccessRequest[]>([]);
  const [activePage, setActivePage] = useState(1);
  const [gitlabGroupPage, setGitlabGroupPage] = useState(1);
  const [gitlabRepoPage, setGitlabRepoPage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);
  const [accessPage, setAccessPage] = useState(1);
  const [gitlabSearch, setGitlabSearch] = useState("");
  const [agentSearch, setAgentSearch] = useState("");
  const [agentStatusFilter, setAgentStatusFilter] = useState<string | null>("all");
  const [agentProjectFilter, setAgentProjectFilter] = useState<string | null>("all");
  const [mcpSearch, setMcpSearch] = useState("");
  const [mcpStatusFilter, setMcpStatusFilter] = useState<string | null>("all");
  const [mcpProjectFilter, setMcpProjectFilter] = useState<string | null>("all");
  const [auditSearch, setAuditSearch] = useState("");
  const [accessSearch, setAccessSearch] = useState("");
  const [agentPage, setAgentPage] = useState(1);
  const [mcpPage, setMcpPage] = useState(1);
  const [auditActionFilter, setAuditActionFilter] = useState<string | null>("all");
  const [accessEventFilter, setAccessEventFilter] = useState<string | null>("all");
  const [accessStatusFilter, setAccessStatusFilter] = useState<string | null>("all");
  const [detailProject, setDetailProject] = useState<ProjectRow | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteDisplayName, setInviteDisplayName] = useState("");
  const [inviteRole, setInviteRole] = useState<string | null>("user");
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [deletingInvitationId, setDeletingInvitationId] = useState<string | null>(null);
  const [gitlabOpen, setGitlabOpen] = useState(false);
  const [gitlabRepoName, setGitlabRepoName] = useState("");
  const [gitlabError, setGitlabError] = useState<string | null>(null);
  const [vectorOpen, setVectorOpen] = useState(false);
  const [vectorAlias, setVectorAlias] = useState("");
  const [vectorError, setVectorError] = useState<string | null>(null);
  const [updatingDefaultModelName, setUpdatingDefaultModelName] = useState<string | null>(null);
  const [reviewingRequestId, setReviewingRequestId] = useState<string | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const verifyAdmin = async () => {
    const me = await apiFetch<{ role: string }>("auth/me");
    if (me.role !== "admin") {
      clearToken();
      router.replace(`/login?next=${pathname}`);
      throw new Error("Admin role required");
    }
  };

  const loadUsersData = async () => {
    const [usersResult, invitationsResult] = await Promise.all([
      apiFetch<UserRow[]>("admin/users"),
      apiFetch<InvitationRow[]>("auth/invitations"),
    ]);
    setUsers(usersResult);
    setInvitations(invitationsResult);
  };

  const loadProjectsData = async () => {
    const loadedProjects = await apiFetch<ProjectRow[]>("admin/projects");
    setProjects(loadedProjects);
    return loadedProjects;
  };

  const loadAgentsData = async () => {
    const loadedAgents = await apiFetch<AgentAdminRow[]>("admin/agents");
    setAdminAgents(loadedAgents);
  };

  const loadMcpsData = async () => {
    const loadedMcps = await apiFetch<McpAdminRow[]>("admin/mcps");
    setAdminMcps(loadedMcps);
  };

  const loadResourceData = async () => {
    const [workspaceResult, agentResult, mcpResult] = await Promise.all([
      apiFetch<WorkspaceResourceOverview>("admin/resources/workspaces"),
      apiFetch<AgentResourceOverview>("admin/resources/agents"),
      apiFetch<McpResourceOverview>("admin/resources/mcps"),
    ]);
    setWorkspaceResourceOverview(workspaceResult);
    setAgentResourceOverview(agentResult);
    setMcpResourceOverview(mcpResult);
  };

  const loadGitlabData = async () => {
    const loadedProjects = projects.length ? projects : await loadProjectsData();
    const [groupsResult, repoResults] = await Promise.all([
      apiFetch<GitlabGroup[]>("admin/gitlab/groups"),
      Promise.allSettled(loadedProjects.map((project) => apiFetch<GitlabRepo[]>(`admin/projects/${project.id}/gitlab/repos`))),
    ]);
    setGroups(groupsResult);
    setRepos(repoResults.flatMap((result) => (result.status === "fulfilled" ? result.value : [])));
  };

  const loadModelData = async () => {
    const [catalogModelsResult, modelRequestsResult] = await Promise.all([
      apiFetch<CatalogModel[]>("admin/llm/models"),
      apiFetch<ModelAccessRequest[]>("admin/llm/model-requests"),
    ]);
    setCatalogModels(catalogModelsResult);
    setModelRequests(modelRequestsResult);
  };

  const loadAuditData = async () => {
    setAuditLogs(await apiFetch<AuditLogRow[]>("admin/logs/audit"));
  };

  const loadAccessData = async () => {
    setAccessLogs(await apiFetch<AccessLogRow[]>("admin/logs/access"));
  };

  const loadSectionData = async () => {
    switch (activeSection) {
      case "users":
        await loadUsersData();
        break;
      case "projects":
        await loadProjectsData();
        break;
      case "resources":
        await loadResourceData();
        break;
      case "serving":
        await Promise.all([loadAgentsData(), loadMcpsData()]);
        break;
      case "models":
        await loadModelData();
        break;
      case "gitlab":
        await loadGitlabData();
        break;
      case "audit":
        await loadAuditData();
        break;
      case "access":
        await loadAccessData();
        break;
      default:
        await loadUsersData();
        break;
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        await verifyAdmin();
        await loadSectionData();
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          router.replace(`/login?next=${pathname}`);
          return;
        }
        notifications.show({
          title: "Load failed",
          message: "관리자 데이터를 불러오지 못했습니다.",
          color: "red",
        });
        router.replace("/login?next=/");
      } finally {
        setAuthChecking(false);
      }
    };

    void load();
  }, [pathname, router]);

  useEffect(() => {
    if (!inviteOpen) {
      return;
    }

    setInviteEmail("");
    setInviteDisplayName("");
    setInviteRole("user");
  }, [inviteOpen]);

  useEffect(() => {
    setGitlabGroupPage(1);
    setGitlabRepoPage(1);
  }, [gitlabSearch]);

  useEffect(() => {
    setAgentPage(1);
  }, [agentProjectFilter, agentSearch, agentStatusFilter]);

  useEffect(() => {
    setMcpPage(1);
  }, [mcpProjectFilter, mcpSearch, mcpStatusFilter]);

  useEffect(() => {
    setAuditPage(1);
  }, [auditActionFilter, auditSearch]);

  useEffect(() => {
    setAccessPage(1);
  }, [accessEventFilter, accessSearch, accessStatusFilter]);

  const buildPortalInviteUrl = (token: string) => {
    if (typeof window === "undefined") {
      return `/invite/${token}`;
    }

    const portalOrigin = window.location.origin.replace("://admin.", "://");
    return `${portalOrigin}/invite/${token}`;
  };

  const tryCopyLink = async (link: string): Promise<boolean> => {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(link);
        return true;
      } catch {
        // fall back
      }
    }

    return fallbackCopyText(link);
  };

  const createGitlabRepo = async () => {
    if (!detailProject) {
      return;
    }
    if (!gitlabRepoName.trim()) {
      setGitlabError("Repo name is required.");
      return;
    }
    setGitlabError(null);
    try {
      await apiFetch(`gitlab/projects/${detailProject.id}/group`, { method: "POST" });
      const created = await apiFetch<GitlabRepo>(`gitlab/projects/${detailProject.id}/repos`, {
        method: "POST",
        body: JSON.stringify({ repoName: gitlabRepoName.trim() }),
      });
      setRepos((prev) => [created, ...prev]);
      setGitlabRepoName("");
      setGitlabOpen(false);
      notifications.show({ title: "Created", message: "GitLab repo created.", color: "teal" });
    } catch {
      notifications.show({ title: "Failed", message: "Failed to create GitLab repo.", color: "red" });
    }
  };

  const issueVectorKey = async () => {
    if (!detailProject) {
      return;
    }
    if (!vectorAlias.trim()) {
      setVectorError("Key alias is required.");
      return;
    }
    setVectorError(null);
    try {
      const created = await apiFetch<VectorKey>(`vectordb/projects/${detailProject.id}/keys`, {
        method: "POST",
        body: JSON.stringify({ keyAlias: vectorAlias.trim() }),
      });
      setVectorKeys((prev) => [created, ...prev]);
      setVectorAlias("");
      setVectorOpen(false);
      notifications.show({
        title: "Issued",
        message: created.apiKey ? `VectorDB key issued: ${created.apiKey}` : "VectorDB key issued.",
        color: "teal",
      });
    } catch {
      notifications.show({ title: "Failed", message: "Failed to issue VectorDB key.", color: "red" });
    }
  };

  const createInvitation = async () => {
    if (!inviteEmail.trim() || !inviteDisplayName.trim() || !inviteRole) {
      notifications.show({ title: "Failed", message: "초대 정보를 모두 입력해 주세요.", color: "red" });
      return;
    }

    setCreatingInvite(true);
    try {
      const created = await apiFetch<InvitationRow>("auth/invitations", {
        method: "POST",
        body: JSON.stringify({
          email: inviteEmail.trim(),
          displayName: inviteDisplayName.trim(),
          globalRole: inviteRole,
        }),
      });
      setInvitations((prev) => [created, ...prev.filter((item) => item.id !== created.id)]);
      setInviteOpen(false);
      notifications.show({
        title: "Created",
        message: "초대 링크를 생성했습니다. Pending Invitations에서 복사할 수 있습니다.",
        color: "teal",
      });
    } catch {
      notifications.show({ title: "Failed", message: "초대 링크 생성에 실패했습니다.", color: "red" });
    } finally {
      setCreatingInvite(false);
    }
  };

  const copyInvitationLink = async (token: string) => {
    const link = buildPortalInviteUrl(token);
    if (await tryCopyLink(link)) {
      notifications.show({ title: "Copied", message: "초대 링크를 클립보드에 복사했습니다.", color: "teal" });
      return;
    }

    notifications.show({
      title: "Copy unavailable",
      message: "브라우저 제한으로 자동 복사가 불가합니다. 테이블의 링크 값을 직접 복사해 주세요.",
      color: "yellow",
    });
  };

  const deleteInvitation = async (invitationId: string) => {
    setDeletingInvitationId(invitationId);
    try {
      await apiFetch(`auth/invitations/${invitationId}`, { method: "DELETE" });
      setInvitations((prev) => prev.filter((invitation) => invitation.id !== invitationId));
      notifications.show({ title: "Deleted", message: "초대 링크를 삭제했습니다.", color: "teal" });
    } catch {
      notifications.show({ title: "Failed", message: "초대 링크 삭제에 실패했습니다.", color: "red" });
    } finally {
      setDeletingInvitationId(null);
    }
  };

  const updateRole = async (userId: string, role: "admin" | "user") => {
    try {
      await apiFetch(`auth/users/${userId}/role/${role}`, { method: "PATCH" });
      setUsers((prev) => prev.map((user) => (user.id === userId ? { ...user, globalRole: role } : user)));
      notifications.show({ title: "Updated", message: "Role updated.", color: "teal" });
    } catch {
      notifications.show({ title: "Failed", message: "Failed to update role.", color: "red" });
    }
  };

  const projectPages = Math.max(1, Math.ceil(projects.length / PAGE_SIZE));
  const pagedProjects = useMemo(() => {
    const start = (activePage - 1) * PAGE_SIZE;
    return projects.slice(start, start + PAGE_SIZE);
  }, [activePage, projects]);
  const projectNameById = useMemo(() => new Map(projects.map((project) => [project.id, project.name])), [projects]);
  const auditActionOptions = useMemo(
    () => [{ value: "all", label: "All actions" }, ...Array.from(new Set(auditLogs.map((log) => log.actionKey))).map((action) => ({ value: action, label: action }))],
    [auditLogs],
  );
  const accessEventOptions = useMemo(
    () => [{ value: "all", label: "All events" }, ...Array.from(new Set(accessLogs.map((log) => log.eventType))).map((eventType) => ({ value: eventType, label: eventType }))],
    [accessLogs],
  );
  const accessStatusOptions = useMemo(
    () => [
      { value: "all", label: "All statuses" },
      ...Array.from(new Set(accessLogs.map((log) => log.status)).values())
        .filter(Boolean)
        .map((status) => ({ value: status, label: status })),
    ],
    [accessLogs],
  );
  const agentStatusOptions = useMemo(
    () => [
      { value: "all", label: "All statuses" },
      ...Array.from(new Set(adminAgents.map((agent) => agent.status)))
        .filter(Boolean)
        .map((status) => ({ value: status, label: status })),
    ],
    [adminAgents],
  );
  const agentProjectOptions = useMemo(
    () => [
      { value: "all", label: "All projects" },
      ...Array.from(new Map(adminAgents.map((agent) => [agent.projectId, agent.projectName])).entries()).map(
        ([value, label]) => ({ value, label }),
      ),
    ],
    [adminAgents],
  );
  const mcpStatusOptions = useMemo(
    () => [
      { value: "all", label: "All statuses" },
      ...Array.from(new Set(adminMcps.map((mcp) => mcp.status)))
        .filter(Boolean)
        .map((status) => ({ value: status, label: status })),
    ],
    [adminMcps],
  );
  const mcpProjectOptions = useMemo(
    () => [
      { value: "all", label: "All projects" },
      ...Array.from(new Map(adminMcps.map((mcp) => [mcp.projectId, mcp.projectName])).entries()).map(([value, label]) => ({
        value,
        label,
      })),
    ],
    [adminMcps],
  );
  const filteredAdminAgents = useMemo(() => {
    const query = agentSearch.trim().toLowerCase();
    return adminAgents.filter((agent) => {
      const matchesQuery =
        !query ||
        [
          agent.agentName,
          agent.description,
          agent.repoName,
          agent.projectName,
          agent.ownerUserDisplayName,
          agent.ownerUserEmail,
          agent.id,
          agent.litellmModel,
        ].some((value) => value.toLowerCase().includes(query));
      const matchesStatus = agentStatusFilter === "all" || agent.status === agentStatusFilter;
      const matchesProject = agentProjectFilter === "all" || agent.projectId === agentProjectFilter;
      return matchesQuery && matchesStatus && matchesProject;
    });
  }, [adminAgents, agentProjectFilter, agentSearch, agentStatusFilter]);
  const agentPages = Math.max(1, Math.ceil(filteredAdminAgents.length / PAGE_SIZE));
  const pagedAdminAgents = useMemo(() => {
    const start = (agentPage - 1) * PAGE_SIZE;
    return filteredAdminAgents.slice(start, start + PAGE_SIZE);
  }, [agentPage, filteredAdminAgents]);
  const filteredAdminMcps = useMemo(() => {
    const query = mcpSearch.trim().toLowerCase();
    return adminMcps.filter((mcp) => {
      const matchesQuery =
        !query ||
        [
          mcp.mcpName,
          mcp.description,
          mcp.repoName,
          mcp.projectName,
          mcp.ownerUserDisplayName,
          mcp.ownerUserEmail,
          mcp.id,
          mcp.litellmModel,
        ].some((value) => value.toLowerCase().includes(query));
      const matchesStatus = mcpStatusFilter === "all" || mcp.status === mcpStatusFilter;
      const matchesProject = mcpProjectFilter === "all" || mcp.projectId === mcpProjectFilter;
      return matchesQuery && matchesStatus && matchesProject;
    });
  }, [adminMcps, mcpProjectFilter, mcpSearch, mcpStatusFilter]);
  const mcpPages = Math.max(1, Math.ceil(filteredAdminMcps.length / PAGE_SIZE));
  const pagedAdminMcps = useMemo(() => {
    const start = (mcpPage - 1) * PAGE_SIZE;
    return filteredAdminMcps.slice(start, start + PAGE_SIZE);
  }, [filteredAdminMcps, mcpPage]);
  const servingStatusOptions = useMemo(
    () => [
      { value: "all", label: "All statuses" },
      ...Array.from(new Set([...adminAgents.map((agent) => agent.status), ...adminMcps.map((mcp) => mcp.status)]))
        .filter(Boolean)
        .map((status) => ({ value: status, label: status })),
    ],
    [adminAgents, adminMcps],
  );
  const servingProjectOptions = useMemo(
    () => [
      { value: "all", label: "All projects" },
      ...Array.from(
        new Map(
          [...adminAgents.map((agent) => [agent.projectId, agent.projectName] as const), ...adminMcps.map((mcp) => [mcp.projectId, mcp.projectName] as const)],
        ).entries(),
      ).map(([value, label]) => ({ value, label })),
    ],
    [adminAgents, adminMcps],
  );
  const filteredServingRows = useMemo(() => {
    const query = agentSearch.trim().toLowerCase();
    const servingRows = [
      ...adminAgents.map((agent) => ({
        id: agent.id,
        type: "Agent",
        name: agent.agentName,
        description: agent.description,
        projectName: agent.projectName,
        projectId: agent.projectId,
        repoName: agent.repoName,
        owner: agent.ownerUserDisplayName || agent.ownerUserEmail || "-",
        llmEnabled: agent.litellmModel ? "Enabled" : "Disabled",
        model: agent.litellmModel || "-",
        status: agent.status,
        spendUsd: agent.spendUsd,
        createdAt: agent.createdAt,
      })),
      ...adminMcps.map((mcp) => ({
        id: mcp.id,
        type: "MCP",
        name: mcp.mcpName,
        description: mcp.description,
        projectName: mcp.projectName,
        projectId: mcp.projectId,
        repoName: mcp.repoName,
        owner: mcp.ownerUserDisplayName || mcp.ownerUserEmail || "-",
        llmEnabled: mcp.useLlm === "Y" ? "Enabled" : "Disabled",
        model: mcp.litellmModel || "-",
        status: mcp.status,
        spendUsd: mcp.spendUsd,
        createdAt: mcp.createdAt,
      })),
    ];

    return servingRows.filter((row) => {
      const matchesQuery =
        !query ||
        [row.type, row.name, row.description, row.projectName, row.repoName, row.owner, row.model, row.id].some((value) =>
          value.toLowerCase().includes(query),
        );
      const matchesStatus = agentStatusFilter === "all" || row.status === agentStatusFilter;
      const matchesProject = agentProjectFilter === "all" || row.projectId === agentProjectFilter;
      return matchesQuery && matchesStatus && matchesProject;
    });
  }, [adminAgents, adminMcps, agentProjectFilter, agentSearch, agentStatusFilter]);
  const servingPages = Math.max(1, Math.ceil(filteredServingRows.length / PAGE_SIZE));
  const pagedServingRows = useMemo(() => {
    const start = (agentPage - 1) * PAGE_SIZE;
    return filteredServingRows.slice(start, start + PAGE_SIZE);
  }, [agentPage, filteredServingRows]);
  const servingResourceOverview = useMemo(() => {
    const nodeMap = new Map<string, ResourceNodeRow>();

    for (const node of agentResourceOverview?.nodePool.nodes ?? []) {
      nodeMap.set(node.nodeName, node);
    }

    for (const node of mcpResourceOverview?.nodePool.nodes ?? []) {
      nodeMap.set(node.nodeName, node);
    }

    const nodes = Array.from(nodeMap.values()).sort((left, right) => left.nodeName.localeCompare(right.nodeName));
    const totalCpu = nodes.reduce((sum, node) => sum + node.cpu, 0);
    const totalMemoryGi = nodes.reduce((sum, node) => sum + node.memoryGi, 0);
    const usedCpu = (agentResourceOverview?.running.usedCpu ?? 0) + (mcpResourceOverview?.running.usedCpu ?? 0);
    const usedMemoryGi = (agentResourceOverview?.running.usedMemoryGi ?? 0) + (mcpResourceOverview?.running.usedMemoryGi ?? 0);
    const agentCount = agentResourceOverview?.running.agentCount ?? 0;
    const mcpCount = mcpResourceOverview?.running.mcpCount ?? 0;
    const rows = [
      ...(agentResourceOverview?.rows.map((resource) => ({
        id: resource.agentId,
        type: "Agent",
        projectName: resource.projectName,
        name: resource.agentName,
        repoName: resource.repoName,
        userDisplayName: resource.userDisplayName,
        userEmail: resource.userEmail,
        cpu: resource.cpu,
        memoryGi: resource.memoryGi,
        nodeName: resource.nodeName,
        createdAt: resource.createdAt,
      })) ?? []),
      ...(mcpResourceOverview?.rows.map((resource) => ({
        id: resource.mcpId,
        type: "MCP",
        projectName: resource.projectName,
        name: resource.mcpName,
        repoName: resource.repoName,
        userDisplayName: resource.userDisplayName,
        userEmail: resource.userEmail,
        cpu: resource.cpu,
        memoryGi: resource.memoryGi,
        nodeName: resource.nodeName,
        createdAt: resource.createdAt,
      })) ?? []),
    ].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());

    return {
      nodePool: {
        nodeCount: nodes.length,
        totalCpu,
        totalMemoryGi,
        nodes,
      },
      running: {
        deploymentCount: agentCount + mcpCount,
        agentCount,
        mcpCount,
        usedCpu,
        usedMemoryGi,
        cpuUsagePercent: totalCpu > 0 ? (usedCpu / totalCpu) * 100 : 0,
        memoryUsagePercent: totalMemoryGi > 0 ? (usedMemoryGi / totalMemoryGi) * 100 : 0,
      },
      rows,
    };
  }, [agentResourceOverview, mcpResourceOverview]);
  const filteredGitlabGroups = useMemo(() => {
    const query = gitlabSearch.trim().toLowerCase();
    if (!query) {
      return groups;
    }
    return groups.filter((group) => {
      const projectName = projectNameById.get(group.projectId) ?? "";
      return [group.groupPath, group.projectId, projectName].some((value) => value.toLowerCase().includes(query));
    });
  }, [gitlabSearch, groups, projectNameById]);
  const filteredGitlabRepos = useMemo(() => {
    const query = gitlabSearch.trim().toLowerCase();
    if (!query) {
      return repos;
    }
    return repos.filter((repo) => {
      const projectName = projectNameById.get(repo.projectId) ?? "";
      return [repo.repoName, repo.namespacePath, repo.projectId, projectName].some((value) => value.toLowerCase().includes(query));
    });
  }, [gitlabSearch, projectNameById, repos]);
  const gitlabGroupPages = Math.max(1, Math.ceil(filteredGitlabGroups.length / PAGE_SIZE));
  const pagedGitlabGroups = useMemo(() => {
    const start = (gitlabGroupPage - 1) * PAGE_SIZE;
    return filteredGitlabGroups.slice(start, start + PAGE_SIZE);
  }, [filteredGitlabGroups, gitlabGroupPage]);
  const gitlabRepoPages = Math.max(1, Math.ceil(filteredGitlabRepos.length / PAGE_SIZE));
  const pagedGitlabRepos = useMemo(() => {
    const start = (gitlabRepoPage - 1) * PAGE_SIZE;
    return filteredGitlabRepos.slice(start, start + PAGE_SIZE);
  }, [filteredGitlabRepos, gitlabRepoPage]);
  const filteredAuditLogs = useMemo(() => {
    const query = auditSearch.trim().toLowerCase();
    return auditLogs.filter((log) => {
      const matchesAction = auditActionFilter === "all" || log.actionKey === auditActionFilter;
      const matchesQuery =
        !query ||
        [log.actionKey, log.targetType ?? "", log.targetId ?? "", log.projectId ?? "", log.userEmail ?? "", log.metadataJson ?? ""].some((value) =>
          value.toLowerCase().includes(query),
        );
      return matchesAction && matchesQuery;
    });
  }, [auditActionFilter, auditLogs, auditSearch]);
  const auditPages = Math.max(1, Math.ceil(filteredAuditLogs.length / PAGE_SIZE));
  const pagedAuditLogs = useMemo(() => {
    const start = (auditPage - 1) * PAGE_SIZE;
    return filteredAuditLogs.slice(start, start + PAGE_SIZE);
  }, [auditPage, filteredAuditLogs]);
  const filteredAccessLogs = useMemo(() => {
    const query = accessSearch.trim().toLowerCase();
    return accessLogs.filter((log) => {
      const matchesEvent = accessEventFilter === "all" || log.eventType === accessEventFilter;
      const matchesStatus = accessStatusFilter === "all" || log.status === accessStatusFilter;
      const matchesQuery =
        !query ||
        [log.userEmail ?? "", log.clientIp ?? "", log.eventType, log.authProvider ?? "", log.status, log.detail ?? ""].some((value) =>
          value.toLowerCase().includes(query),
        );
      return matchesEvent && matchesStatus && matchesQuery;
    });
  }, [accessEventFilter, accessLogs, accessSearch, accessStatusFilter]);
  const accessPages = Math.max(1, Math.ceil(filteredAccessLogs.length / PAGE_SIZE));
  const pagedAccessLogs = useMemo(() => {
    const start = (accessPage - 1) * PAGE_SIZE;
    return filteredAccessLogs.slice(start, start + PAGE_SIZE);
  }, [accessPage, filteredAccessLogs]);
  const currentSectionMeta = sectionMeta[activeSection];

  const refreshCurrentPage = async () => {
    setRefreshing(true);
    try {
      await verifyAdmin();
      await loadSectionData();
      notifications.show({
        title: "Refreshed",
        message: `${activeSection} data refreshed.`,
        color: "teal",
      });
    } catch {
      notifications.show({
        title: "Failed",
        message: "Failed to refresh data.",
        color: "red",
      });
    } finally {
      setRefreshing(false);
    }
  };

  const toggleDefaultModel = async (model: CatalogModel) => {
    setUpdatingDefaultModelName(model.modelName);
    try {
      const updated = await apiFetch<CatalogModel>(`admin/llm/models/${encodeURIComponent(model.modelName)}/default`, {
        method: "PATCH",
        body: JSON.stringify({ isDefault: !model.isDefault }),
      });
      setCatalogModels((prev) =>
        prev
          .map((item) => (item.id === updated.id ? updated : item))
          .sort((left, right) => Number(right.isDefault) - Number(left.isDefault) || left.modelName.localeCompare(right.modelName)),
      );
      notifications.show({
        title: "Updated",
        message: `${updated.modelName} default setting updated.`,
        color: "teal",
      });
    } catch {
      notifications.show({
        title: "Failed",
        message: "Failed to update default model.",
        color: "red",
      });
    } finally {
      setUpdatingDefaultModelName(null);
    }
  };

  const reviewModelRequest = async (requestId: string, action: "approve" | "reject") => {
    setReviewingRequestId(requestId);
    try {
      await apiFetch(`admin/llm/model-requests/${requestId}/${action}`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      const refreshed = await apiFetch<ModelAccessRequest[]>("admin/llm/model-requests");
      setModelRequests(refreshed);
      notifications.show({
        title: action === "approve" ? "Approved" : "Rejected",
        message: `Model request ${action}d.`,
        color: "teal",
      });
    } catch {
      notifications.show({
        title: "Failed",
        message: `Failed to ${action} model request.`,
        color: "red",
      });
    } finally {
      setReviewingRequestId(null);
    }
  };

  return (
    <AdminFrame
      headerActions={<ProfileMenu />}
      navigation={adminNavigation}
      activeNav={activeSection}
    >
      <Stack pos="relative" gap="md">
        <LoadingOverlay visible={authChecking} zIndex={1000} overlayProps={{ radius: "sm", blur: 2 }} />
        <Paper withBorder p="md">
          <Group justify="space-between" align="center">
            <div>
              <Title order={4}>{currentSectionMeta.title}</Title>
              <Text size="sm" c="dimmed" mt={4}>
                {currentSectionMeta.description}
              </Text>
            </div>
            <Button variant="light" loading={refreshing} onClick={() => void refreshCurrentPage()}>
              Refresh
            </Button>
          </Group>
        </Paper>
        {activeSection === "users" ? (
          <Paper withBorder p="md">
            <Group justify="space-between" align="center">
              <Title order={4}>Users</Title>
              <Button variant="light" onClick={() => setInviteOpen(true)}>
                Invite User
              </Button>
            </Group>

            <ScrollArea mt="sm">
              <Table withTableBorder highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Email</Table.Th>
                    <Table.Th>Name</Table.Th>
                    <Table.Th>Role</Table.Th>
                    <Table.Th>Action</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {users.map((user) => (
                    <Table.Tr key={user.id}>
                      <Table.Td>{user.email}</Table.Td>
                      <Table.Td>{user.displayName}</Table.Td>
                      <Table.Td>
                        <Badge>{user.globalRole}</Badge>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs">
                          <Badge variant="light" style={{ cursor: "pointer" }} onClick={() => void updateRole(user.id, "admin")}>
                            ADMIN
                          </Badge>
                          <Badge variant="light" style={{ cursor: "pointer" }} onClick={() => void updateRole(user.id, "user")}>
                            USER
                          </Badge>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>

            <Title order={5} mt="xl">
              Pending Invitations
            </Title>
            <ScrollArea mt="sm">
              <Table withTableBorder highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Email</Table.Th>
                    <Table.Th>Name</Table.Th>
                    <Table.Th>Role</Table.Th>
                    <Table.Th>Created</Table.Th>
                    <Table.Th>Link</Table.Th>
                    <Table.Th>Delete</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {invitations.length === 0 ? (
                    <Table.Tr>
                      <Table.Td colSpan={6}>
                        <Text size="sm" c="dimmed">
                          No pending invitations.
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  ) : (
                    invitations.map((invitation) => (
                      <Table.Tr key={invitation.id}>
                        <Table.Td>{invitation.email}</Table.Td>
                        <Table.Td>{invitation.displayName}</Table.Td>
                        <Table.Td>{invitation.globalRole}</Table.Td>
                        <Table.Td>{new Date(invitation.createdAt).toLocaleString()}</Table.Td>
                        <Table.Td>
                          <Group gap="xs" wrap="nowrap">
                            <TextInput value={buildPortalInviteUrl(invitation.token)} readOnly styles={{ input: { minWidth: 320 } }} />
                            <Button size="xs" variant="light" onClick={() => void copyInvitationLink(invitation.token)}>
                              Copy
                            </Button>
                          </Group>
                        </Table.Td>
                        <Table.Td>
                          <Button
                            size="xs"
                            color="red"
                            variant="subtle"
                            loading={deletingInvitationId === invitation.id}
                            onClick={() => void deleteInvitation(invitation.id)}
                          >
                            Delete
                          </Button>
                        </Table.Td>
                      </Table.Tr>
                    ))
                  )}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          </Paper>
        ) : null}

        {activeSection === "projects" ? (
          <Paper withBorder p="md">
            <Title order={4}>Projects</Title>
            <ScrollArea mt="sm">
              <Table withTableBorder highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Name</Table.Th>
                    <Table.Th>ID</Table.Th>
                    <Table.Th>Created</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {pagedProjects.map((project) => (
                    <Table.Tr key={project.id} onClick={() => setDetailProject(project)} style={{ cursor: "pointer" }}>
                      <Table.Td>{project.name}</Table.Td>
                      <Table.Td>{project.id}</Table.Td>
                      <Table.Td>{new Date(project.createdAt).toLocaleString()}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
            <Group justify="end" mt="md">
              <Pagination total={projectPages} value={activePage} onChange={setActivePage} />
            </Group>
          </Paper>
        ) : null}

        {activeSection === "resources" ? (
          <Stack gap="md">
            <Tabs value={resourceTab} onChange={setResourceTab}>
              <Tabs.List>
                <Tabs.Tab value="workspace">Workspace</Tabs.Tab>
                <Tabs.Tab value="serving">Serving</Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="workspace" pt="md">
                <Stack gap="md">
                  <Paper withBorder p="md">
                    <Stack gap="md">
                      <Title order={4}>Workspace Resource Overview</Title>
                      <SimpleGrid cols={{ base: 1, md: 2, xl: 4 }} spacing="md">
                        <Paper withBorder p="md" radius="md">
                          <Group justify="space-between" align="center">
                            <div>
                              <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
                                Workspace Nodes
                              </Text>
                              <Text mt="sm" fw={700} size="xl">
                                {workspaceResourceOverview?.nodePool.nodeCount ?? 0}
                              </Text>
                            </div>
                            <Badge variant="light">{workspaceResourceOverview?.running.workspaceCount ?? 0} running</Badge>
                          </Group>
                        </Paper>

                        <Paper withBorder p="md" radius="md">
                          <Group justify="space-between" align="center">
                            <div>
                              <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
                                Node CPU Capacity
                              </Text>
                              <Text mt="sm" fw={700} size="xl">
                                {Number.isInteger(workspaceResourceOverview?.nodePool.totalCpu ?? 0)
                                  ? (workspaceResourceOverview?.nodePool.totalCpu ?? 0).toFixed(0)
                                  : (workspaceResourceOverview?.nodePool.totalCpu ?? 0).toFixed(1)}
                              </Text>
                            </div>
                            <RingProgress
                              size={88}
                              thickness={10}
                              sections={[{ value: workspaceResourceOverview?.running.cpuUsagePercent ?? 0, color: "blue" }]}
                              label={
                                <Text ta="center" size="xs" fw={700}>
                                  {Math.round(workspaceResourceOverview?.running.cpuUsagePercent ?? 0)}%
                                </Text>
                              }
                            />
                          </Group>
                          <Text size="sm" c="dimmed" mt="sm">
                            Kubernetes reported capacity
                          </Text>
                        </Paper>

                        <Paper withBorder p="md" radius="md">
                          <Group justify="space-between" align="center">
                            <div>
                              <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
                                Node MEM Capacity
                              </Text>
                              <Text mt="sm" fw={700} size="xl">
                                {(workspaceResourceOverview?.nodePool.totalMemoryGi ?? 0).toFixed(1)} Gi
                              </Text>
                            </div>
                            <RingProgress
                              size={88}
                              thickness={10}
                              sections={[{ value: workspaceResourceOverview?.running.memoryUsagePercent ?? 0, color: "grape" }]}
                              label={
                                <Text ta="center" size="xs" fw={700}>
                                  {Math.round(workspaceResourceOverview?.running.memoryUsagePercent ?? 0)}%
                                </Text>
                              }
                            />
                          </Group>
                          <Text size="sm" c="dimmed" mt="sm">
                            Kubernetes reported capacity
                          </Text>
                        </Paper>

                        <Paper withBorder p="md" radius="md">
                          <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
                            Running Workspace
                          </Text>
                          <Text mt="sm" fw={700} size="xl">
                            {workspaceResourceOverview?.running.workspaceCount ?? 0}
                          </Text>
                          <Text size="sm" c="dimmed" mt="sm">
                            CPU {(workspaceResourceOverview?.running.usedCpu ?? 0).toFixed(1)} / MEM {(workspaceResourceOverview?.running.usedMemoryGi ?? 0).toFixed(1)} Gi
                          </Text>
                        </Paper>
                      </SimpleGrid>
                    </Stack>
                  </Paper>

                  <Tabs value={workspaceResourceTab} onChange={setWorkspaceResourceTab}>
                    <Tabs.List>
                      <Tabs.Tab value="deployments">Deployments</Tabs.Tab>
                      <Tabs.Tab value="nodes">Nodes</Tabs.Tab>
                    </Tabs.List>

                    <Tabs.Panel value="deployments" pt="md">
                      <Paper withBorder p="md">
                        <Title order={4}>Running Workspace Sessions</Title>
                        <ScrollArea mt="sm">
                          <Table withTableBorder highlightOnHover>
                            <Table.Thead>
                              <Table.Tr>
                                <Table.Th>Project</Table.Th>
                                <Table.Th>Repo</Table.Th>
                                <Table.Th>User</Table.Th>
                                <Table.Th>Email</Table.Th>
                                <Table.Th>CPU</Table.Th>
                                <Table.Th>MEM Gi</Table.Th>
                                <Table.Th>Node</Table.Th>
                                <Table.Th>Started</Table.Th>
                              </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                              {workspaceResourceOverview?.rows.length ? (
                                workspaceResourceOverview.rows.map((resource) => (
                                  <Table.Tr key={resource.sessionId}>
                                    <Table.Td>{resource.projectName}</Table.Td>
                                    <Table.Td>{resource.repoName}</Table.Td>
                                    <Table.Td>{resource.userDisplayName}</Table.Td>
                                    <Table.Td>{resource.userEmail || "-"}</Table.Td>
                                    <Table.Td>{resource.cpu}</Table.Td>
                                    <Table.Td>{resource.memoryGi}</Table.Td>
                                    <Table.Td>{resource.nodeName ?? "-"}</Table.Td>
                                    <Table.Td>{new Date(resource.createdAt).toLocaleString()}</Table.Td>
                                  </Table.Tr>
                                ))
                              ) : (
                                <Table.Tr>
                                  <Table.Td colSpan={8}>
                                    <Text size="sm" c="dimmed">
                                      No running workspace sessions.
                                    </Text>
                                  </Table.Td>
                                </Table.Tr>
                              )}
                            </Table.Tbody>
                          </Table>
                        </ScrollArea>
                      </Paper>
                    </Tabs.Panel>

                    <Tabs.Panel value="nodes" pt="md">
                      <Paper withBorder p="md">
                        <Title order={4}>Workspace Node List</Title>
                        <ScrollArea mt="sm">
                          <Table withTableBorder highlightOnHover>
                            <Table.Thead>
                              <Table.Tr>
                                <Table.Th>Node</Table.Th>
                                <Table.Th>CPU</Table.Th>
                                <Table.Th>MEM Gi</Table.Th>
                              </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                              {workspaceResourceOverview?.nodePool.nodes.length ? (
                                workspaceResourceOverview.nodePool.nodes.map((node) => (
                                  <Table.Tr key={node.nodeName}>
                                    <Table.Td>{node.nodeName}</Table.Td>
                                    <Table.Td>{Number.isInteger(node.cpu) ? node.cpu.toFixed(0) : node.cpu.toFixed(1)}</Table.Td>
                                    <Table.Td>{node.memoryGi.toFixed(1)}</Table.Td>
                                  </Table.Tr>
                                ))
                              ) : (
                                <Table.Tr>
                                  <Table.Td colSpan={3}>
                                    <Text size="sm" c="dimmed">
                                      No workspace nodes matched the configured selector.
                                    </Text>
                                  </Table.Td>
                                </Table.Tr>
                              )}
                            </Table.Tbody>
                          </Table>
                        </ScrollArea>
                      </Paper>
                    </Tabs.Panel>
                  </Tabs>
                </Stack>
              </Tabs.Panel>

              <Tabs.Panel value="serving" pt="md">
                <Stack gap="md">
                  <Paper withBorder p="md">
                    <Stack gap="md">
                      <Title order={4}>Serving Resource Overview</Title>
                      <SimpleGrid cols={{ base: 1, md: 2, xl: 4 }} spacing="md">
                        <Paper withBorder p="md" radius="md">
                          <Group justify="space-between" align="center">
                            <div>
                              <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
                                Serving Nodes
                              </Text>
                              <Text mt="sm" fw={700} size="xl">
                                {servingResourceOverview.nodePool.nodeCount}
                              </Text>
                            </div>
                            <Badge variant="light">{servingResourceOverview.running.deploymentCount} running</Badge>
                          </Group>
                        </Paper>

                        <Paper withBorder p="md" radius="md">
                          <Group justify="space-between" align="center">
                            <div>
                              <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
                                Node CPU Capacity
                              </Text>
                              <Text mt="sm" fw={700} size="xl">
                                {Number.isInteger(servingResourceOverview.nodePool.totalCpu)
                                  ? servingResourceOverview.nodePool.totalCpu.toFixed(0)
                                  : servingResourceOverview.nodePool.totalCpu.toFixed(1)}
                              </Text>
                            </div>
                            <RingProgress
                              size={88}
                              thickness={10}
                              sections={[{ value: servingResourceOverview.running.cpuUsagePercent, color: "blue" }]}
                              label={
                                <Text ta="center" size="xs" fw={700}>
                                  {Math.round(servingResourceOverview.running.cpuUsagePercent)}%
                                </Text>
                              }
                            />
                          </Group>
                          <Text size="sm" c="dimmed" mt="sm">
                            Kubernetes reported capacity
                          </Text>
                        </Paper>

                        <Paper withBorder p="md" radius="md">
                          <Group justify="space-between" align="center">
                            <div>
                              <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
                                Node MEM Capacity
                              </Text>
                              <Text mt="sm" fw={700} size="xl">
                                {servingResourceOverview.nodePool.totalMemoryGi.toFixed(1)} Gi
                              </Text>
                            </div>
                            <RingProgress
                              size={88}
                              thickness={10}
                              sections={[{ value: servingResourceOverview.running.memoryUsagePercent, color: "grape" }]}
                              label={
                                <Text ta="center" size="xs" fw={700}>
                                  {Math.round(servingResourceOverview.running.memoryUsagePercent)}%
                                </Text>
                              }
                            />
                          </Group>
                          <Text size="sm" c="dimmed" mt="sm">
                            Kubernetes reported capacity
                          </Text>
                        </Paper>

                        <Paper withBorder p="md" radius="md">
                          <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
                            Running Serving
                          </Text>
                          <Text mt="sm" fw={700} size="xl">
                            {servingResourceOverview.running.deploymentCount}
                          </Text>
                          <Text size="sm" c="dimmed" mt="sm">
                            Agent {servingResourceOverview.running.agentCount} / MCP {servingResourceOverview.running.mcpCount}
                          </Text>
                          <Text size="sm" c="dimmed">
                            CPU {servingResourceOverview.running.usedCpu.toFixed(1)} / MEM {servingResourceOverview.running.usedMemoryGi.toFixed(1)} Gi
                          </Text>
                        </Paper>
                      </SimpleGrid>
                    </Stack>
                  </Paper>

                  <Tabs value={servingResourceTab} onChange={setServingResourceTab}>
                    <Tabs.List>
                      <Tabs.Tab value="deployments">Deployments</Tabs.Tab>
                      <Tabs.Tab value="nodes">Nodes</Tabs.Tab>
                    </Tabs.List>

                    <Tabs.Panel value="deployments" pt="md">
                      <Paper withBorder p="md">
                        <Title order={4}>Running Serving Deployments</Title>
                        <ScrollArea mt="sm">
                          <Table withTableBorder highlightOnHover>
                            <Table.Thead>
                              <Table.Tr>
                                <Table.Th>Project</Table.Th>
                                <Table.Th>Type</Table.Th>
                                <Table.Th>Name</Table.Th>
                                <Table.Th>Repo</Table.Th>
                                <Table.Th>User</Table.Th>
                                <Table.Th>Email</Table.Th>
                                <Table.Th>CPU</Table.Th>
                                <Table.Th>MEM Gi</Table.Th>
                                <Table.Th>Node</Table.Th>
                                <Table.Th>Started</Table.Th>
                              </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                              {servingResourceOverview.rows.length ? (
                                servingResourceOverview.rows.map((resource) => (
                                  <Table.Tr key={`${resource.type}-${resource.id}`}>
                                    <Table.Td>{resource.projectName}</Table.Td>
                                    <Table.Td>
                                      <Badge variant="light" color={resource.type === "Agent" ? "blue" : "grape"}>
                                        {resource.type}
                                      </Badge>
                                    </Table.Td>
                                    <Table.Td>{resource.name}</Table.Td>
                                    <Table.Td>{resource.repoName}</Table.Td>
                                    <Table.Td>{resource.userDisplayName}</Table.Td>
                                    <Table.Td>{resource.userEmail || "-"}</Table.Td>
                                    <Table.Td>{resource.cpu.toFixed(1)}</Table.Td>
                                    <Table.Td>{resource.memoryGi.toFixed(1)}</Table.Td>
                                    <Table.Td>{resource.nodeName ?? "-"}</Table.Td>
                                    <Table.Td>{new Date(resource.createdAt).toLocaleString()}</Table.Td>
                                  </Table.Tr>
                                ))
                              ) : (
                                <Table.Tr>
                                  <Table.Td colSpan={10}>
                                    <Text size="sm" c="dimmed">
                                      No running serving deployments.
                                    </Text>
                                  </Table.Td>
                                </Table.Tr>
                              )}
                            </Table.Tbody>
                          </Table>
                        </ScrollArea>
                      </Paper>
                    </Tabs.Panel>

                    <Tabs.Panel value="nodes" pt="md">
                      <Paper withBorder p="md">
                        <Title order={4}>Serving Node List</Title>
                        <ScrollArea mt="sm">
                          <Table withTableBorder highlightOnHover>
                            <Table.Thead>
                              <Table.Tr>
                                <Table.Th>Node</Table.Th>
                                <Table.Th>CPU</Table.Th>
                                <Table.Th>MEM Gi</Table.Th>
                              </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                              {servingResourceOverview.nodePool.nodes.length ? (
                                servingResourceOverview.nodePool.nodes.map((node) => (
                                  <Table.Tr key={node.nodeName}>
                                    <Table.Td>{node.nodeName}</Table.Td>
                                    <Table.Td>{Number.isInteger(node.cpu) ? node.cpu.toFixed(0) : node.cpu.toFixed(1)}</Table.Td>
                                    <Table.Td>{node.memoryGi.toFixed(1)}</Table.Td>
                                  </Table.Tr>
                                ))
                              ) : (
                                <Table.Tr>
                                  <Table.Td colSpan={3}>
                                    <Text size="sm" c="dimmed">
                                      No serving nodes matched the configured selector.
                                    </Text>
                                  </Table.Td>
                                </Table.Tr>
                              )}
                            </Table.Tbody>
                          </Table>
                        </ScrollArea>
                      </Paper>
                    </Tabs.Panel>
                  </Tabs>
                </Stack>
              </Tabs.Panel>
            </Tabs>
          </Stack>
        ) : null}

        {activeSection === "serving" ? (
          <Stack gap="md">
            <Paper withBorder p="md">
              <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
                <TextInput
                  label="Search"
                  placeholder="Agent, MCP, repo, project, owner, or model"
                  value={agentSearch}
                  onChange={(event) => setAgentSearch(event.currentTarget.value)}
                />
                <Select label="Status" data={servingStatusOptions} value={agentStatusFilter} onChange={setAgentStatusFilter} />
                <Select label="Project" data={servingProjectOptions} value={agentProjectFilter} onChange={setAgentProjectFilter} />
              </SimpleGrid>
            </Paper>

            <Paper withBorder p="md">
              <Title order={4}>All Serving Deployments</Title>
              <ScrollArea mt="sm">
                <Table withTableBorder highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Created</Table.Th>
                      <Table.Th>Type</Table.Th>
                      <Table.Th>Name</Table.Th>
                      <Table.Th>Description</Table.Th>
                      <Table.Th>Project</Table.Th>
                      <Table.Th>Repo</Table.Th>
                      <Table.Th>Owner</Table.Th>
                      <Table.Th>LLM</Table.Th>
                      <Table.Th>Model</Table.Th>
                      <Table.Th>Status</Table.Th>
                      <Table.Th>Spend USD</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {pagedServingRows.length ? (
                      pagedServingRows.map((deployment) => (
                        <Table.Tr key={`${deployment.type}-${deployment.id}`}>
                          <Table.Td>{new Date(deployment.createdAt).toLocaleString()}</Table.Td>
                          <Table.Td>
                            <Badge variant="light" color={deployment.type === "Agent" ? "blue" : "grape"}>
                              {deployment.type}
                            </Badge>
                          </Table.Td>
                          <Table.Td>{deployment.name}</Table.Td>
                          <Table.Td>{deployment.description || "-"}</Table.Td>
                          <Table.Td>{deployment.projectName}</Table.Td>
                          <Table.Td>{deployment.repoName}</Table.Td>
                          <Table.Td>{deployment.owner}</Table.Td>
                          <Table.Td>{deployment.llmEnabled ? "Enabled" : "Disabled"}</Table.Td>
                          <Table.Td>{deployment.model || "-"}</Table.Td>
                          <Table.Td>
                            <Badge variant="light">{deployment.status}</Badge>
                          </Table.Td>
                          <Table.Td>${deployment.spendUsd.toFixed(4)}</Table.Td>
                        </Table.Tr>
                      ))
                    ) : (
                      <Table.Tr>
                        <Table.Td colSpan={10}>
                          <Text size="sm" c="dimmed">
                            No serving deployments match the current filters.
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    )}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
              <Group justify="end" mt="md">
                <Pagination total={servingPages} value={agentPage} onChange={setAgentPage} />
              </Group>
            </Paper>
          </Stack>
        ) : null}

        {activeSection === "models" ? (
          <Paper withBorder p="md">
            <Stack gap="md">
              <Title order={4}>Model Administration</Title>
              <Tabs defaultValue="catalog">
                <Tabs.List>
                  <Tabs.Tab value="catalog">Catalog</Tabs.Tab>
                  <Tabs.Tab value="requests">Requests</Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="catalog" pt="md">
                  <Table withTableBorder highlightOnHover>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Model</Table.Th>
                        <Table.Th>Default</Table.Th>
                        <Table.Th>Action</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {catalogModels.length ? (
                        catalogModels.map((model) => (
                          <Table.Tr key={model.id}>
                            <Table.Td>{model.modelName}</Table.Td>
                            <Table.Td>{model.isDefault ? "Yes" : "No"}</Table.Td>
                            <Table.Td>
                              <Button
                                size="xs"
                                variant="light"
                                loading={updatingDefaultModelName === model.modelName}
                                onClick={() => void toggleDefaultModel(model)}
                              >
                                {model.isDefault ? "Unset Default" : "Set Default"}
                              </Button>
                            </Table.Td>
                          </Table.Tr>
                        ))
                      ) : (
                        <Table.Tr>
                          <Table.Td colSpan={3}>
                            <Text size="sm" c="dimmed">
                              No LiteLLM models found.
                            </Text>
                          </Table.Td>
                        </Table.Tr>
                      )}
                    </Table.Tbody>
                  </Table>
                </Tabs.Panel>

                <Tabs.Panel value="requests" pt="md">
                  <Table withTableBorder highlightOnHover>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Type</Table.Th>
                        <Table.Th>User</Table.Th>
                        <Table.Th>Email</Table.Th>
                        <Table.Th>Project</Table.Th>
                        <Table.Th>Target</Table.Th>
                        <Table.Th>Model</Table.Th>
                        <Table.Th>Status</Table.Th>
                        <Table.Th>Requested</Table.Th>
                        <Table.Th>Action</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {modelRequests.length ? (
                        modelRequests.map((request) => (
                          <Table.Tr key={request.id}>
                            <Table.Td>
                              {request.requestType === "agent_deploy"
                                ? "Agent Deploy"
                                : request.requestType === "mcp_deploy"
                                  ? "MCP Deploy"
                                  : "Personal"}
                            </Table.Td>
                            <Table.Td>{request.userDisplayName}</Table.Td>
                            <Table.Td>{request.userEmail}</Table.Td>
                            <Table.Td>{request.projectName ?? "-"}</Table.Td>
                            <Table.Td>{request.agentName ?? request.mcpName ?? "-"}</Table.Td>
                            <Table.Td>{request.modelName}</Table.Td>
                            <Table.Td>{request.status}</Table.Td>
                            <Table.Td>{new Date(request.createdAt).toLocaleString()}</Table.Td>
                            <Table.Td>
                              <Group gap="xs">
                                <Button
                                  size="xs"
                                  variant="light"
                                  disabled={request.status !== "pending"}
                                  loading={reviewingRequestId === request.id}
                                  onClick={() => void reviewModelRequest(request.id, "approve")}
                                >
                                  Approve
                                </Button>
                                <Button
                                  size="xs"
                                  color="red"
                                  variant="light"
                                  disabled={request.status !== "pending"}
                                  loading={reviewingRequestId === request.id}
                                  onClick={() => void reviewModelRequest(request.id, "reject")}
                                >
                                  Reject
                                </Button>
                              </Group>
                            </Table.Td>
                          </Table.Tr>
                        ))
                      ) : (
                        <Table.Tr>
                          <Table.Td colSpan={9}>
                            <Text size="sm" c="dimmed">
                              No model access requests yet.
                            </Text>
                          </Table.Td>
                        </Table.Tr>
                      )}
                    </Table.Tbody>
                  </Table>
                </Tabs.Panel>
              </Tabs>
            </Stack>
          </Paper>
        ) : null}

        {activeSection === "gitlab" ? (
          <Stack gap="md">
            <Paper withBorder p="md">
              <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                <TextInput
                  label="Search"
                  placeholder="Project, group, or repo"
                  value={gitlabSearch}
                  onChange={(event) => setGitlabSearch(event.currentTarget.value)}
                />
              </SimpleGrid>
            </Paper>

            <Paper withBorder p="md">
              <Title order={4}>GitLab Groups</Title>
              <ScrollArea mt="sm">
                <Table withTableBorder highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Project</Table.Th>
                      <Table.Th>Project ID</Table.Th>
                      <Table.Th>Group Path</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {pagedGitlabGroups.length ? (
                      pagedGitlabGroups.map((group) => (
                        <Table.Tr key={group.id}>
                          <Table.Td>{projectNameById.get(group.projectId) ?? "-"}</Table.Td>
                          <Table.Td>{group.projectId}</Table.Td>
                          <Table.Td>{group.groupPath}</Table.Td>
                        </Table.Tr>
                      ))
                    ) : (
                      <Table.Tr>
                        <Table.Td colSpan={3}>
                          <Text size="sm" c="dimmed">
                            No GitLab groups match the current filters.
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    )}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
              <Group justify="end" mt="md">
                <Pagination total={gitlabGroupPages} value={gitlabGroupPage} onChange={setGitlabGroupPage} />
              </Group>
            </Paper>

            <Paper withBorder p="md">
              <Title order={4}>GitLab Repositories</Title>
              <ScrollArea mt="sm">
                <Table withTableBorder highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Project</Table.Th>
                      <Table.Th>Repo</Table.Th>
                      <Table.Th>Namespace Path</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {pagedGitlabRepos.length ? (
                      pagedGitlabRepos.map((repo) => (
                        <Table.Tr key={repo.id}>
                          <Table.Td>{projectNameById.get(repo.projectId) ?? "-"}</Table.Td>
                          <Table.Td>{repo.repoName}</Table.Td>
                          <Table.Td>{repo.namespacePath}</Table.Td>
                        </Table.Tr>
                      ))
                    ) : (
                      <Table.Tr>
                        <Table.Td colSpan={3}>
                          <Text size="sm" c="dimmed">
                            No GitLab repositories match the current filters.
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    )}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
              <Group justify="end" mt="md">
                <Pagination total={gitlabRepoPages} value={gitlabRepoPage} onChange={setGitlabRepoPage} />
              </Group>
            </Paper>
          </Stack>
        ) : null}

        {activeSection === "audit" ? (
          <Stack gap="md">
            <Paper withBorder p="md">
              <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                <TextInput
                  label="Search"
                  placeholder="Action, target, project, or user"
                  value={auditSearch}
                  onChange={(event) => setAuditSearch(event.currentTarget.value)}
                />
                <Select label="Action" data={auditActionOptions} value={auditActionFilter} onChange={setAuditActionFilter} />
              </SimpleGrid>
            </Paper>

            <Paper withBorder p="md">
              <Title order={4}>Audit Logs</Title>
              <ScrollArea mt="sm">
                <Table withTableBorder highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Time</Table.Th>
                      <Table.Th>User</Table.Th>
                      <Table.Th>Action</Table.Th>
                      <Table.Th>Target</Table.Th>
                      <Table.Th>Project</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {pagedAuditLogs.length ? (
                      pagedAuditLogs.map((log) => (
                        <Table.Tr key={log.id}>
                          <Table.Td>{new Date(log.createdAt).toLocaleString()}</Table.Td>
                          <Table.Td>{log.userEmail ?? "-"}</Table.Td>
                          <Table.Td>{log.actionKey}</Table.Td>
                          <Table.Td>{log.targetType ? `${log.targetType}${log.targetId ? `:${log.targetId}` : ""}` : "-"}</Table.Td>
                          <Table.Td>{log.projectId ?? "-"}</Table.Td>
                        </Table.Tr>
                      ))
                    ) : (
                      <Table.Tr>
                        <Table.Td colSpan={4}>
                          <Text size="sm" c="dimmed">
                            No audit logs match the current filters.
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    )}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
              <Group justify="end" mt="md">
                <Pagination total={auditPages} value={auditPage} onChange={setAuditPage} />
              </Group>
            </Paper>
          </Stack>
        ) : null}

        {activeSection === "access" ? (
          <Stack gap="md">
            <Paper withBorder p="md">
              <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
                <TextInput
                  label="Search"
                  placeholder="User, IP, event, provider, or detail"
                  value={accessSearch}
                  onChange={(event) => setAccessSearch(event.currentTarget.value)}
                />
                <Select label="Event" data={accessEventOptions} value={accessEventFilter} onChange={setAccessEventFilter} />
                <Select label="Status" data={accessStatusOptions} value={accessStatusFilter} onChange={setAccessStatusFilter} />
              </SimpleGrid>
            </Paper>

            <Paper withBorder p="md">
              <ScrollArea mt="sm">
                <Table withTableBorder highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Time</Table.Th>
                      <Table.Th>User</Table.Th>
                      <Table.Th>Client IP</Table.Th>
                      <Table.Th>Event</Table.Th>
                      <Table.Th>Provider</Table.Th>
                      <Table.Th>Status</Table.Th>
                      <Table.Th>Detail</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {pagedAccessLogs.length ? (
                      pagedAccessLogs.map((log) => (
                        <Table.Tr key={log.id}>
                          <Table.Td>{new Date(log.createdAt).toLocaleString()}</Table.Td>
                          <Table.Td>{log.userEmail ?? "-"}</Table.Td>
                          <Table.Td>{log.clientIp ?? "-"}</Table.Td>
                          <Table.Td>{log.eventType}</Table.Td>
                          <Table.Td>{log.authProvider ?? "-"}</Table.Td>
                          <Table.Td>{log.status}</Table.Td>
                          <Table.Td>{log.detail ?? "-"}</Table.Td>
                        </Table.Tr>
                      ))
                    ) : (
                      <Table.Tr>
                        <Table.Td colSpan={7}>
                          <Text size="sm" c="dimmed">
                            No access logs match the current filters.
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    )}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
              <Group justify="end" mt="md">
                <Pagination total={accessPages} value={accessPage} onChange={setAccessPage} />
              </Group>
            </Paper>
          </Stack>
        ) : null}
      </Stack>

      <Drawer opened={detailProject !== null} onClose={() => setDetailProject(null)} title="Project Detail" position="right">
        {detailProject ? (
          <Stack>
            <Text fw={700}>{detailProject.name}</Text>
            <Text size="sm">{detailProject.description || "No description"}</Text>
            <Text size="sm">ID: {detailProject.id}</Text>
            <Text size="sm">Created: {new Date(detailProject.createdAt).toLocaleString()}</Text>
            <Group mt="sm">
              <Button size="xs" variant="light" onClick={() => setGitlabOpen(true)}>
                New GitLab Repo
              </Button>
              <Button size="xs" variant="light" onClick={() => setVectorOpen(true)}>
                Issue VectorDB Key
              </Button>
            </Group>
          </Stack>
        ) : null}
      </Drawer>

      <Drawer opened={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite User" position="right">
        <Stack>
          <TextInput label="Email" value={inviteEmail} onChange={(event) => setInviteEmail(event.currentTarget.value)} />
          <TextInput
            label="Display Name"
            value={inviteDisplayName}
            onChange={(event) => setInviteDisplayName(event.currentTarget.value)}
          />
          <Select
            label="Role"
            data={[
              { value: "user", label: "user" },
              { value: "admin", label: "admin" },
            ]}
            value={inviteRole}
            onChange={setInviteRole}
            allowDeselect={false}
          />
          <Group justify="end">
            <Button variant="default" onClick={() => setInviteOpen(false)}>
              Close
            </Button>
            <Button loading={creatingInvite} onClick={createInvitation}>
              Create Invite
            </Button>
          </Group>
        </Stack>
      </Drawer>

      <Drawer opened={gitlabOpen} onClose={() => setGitlabOpen(false)} title="Create GitLab Repo" position="right">
        <Stack>
          <TextInput
            label="Repo Name"
            value={gitlabRepoName}
            onChange={(event) => setGitlabRepoName(event.currentTarget.value)}
            error={gitlabError}
            placeholder="my-repo"
          />
          <Group justify="end">
            <Button variant="default" onClick={() => setGitlabOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createGitlabRepo}>Create</Button>
          </Group>
        </Stack>
      </Drawer>

      <Drawer opened={vectorOpen} onClose={() => setVectorOpen(false)} title="Issue VectorDB Key" position="right">
        <Stack>
          <TextInput
            label="Key Alias"
            value={vectorAlias}
            onChange={(event) => setVectorAlias(event.currentTarget.value)}
            error={vectorError}
            placeholder="project-key"
          />
          <Group justify="end">
            <Button variant="default" onClick={() => setVectorOpen(false)}>
              Cancel
            </Button>
            <Button onClick={issueVectorKey}>Issue</Button>
          </Group>
        </Stack>
      </Drawer>
    </AdminFrame>
  );
}
