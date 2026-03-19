"use client";

import {
  Badge,
  Button,
  Drawer,
  Group,
  LoadingOverlay,
  NumberInput,
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
import { getAdminLoginPath, getPortalOrigin } from "../src/lib/auth-routing";
import { AdminSection, adminNavigation } from "../src/lib/admin-navigation";

type UserRow = {
  id: string;
  email: string;
  displayName: string;
  globalRole: string;
  approvalStatus: string;
  createdAt: string;
  currentMonthSpendUsd: number;
  currentMonthBudgetUsd: number | null;
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
  deletedYn: string;
  status: string;
  approvalStatus: string;
  requestedByUserId: string | null;
  requestedByUserEmail: string | null;
  requestedByDisplayName: string | null;
  repoCount: number;
  agentCount: number;
  mcpCount: number;
  runningWorkspaceCount: number;
  memberCount: number;
};

type ProjectMember = {
  id: string;
  userId: string;
  role: string;
  email: string | null;
  displayName: string | null;
  globalRole: string | null;
};

type PortalUser = {
  id: string;
  email: string;
  displayName: string;
};

type ProjectOverview = {
  project: ProjectRow;
  members: ProjectMember[];
  resourceLimit?: {
    cpu: number;
    memoryGi: number;
  } | null;
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

type ManagedNodeGroupRow = {
  nodeGroupName: string;
  status: string;
  desiredSize: number;
  minSize: number;
  maxSize: number;
  diskSize: number | null;
  capacityType: string | null;
  amiType: string | null;
  instanceTypes: string[];
  labels: Record<string, string>;
  taints: Array<{ key: string; value: string; effect: string }>;
  matchingNodeCount: number;
  matchingNodeNames: string[];
  createdAt: string | null;
};

type ManagedNodeGroupOverview = {
  configured: boolean;
  poolType: "workspace" | "serving";
  clusterName: string | null;
  region: string;
  nodeRoleArnConfigured: boolean;
  subnetCount: number;
  scheduling: {
    selector: Record<string, string>;
    tolerations: Array<{ key?: string; operator?: string; value?: string; effect?: string }>;
  };
  defaults: {
    instanceTypes: string[];
    minSize: number;
    maxSize: number;
    desiredSize: number;
    diskSize: number;
    capacityType: string | null;
    amiType: string | null;
  };
  nodeGroups: ManagedNodeGroupRow[];
  message: string | null;
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
  approvals: { title: "Approvals", description: "Review sign-up, project, and model access requests in one place." },
  users: { title: "Users", description: "Manage approved users and review sign-up requests." },
  projects: { title: "Projects", description: "Review active projects and approve creation requests." },
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
  if (pathname === "/approvals") {
    return "approvals";
  }
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
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [adminAgents, setAdminAgents] = useState<AgentAdminRow[]>([]);
  const [adminMcps, setAdminMcps] = useState<McpAdminRow[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
  const [accessLogs, setAccessLogs] = useState<AccessLogRow[]>([]);
  const [workspaceResourceOverview, setWorkspaceResourceOverview] = useState<WorkspaceResourceOverview | null>(null);
  const [agentResourceOverview, setAgentResourceOverview] = useState<AgentResourceOverview | null>(null);
  const [mcpResourceOverview, setMcpResourceOverview] = useState<McpResourceOverview | null>(null);
  const [workspaceNodeGroupOverview, setWorkspaceNodeGroupOverview] = useState<ManagedNodeGroupOverview | null>(null);
  const [servingNodeGroupOverview, setServingNodeGroupOverview] = useState<ManagedNodeGroupOverview | null>(null);
  const [resourceTab, setResourceTab] = useState<string | null>("workspace");
  const [workspaceResourceTab, setWorkspaceResourceTab] = useState<string | null>("deployments");
  const [servingResourceTab, setServingResourceTab] = useState<string | null>("deployments");
  const [groups, setGroups] = useState<GitlabGroup[]>([]);
  const [repos, setRepos] = useState<GitlabRepo[]>([]);
  const [catalogModels, setCatalogModels] = useState<CatalogModel[]>([]);
  const [modelRequests, setModelRequests] = useState<ModelAccessRequest[]>([]);
  const [activePage, setActivePage] = useState(1);
  const [userTab, setUserTab] = useState<string | null>("current");
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
  const [projectSearch, setProjectSearch] = useState("");
  const [projectStatusFilter, setProjectStatusFilter] = useState<string | null>("all");
  const [agentPage, setAgentPage] = useState(1);
  const [mcpPage, setMcpPage] = useState(1);
  const [auditActionFilter, setAuditActionFilter] = useState<string | null>("all");
  const [accessEventFilter, setAccessEventFilter] = useState<string | null>("all");
  const [accessStatusFilter, setAccessStatusFilter] = useState<string | null>("all");
  const [detailProject, setDetailProject] = useState<ProjectRow | null>(null);
  const [detailProjectOverview, setDetailProjectOverview] = useState<ProjectOverview | null>(null);
  const [detailProjectAvailableUsers, setDetailProjectAvailableUsers] = useState<PortalUser[]>([]);
  const [detailProjectRepos, setDetailProjectRepos] = useState<GitlabRepo[]>([]);
  const [loadingProjectDetail, setLoadingProjectDetail] = useState(false);
  const [updatingProjectMembers, setUpdatingProjectMembers] = useState(false);
  const [selectedProjectMemberId, setSelectedProjectMemberId] = useState<string | null>(null);
  const [selectedProjectMemberRole, setSelectedProjectMemberRole] = useState<string | null>("member");
  const [pendingRoleChanges, setPendingRoleChanges] = useState<Record<string, "admin" | "user">>({});
  const [savingRoleChanges, setSavingRoleChanges] = useState(false);
  const [reviewingUserId, setReviewingUserId] = useState<string | null>(null);
  const [reviewingProjectId, setReviewingProjectId] = useState<string | null>(null);
  const [stoppingWorkspaceResourceId, setStoppingWorkspaceResourceId] = useState<string | null>(null);
  const [stoppingServingResourceKey, setStoppingServingResourceKey] = useState<string | null>(null);
  const [workspaceNodeGroupName, setWorkspaceNodeGroupName] = useState("");
  const [workspaceNodeInstanceTypes, setWorkspaceNodeInstanceTypes] = useState("");
  const [workspaceNodeMinSize, setWorkspaceNodeMinSize] = useState<number | string>(1);
  const [workspaceNodeMaxSize, setWorkspaceNodeMaxSize] = useState<number | string>(3);
  const [workspaceNodeDesiredSize, setWorkspaceNodeDesiredSize] = useState<number | string>(1);
  const [workspaceNodeDiskSize, setWorkspaceNodeDiskSize] = useState<number | string>(50);
  const [workspaceNodeCapacityType, setWorkspaceNodeCapacityType] = useState<string | null>("ON_DEMAND");
  const [workspaceNodeAmiType, setWorkspaceNodeAmiType] = useState("");
  const [creatingWorkspaceNodeGroup, setCreatingWorkspaceNodeGroup] = useState(false);
  const [deletingWorkspaceNodeGroupName, setDeletingWorkspaceNodeGroupName] = useState<string | null>(null);
  const [servingNodeGroupName, setServingNodeGroupName] = useState("");
  const [servingNodeInstanceTypes, setServingNodeInstanceTypes] = useState("");
  const [servingNodeMinSize, setServingNodeMinSize] = useState<number | string>(1);
  const [servingNodeMaxSize, setServingNodeMaxSize] = useState<number | string>(3);
  const [servingNodeDesiredSize, setServingNodeDesiredSize] = useState<number | string>(1);
  const [servingNodeDiskSize, setServingNodeDiskSize] = useState<number | string>(50);
  const [servingNodeCapacityType, setServingNodeCapacityType] = useState<string | null>("ON_DEMAND");
  const [servingNodeAmiType, setServingNodeAmiType] = useState("");
  const [creatingServingNodeGroup, setCreatingServingNodeGroup] = useState(false);
  const [deletingServingNodeGroupName, setDeletingServingNodeGroupName] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteDisplayName, setInviteDisplayName] = useState("");
  const [inviteRole, setInviteRole] = useState<string | null>("user");
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [deletingInvitationId, setDeletingInvitationId] = useState<string | null>(null);
  const [gitlabOpen, setGitlabOpen] = useState(false);
  const [gitlabRepoName, setGitlabRepoName] = useState("");
  const [gitlabError, setGitlabError] = useState<string | null>(null);
  const [updatingDefaultModelName, setUpdatingDefaultModelName] = useState<string | null>(null);
  const [reviewingRequestId, setReviewingRequestId] = useState<string | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const verifyAdmin = async () => {
    const me = await apiFetch<{ role: string }>("auth/me");
    if (me.role !== "admin") {
      window.location.assign(getPortalOrigin());
      throw new Error("Admin role required");
    }
  };

  const loadUsersData = async () => {
    setUsers(await apiFetch<UserRow[]>("admin/users"));
  };

  const loadProjectsData = async () => {
    const loadedProjects = await apiFetch<ProjectRow[]>("admin/projects");
    setProjects(loadedProjects);
    return loadedProjects;
  };

  const loadDetailProjectData = async (projectId: string) => {
    setLoadingProjectDetail(true);
    try {
      const [overview, availableUsers, projectRepos] = await Promise.all([
        apiFetch<ProjectOverview>(`admin/projects/${projectId}/overview`),
        apiFetch<PortalUser[]>(`admin/projects/${projectId}/available-users`),
        apiFetch<GitlabRepo[]>(`admin/projects/${projectId}/gitlab/repos`),
      ]);
      setDetailProjectOverview(overview);
      setDetailProjectAvailableUsers(availableUsers);
      setDetailProjectRepos(projectRepos);
      setDetailProject((current) => (current && current.id === projectId ? { ...current, ...overview.project } : current));
    } catch {
      notifications.show({ title: "Failed", message: "Failed to load project details.", color: "red" });
    } finally {
      setLoadingProjectDetail(false);
    }
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
    const [workspaceResult, agentResult, mcpResult, workspaceNodeGroupsResult, servingNodeGroupsResult] = await Promise.all([
      apiFetch<WorkspaceResourceOverview>("admin/resources/workspaces"),
      apiFetch<AgentResourceOverview>("admin/resources/agents"),
      apiFetch<McpResourceOverview>("admin/resources/mcps"),
      apiFetch<ManagedNodeGroupOverview>("admin/resources/nodegroups/workspace"),
      apiFetch<ManagedNodeGroupOverview>("admin/resources/nodegroups/serving"),
    ]);
    setWorkspaceResourceOverview(workspaceResult);
    setAgentResourceOverview(agentResult);
    setMcpResourceOverview(mcpResult);
    setWorkspaceNodeGroupOverview(workspaceNodeGroupsResult);
    setServingNodeGroupOverview(servingNodeGroupsResult);
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
      case "approvals":
        await Promise.all([loadUsersData(), loadProjectsData(), loadModelData()]);
        break;
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
          router.replace(getAdminLoginPath(pathname));
          return;
        }
        if (error instanceof ApiError && error.status === 403) {
          window.location.assign(getPortalOrigin());
          return;
        }
        notifications.show({
          title: "Load failed",
          message: "관리자 데이터를 불러오지 못했습니다.",
          color: "red",
        });
        router.replace(getAdminLoginPath("/"));
      } finally {
        setAuthChecking(false);
      }
    };

    void load();
  }, [pathname, router]);

  useEffect(() => {
    setPendingRoleChanges({});
  }, [users]);

  useEffect(() => {
    if (!workspaceNodeGroupOverview) {
      return;
    }
    setWorkspaceNodeInstanceTypes(workspaceNodeGroupOverview.defaults.instanceTypes.join(", "));
    setWorkspaceNodeMinSize(workspaceNodeGroupOverview.defaults.minSize);
    setWorkspaceNodeMaxSize(workspaceNodeGroupOverview.defaults.maxSize);
    setWorkspaceNodeDesiredSize(workspaceNodeGroupOverview.defaults.desiredSize);
    setWorkspaceNodeDiskSize(workspaceNodeGroupOverview.defaults.diskSize);
    setWorkspaceNodeCapacityType(workspaceNodeGroupOverview.defaults.capacityType ?? "ON_DEMAND");
    setWorkspaceNodeAmiType(workspaceNodeGroupOverview.defaults.amiType ?? "");
  }, [workspaceNodeGroupOverview]);

  useEffect(() => {
    if (!servingNodeGroupOverview) {
      return;
    }
    setServingNodeInstanceTypes(servingNodeGroupOverview.defaults.instanceTypes.join(", "));
    setServingNodeMinSize(servingNodeGroupOverview.defaults.minSize);
    setServingNodeMaxSize(servingNodeGroupOverview.defaults.maxSize);
    setServingNodeDesiredSize(servingNodeGroupOverview.defaults.desiredSize);
    setServingNodeDiskSize(servingNodeGroupOverview.defaults.diskSize);
    setServingNodeCapacityType(servingNodeGroupOverview.defaults.capacityType ?? "ON_DEMAND");
    setServingNodeAmiType(servingNodeGroupOverview.defaults.amiType ?? "");
  }, [servingNodeGroupOverview]);

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

  useEffect(() => {
    setActivePage(1);
  }, [projectSearch, projectStatusFilter]);

  useEffect(() => {
    if (!detailProject) {
      setDetailProjectOverview(null);
      setDetailProjectAvailableUsers([]);
      setDetailProjectRepos([]);
      setSelectedProjectMemberId(null);
      setSelectedProjectMemberRole("member");
      return;
    }

    void loadDetailProjectData(detailProject.id);
  }, [detailProject?.id]);

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

  const buildPortalInviteUrl = (token: string) => {
    if (typeof window === "undefined") {
      return `/invite/${token}`;
    }
    const portalOrigin = window.location.origin.replace("://admin.", "://");
    return `${portalOrigin}/invite/${token}`;
  };

  const reviewUser = async (userId: string, action: "approve" | "reject") => {
    setReviewingUserId(userId);
    try {
      await apiFetch(`auth/users/${userId}/${action}`, { method: "POST" });
      await loadUsersData();
      notifications.show({ title: action === "approve" ? "Approved" : "Rejected", message: `User ${action}d.`, color: "teal" });
    } catch {
      notifications.show({ title: "Failed", message: `Failed to ${action} user.`, color: "red" });
    } finally {
      setReviewingUserId(null);
    }
  };

  const reviewProject = async (projectId: string, action: "approve" | "reject") => {
    setReviewingProjectId(projectId);
    try {
      await apiFetch(`projects/${projectId}/${action}`, { method: "POST" });
      await loadProjectsData();
      notifications.show({
        title: action === "approve" ? "Approved" : "Rejected",
        message: `Project request ${action}d.`,
        color: "teal",
      });
    } catch {
      notifications.show({ title: "Failed", message: `Failed to ${action} project request.`, color: "red" });
    } finally {
      setReviewingProjectId(null);
    }
  };

  const deleteProject = async (projectId: string) => {
    setReviewingProjectId(projectId);
    try {
      await apiFetch(`admin/projects/${projectId}`, { method: "DELETE" });
      await loadProjectsData();
      if (detailProject?.id === projectId) {
        await loadDetailProjectData(projectId);
      }
      notifications.show({ title: "Deleted", message: "Project marked as deleted.", color: "teal" });
    } catch {
      notifications.show({ title: "Failed", message: "Failed to delete project.", color: "red" });
    } finally {
      setReviewingProjectId(null);
    }
  };

  const restoreProject = async (projectId: string) => {
    setReviewingProjectId(projectId);
    try {
      await apiFetch(`admin/projects/${projectId}/restore`, { method: "POST" });
      await loadProjectsData();
      if (detailProject?.id === projectId) {
        await loadDetailProjectData(projectId);
      }
      notifications.show({ title: "Restored", message: "Project restored.", color: "teal" });
    } catch {
      notifications.show({ title: "Failed", message: "Failed to restore project.", color: "red" });
    } finally {
      setReviewingProjectId(null);
    }
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

  const saveRoleChanges = async () => {
    const entries = Object.entries(pendingRoleChanges);
    if (!entries.length) {
      return;
    }

    setSavingRoleChanges(true);
    try {
      await Promise.all(entries.map(([userId, role]) => apiFetch(`auth/users/${userId}/role/${role}`, { method: "PATCH" })));
      setUsers((prev) =>
        prev.map((user) => (pendingRoleChanges[user.id] ? { ...user, globalRole: pendingRoleChanges[user.id] } : user)),
      );
      setPendingRoleChanges({});
      notifications.show({ title: "Updated", message: "Role changes saved.", color: "teal" });
    } catch {
      notifications.show({ title: "Failed", message: "Failed to save role changes.", color: "red" });
    } finally {
      setSavingRoleChanges(false);
    }
  };

  const addProjectMember = async () => {
    if (!detailProject || !selectedProjectMemberId || !selectedProjectMemberRole) {
      return;
    }

    setUpdatingProjectMembers(true);
    try {
      await apiFetch(`admin/projects/${detailProject.id}/members`, {
        method: "POST",
        body: JSON.stringify({ userId: selectedProjectMemberId, role: selectedProjectMemberRole }),
      });
      setSelectedProjectMemberId(null);
      setSelectedProjectMemberRole("member");
      await loadDetailProjectData(detailProject.id);
      notifications.show({ title: "Updated", message: "Project member added.", color: "teal" });
    } catch {
      notifications.show({ title: "Failed", message: "Failed to add project member.", color: "red" });
    } finally {
      setUpdatingProjectMembers(false);
    }
  };

  const updateProjectMemberRole = async (projectId: string, userId: string, role: string) => {
    setUpdatingProjectMembers(true);
    try {
      await apiFetch(`admin/projects/${projectId}/members`, {
        method: "POST",
        body: JSON.stringify({ userId, role }),
      });
      await loadDetailProjectData(projectId);
      notifications.show({ title: "Updated", message: "Project member role updated.", color: "teal" });
    } catch {
      notifications.show({ title: "Failed", message: "Failed to update project member role.", color: "red" });
    } finally {
      setUpdatingProjectMembers(false);
    }
  };

  const removeProjectMember = async (projectId: string, userId: string) => {
    setUpdatingProjectMembers(true);
    try {
      await apiFetch(`admin/projects/${projectId}/members/${userId}`, { method: "DELETE" });
      await loadDetailProjectData(projectId);
      notifications.show({ title: "Updated", message: "Project member removed.", color: "teal" });
    } catch {
      notifications.show({ title: "Failed", message: "Failed to remove project member.", color: "red" });
    } finally {
      setUpdatingProjectMembers(false);
    }
  };

  const stopWorkspaceResource = async (workspaceId: string) => {
    setStoppingWorkspaceResourceId(workspaceId);
    try {
      await apiFetch(`admin/resources/workspaces/${workspaceId}/stop`, { method: "POST" });
      await loadResourceData();
      notifications.show({ title: "Stopped", message: "Workspace session stopped.", color: "teal" });
    } catch {
      notifications.show({ title: "Failed", message: "Failed to stop workspace session.", color: "red" });
    } finally {
      setStoppingWorkspaceResourceId(null);
    }
  };

  const stopServingResource = async (type: "Agent" | "MCP", deploymentId: string) => {
    const key = `${type}-${deploymentId}`;
    setStoppingServingResourceKey(key);
    try {
      const resourcePath = type === "Agent" ? "agents" : "mcps";
      await apiFetch(`admin/resources/${resourcePath}/${deploymentId}/stop`, { method: "POST" });
      await loadResourceData();
      notifications.show({ title: "Stopped", message: `${type} deployment stopped.`, color: "teal" });
    } catch {
      notifications.show({ title: "Failed", message: `Failed to stop ${type} deployment.`, color: "red" });
    } finally {
      setStoppingServingResourceKey(null);
    }
  };

  const parseInstanceTypes = (value: string) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

  const createManagedNodeGroup = async (poolType: "workspace" | "serving") => {
    const isWorkspace = poolType === "workspace";
    const nodeGroupName = (isWorkspace ? workspaceNodeGroupName : servingNodeGroupName).trim();
    if (!nodeGroupName) {
      notifications.show({ title: "Required", message: "Enter a nodegroup name.", color: "yellow" });
      return;
    }

    const payload = {
      nodeGroupName,
      instanceTypes: parseInstanceTypes(isWorkspace ? workspaceNodeInstanceTypes : servingNodeInstanceTypes),
      minSize: Number(isWorkspace ? workspaceNodeMinSize : servingNodeMinSize),
      maxSize: Number(isWorkspace ? workspaceNodeMaxSize : servingNodeMaxSize),
      desiredSize: Number(isWorkspace ? workspaceNodeDesiredSize : servingNodeDesiredSize),
      diskSize: Number(isWorkspace ? workspaceNodeDiskSize : servingNodeDiskSize),
      capacityType: (isWorkspace ? workspaceNodeCapacityType : servingNodeCapacityType) ?? undefined,
      amiType: (isWorkspace ? workspaceNodeAmiType : servingNodeAmiType).trim() || undefined,
    };

    if (isWorkspace) {
      setCreatingWorkspaceNodeGroup(true);
    } else {
      setCreatingServingNodeGroup(true);
    }

    try {
      const result = await apiFetch<ManagedNodeGroupOverview>(`admin/resources/nodegroups/${poolType}`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (isWorkspace) {
        setWorkspaceNodeGroupOverview(result);
        setWorkspaceNodeGroupName("");
      } else {
        setServingNodeGroupOverview(result);
        setServingNodeGroupName("");
      }
      notifications.show({ title: "Requested", message: `${poolType === "workspace" ? "Workspace" : "Serving"} nodegroup creation requested.`, color: "teal" });
    } catch {
      notifications.show({ title: "Failed", message: `Failed to create ${poolType} nodegroup.`, color: "red" });
    } finally {
      if (isWorkspace) {
        setCreatingWorkspaceNodeGroup(false);
      } else {
        setCreatingServingNodeGroup(false);
      }
    }
  };

  const deleteManagedNodeGroup = async (poolType: "workspace" | "serving", nodeGroupName: string) => {
    if (poolType === "workspace") {
      setDeletingWorkspaceNodeGroupName(nodeGroupName);
    } else {
      setDeletingServingNodeGroupName(nodeGroupName);
    }

    try {
      const result = await apiFetch<ManagedNodeGroupOverview>(`admin/resources/nodegroups/${poolType}/${encodeURIComponent(nodeGroupName)}`, {
        method: "DELETE",
      });
      if (poolType === "workspace") {
        setWorkspaceNodeGroupOverview(result);
      } else {
        setServingNodeGroupOverview(result);
      }
      notifications.show({ title: "Requested", message: `${nodeGroupName} deletion requested.`, color: "teal" });
    } catch {
      notifications.show({ title: "Failed", message: `Failed to delete ${nodeGroupName}.`, color: "red" });
    } finally {
      if (poolType === "workspace") {
        setDeletingWorkspaceNodeGroupName(null);
      } else {
        setDeletingServingNodeGroupName(null);
      }
    }
  };

  const formatBudgetUsage = (spendUsd: number, budgetUsd: number | null) =>
    `${Math.max(spendUsd, 0).toFixed(1)}/${budgetUsd !== null ? budgetUsd.toFixed(1) : "-"}`;

  const filteredProjects = useMemo(() => {
    const query = projectSearch.trim().toLowerCase();
    return projects.filter((project) => {
      const matchesStatus = projectStatusFilter === "all" || project.status === projectStatusFilter;
      const matchesQuery =
        !query ||
        [
          project.name,
          project.description,
          project.status,
          project.requestedByDisplayName ?? "",
          project.requestedByUserEmail ?? "",
        ].some((value) => value.toLowerCase().includes(query));
      return matchesStatus && matchesQuery;
    });
  }, [projectSearch, projectStatusFilter, projects]);
  const projectPages = Math.max(1, Math.ceil(filteredProjects.length / PAGE_SIZE));
  const pagedProjects = useMemo(() => {
    const start = (activePage - 1) * PAGE_SIZE;
    return filteredProjects.slice(start, start + PAGE_SIZE);
  }, [activePage, filteredProjects]);
  const pendingUsers = useMemo(() => users.filter((user) => user.approvalStatus !== "approved"), [users]);
  const pendingProjects = useMemo(
    () => projects.filter((project) => project.deletedYn !== "Y" && project.approvalStatus !== "approved"),
    [projects],
  );
  const pendingModelRequests = useMemo(() => modelRequests.filter((request) => request.status === "pending"), [modelRequests]);
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
        type: "Agent" as const,
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
        type: "MCP" as const,
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
  const detailProjectAgents = useMemo(
    () => (detailProject ? adminAgents.filter((agent) => agent.projectId === detailProject.id) : []),
    [adminAgents, detailProject],
  );
  const detailProjectMcps = useMemo(
    () => (detailProject ? adminMcps.filter((mcp) => mcp.projectId === detailProject.id) : []),
    [adminMcps, detailProject],
  );
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
        {activeSection === "approvals" ? (
          <Stack gap="md">
            <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
              <Paper withBorder p="md" radius="md">
                <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
                  Signup Requests
                </Text>
                <Text mt="sm" fw={700} size="xl">
                  {pendingUsers.length}
                </Text>
              </Paper>
              <Paper withBorder p="md" radius="md">
                <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
                  Project Requests
                </Text>
                <Text mt="sm" fw={700} size="xl">
                  {pendingProjects.length}
                </Text>
              </Paper>
              <Paper withBorder p="md" radius="md">
                <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
                  Model Requests
                </Text>
                <Text mt="sm" fw={700} size="xl">
                  {pendingModelRequests.length}
                </Text>
              </Paper>
            </SimpleGrid>

            <Tabs defaultValue="signup">
              <Tabs.List>
                <Tabs.Tab value="signup">Signup</Tabs.Tab>
                <Tabs.Tab value="projects">Projects</Tabs.Tab>
                <Tabs.Tab value="models">Models</Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="signup" pt="md">
                <Paper withBorder p="md">
                  <Title order={4}>Pending Signup Requests</Title>
                  <ScrollArea mt="sm">
                    <Table withTableBorder highlightOnHover>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Email</Table.Th>
                          <Table.Th>Name</Table.Th>
                          <Table.Th>Status</Table.Th>
                          <Table.Th>Role</Table.Th>
                          <Table.Th>Created</Table.Th>
                          <Table.Th>Actions</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {pendingUsers.length ? (
                          pendingUsers.map((user) => (
                            <Table.Tr key={user.id}>
                              <Table.Td>{user.email}</Table.Td>
                              <Table.Td>{user.displayName}</Table.Td>
                              <Table.Td>
                                <Badge variant="light" color={user.approvalStatus === "pending" ? "orange" : "red"}>
                                  {user.approvalStatus}
                                </Badge>
                              </Table.Td>
                              <Table.Td>{user.globalRole}</Table.Td>
                              <Table.Td>{new Date(user.createdAt).toLocaleString()}</Table.Td>
                              <Table.Td>
                                <Group gap="xs">
                                  <Button size="xs" loading={reviewingUserId === user.id} onClick={() => void reviewUser(user.id, "approve")}>
                                    Approve
                                  </Button>
                                  <Button
                                    size="xs"
                                    color="red"
                                    variant="light"
                                    loading={reviewingUserId === user.id}
                                    onClick={() => void reviewUser(user.id, "reject")}
                                  >
                                    Reject
                                  </Button>
                                </Group>
                              </Table.Td>
                            </Table.Tr>
                          ))
                        ) : (
                          <Table.Tr>
                            <Table.Td colSpan={6}>
                              <Text size="sm" c="dimmed">
                                No signup requests.
                              </Text>
                            </Table.Td>
                          </Table.Tr>
                        )}
                      </Table.Tbody>
                    </Table>
                  </ScrollArea>
                </Paper>
              </Tabs.Panel>

              <Tabs.Panel value="projects" pt="md">
                <Paper withBorder p="md">
                  <Title order={4}>Pending Project Requests</Title>
                  <ScrollArea mt="sm">
                    <Table withTableBorder highlightOnHover>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Name</Table.Th>
                          <Table.Th>Description</Table.Th>
                          <Table.Th>Requester</Table.Th>
                          <Table.Th>Created</Table.Th>
                          <Table.Th>Actions</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {pendingProjects.length ? (
                          pendingProjects.map((project) => (
                            <Table.Tr key={project.id}>
                              <Table.Td>{project.name}</Table.Td>
                              <Table.Td>{project.description || "-"}</Table.Td>
                              <Table.Td>{project.requestedByDisplayName ?? project.requestedByUserEmail ?? "-"}</Table.Td>
                              <Table.Td>{new Date(project.createdAt).toLocaleString()}</Table.Td>
                              <Table.Td>
                                <Group gap="xs">
                                  <Button size="xs" loading={reviewingProjectId === project.id} onClick={() => void reviewProject(project.id, "approve")}>
                                    Approve
                                  </Button>
                                  <Button
                                    size="xs"
                                    color="red"
                                    variant="light"
                                    loading={reviewingProjectId === project.id}
                                    onClick={() => void reviewProject(project.id, "reject")}
                                  >
                                    Reject
                                  </Button>
                                </Group>
                              </Table.Td>
                            </Table.Tr>
                          ))
                        ) : (
                          <Table.Tr>
                            <Table.Td colSpan={5}>
                              <Text size="sm" c="dimmed">
                                No project requests.
                              </Text>
                            </Table.Td>
                          </Table.Tr>
                        )}
                      </Table.Tbody>
                    </Table>
                  </ScrollArea>
                </Paper>
              </Tabs.Panel>

              <Tabs.Panel value="models" pt="md">
                <Paper withBorder p="md">
                  <Title order={4}>Pending Model Requests</Title>
                  <ScrollArea mt="sm">
                    <Table withTableBorder highlightOnHover>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Type</Table.Th>
                          <Table.Th>User</Table.Th>
                          <Table.Th>Project</Table.Th>
                          <Table.Th>Target</Table.Th>
                          <Table.Th>Model</Table.Th>
                          <Table.Th>Requested</Table.Th>
                          <Table.Th>Actions</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {pendingModelRequests.length ? (
                          pendingModelRequests.map((request) => (
                            <Table.Tr key={request.id}>
                              <Table.Td>
                                {request.requestType === "agent_deploy"
                                  ? "Agent Deploy"
                                  : request.requestType === "mcp_deploy"
                                    ? "MCP Deploy"
                                    : "Personal"}
                              </Table.Td>
                              <Table.Td>{request.userDisplayName}</Table.Td>
                              <Table.Td>{request.projectName ?? "-"}</Table.Td>
                              <Table.Td>{request.agentName ?? request.mcpName ?? "-"}</Table.Td>
                              <Table.Td>{request.modelName}</Table.Td>
                              <Table.Td>{new Date(request.createdAt).toLocaleString()}</Table.Td>
                              <Table.Td>
                                <Group gap="xs">
                                  <Button
                                    size="xs"
                                    variant="light"
                                    loading={reviewingRequestId === request.id}
                                    onClick={() => void reviewModelRequest(request.id, "approve")}
                                  >
                                    Approve
                                  </Button>
                                  <Button
                                    size="xs"
                                    color="red"
                                    variant="light"
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
                            <Table.Td colSpan={7}>
                              <Text size="sm" c="dimmed">
                                No model requests.
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
        ) : null}

        {activeSection === "users" ? (
          <Paper withBorder p="md">
            <Group justify="space-between" align="center">
              <Title order={4}>Users</Title>
              <Group>
                {Object.keys(pendingRoleChanges).length ? (
                  <Button onClick={() => void saveRoleChanges()} loading={savingRoleChanges}>
                    Save
                  </Button>
                ) : null}
              </Group>
            </Group>
            <ScrollArea mt="md">
              <Table withTableBorder highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Email</Table.Th>
                    <Table.Th>Name</Table.Th>
                    <Table.Th>Role</Table.Th>
                    <Table.Th>Created</Table.Th>
                    <Table.Th>Monthly Usage / Budget</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {users
                    .filter((user) => user.approvalStatus === "approved")
                    .map((user) => (
                      <Table.Tr
                        key={user.id}
                        style={
                          pendingRoleChanges[user.id]
                            ? { backgroundColor: "rgba(250, 176, 5, 0.12)" }
                            : undefined
                        }
                      >
                        <Table.Td>{user.email}</Table.Td>
                        <Table.Td>{user.displayName}</Table.Td>
                        <Table.Td>
                          <Select
                            data={[
                              { value: "admin", label: "Admin" },
                              { value: "user", label: "User" },
                            ]}
                            value={pendingRoleChanges[user.id] ?? user.globalRole}
                            onChange={(value) => {
                              if (!value) {
                                return;
                              }
                              setPendingRoleChanges((prev) => {
                                if (value === user.globalRole) {
                                  const next = { ...prev };
                                  delete next[user.id];
                                  return next;
                                }
                                return { ...prev, [user.id]: value as "admin" | "user" };
                              });
                            }}
                            disabled={savingRoleChanges}
                            style={{ minWidth: 140 }}
                          />
                        </Table.Td>
                        <Table.Td>{new Date(user.createdAt).toLocaleString()}</Table.Td>
                        <Table.Td>{formatBudgetUsage(user.currentMonthSpendUsd, user.currentMonthBudgetUsd)}</Table.Td>
                      </Table.Tr>
                    ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          </Paper>
        ) : null}

        {activeSection === "projects" ? (
          <Stack gap="md">
            <Paper withBorder p="md">
              <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                <TextInput
                  label="Search"
                  placeholder="Project, description, status, or requester"
                  value={projectSearch}
                  onChange={(event) => setProjectSearch(event.currentTarget.value)}
                />
                <Select
                  label="Status"
                  data={[
                    { value: "all", label: "All statuses" },
                    { value: "approved", label: "Approved" },
                    { value: "pending", label: "Pending" },
                    { value: "rejected", label: "Rejected" },
                    { value: "deleted", label: "Deleted" },
                  ]}
                  value={projectStatusFilter}
                  onChange={setProjectStatusFilter}
                />
              </SimpleGrid>
            </Paper>
            <Paper withBorder p="md">
              <ScrollArea>
              <Table withTableBorder highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Name</Table.Th>
                    <Table.Th>Repos</Table.Th>
                    <Table.Th>Agents</Table.Th>
                    <Table.Th>MCPs</Table.Th>
                    <Table.Th>IDE</Table.Th>
                    <Table.Th>Members</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Created</Table.Th>
                    <Table.Th>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {pagedProjects.length ? (
                    pagedProjects.map((project) => (
                      <Table.Tr key={project.id}>
                        <Table.Td>
                          <Button variant="subtle" px={0} onClick={() => setDetailProject(project)}>
                            {project.name}
                          </Button>
                        </Table.Td>
                        <Table.Td>{project.repoCount}</Table.Td>
                        <Table.Td>{project.agentCount}</Table.Td>
                        <Table.Td>{project.mcpCount}</Table.Td>
                        <Table.Td>{project.runningWorkspaceCount}</Table.Td>
                        <Table.Td>{project.memberCount}</Table.Td>
                        <Table.Td>
                          <Badge
                            variant="light"
                            color={
                              project.status === "approved"
                                ? "teal"
                                : project.status === "pending"
                                  ? "orange"
                                  : project.status === "deleted"
                                    ? "gray"
                                    : "red"
                            }
                          >
                            {project.status}
                          </Badge>
                        </Table.Td>
                        <Table.Td>{new Date(project.createdAt).toLocaleString()}</Table.Td>
                        <Table.Td>
                          <Group gap="xs">
                            {project.deletedYn === "Y" ? (
                              <Button
                                size="xs"
                                variant="light"
                                loading={reviewingProjectId === project.id}
                                onClick={() => void restoreProject(project.id)}
                              >
                                Restore
                              </Button>
                            ) : project.approvalStatus !== "approved" ? (
                              <>
                                <Button
                                  size="xs"
                                  loading={reviewingProjectId === project.id}
                                  onClick={() => void reviewProject(project.id, "approve")}
                                >
                                  Approve
                                </Button>
                                <Button
                                  size="xs"
                                  color="red"
                                  variant="light"
                                  loading={reviewingProjectId === project.id}
                                  onClick={() => void reviewProject(project.id, "reject")}
                                >
                                  Reject
                                </Button>
                              </>
                            ) : (
                              <Button
                                size="xs"
                                color="red"
                                variant="light"
                                loading={reviewingProjectId === project.id}
                                onClick={() => void deleteProject(project.id)}
                              >
                                Delete
                              </Button>
                            )}
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    ))
                  ) : (
                    <Table.Tr>
                      <Table.Td colSpan={9}>
                        <Text size="sm" c="dimmed">
                          No projects found.
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  )}
                </Table.Tbody>
              </Table>
            </ScrollArea>
              <Group justify="end" mt="md">
                <Pagination total={projectPages} value={activePage} onChange={setActivePage} />
              </Group>
            </Paper>
          </Stack>
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
                      <Group justify="space-between" align="center">
                        <div>
                          <Title order={4}>Workspace Managed Nodegroups</Title>
                          <Text size="sm" c="dimmed">
                            Create and delete EKS managed nodegroups that match the workspace scheduling policy.
                          </Text>
                        </div>
                        <Badge variant="light">{workspaceNodeGroupOverview?.nodeGroups.length ?? 0} groups</Badge>
                      </Group>

                      <SimpleGrid cols={{ base: 1, md: 2, xl: 4 }} spacing="md">
                        <Paper withBorder p="md" radius="md">
                          <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
                            Cluster
                          </Text>
                          <Text mt="sm" fw={700}>
                            {workspaceNodeGroupOverview?.clusterName ?? "-"}
                          </Text>
                          <Text size="sm" c="dimmed" mt="xs">
                            {workspaceNodeGroupOverview?.region ?? "-"} / subnets {workspaceNodeGroupOverview?.subnetCount ?? 0}
                          </Text>
                        </Paper>
                        <Paper withBorder p="md" radius="md">
                          <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
                            Selector
                          </Text>
                          <Text mt="sm" fw={700} size="sm" style={{ whiteSpace: "pre-wrap" }}>
                            {JSON.stringify(workspaceNodeGroupOverview?.scheduling.selector ?? {}, null, 2)}
                          </Text>
                        </Paper>
                        <Paper withBorder p="md" radius="md">
                          <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
                            Tolerations
                          </Text>
                          <Text mt="sm" fw={700} size="sm" style={{ whiteSpace: "pre-wrap" }}>
                            {JSON.stringify(workspaceNodeGroupOverview?.scheduling.tolerations ?? [], null, 2)}
                          </Text>
                        </Paper>
                        <Paper withBorder p="md" radius="md">
                          <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
                            AWS Config
                          </Text>
                          <Text mt="sm" fw={700}>
                            {workspaceNodeGroupOverview?.configured ? "Ready" : "Missing"}
                          </Text>
                          <Text size="sm" c="dimmed" mt="xs">
                            {workspaceNodeGroupOverview?.message ?? "AWS credentials and EKS settings are configured."}
                          </Text>
                        </Paper>
                      </SimpleGrid>

                      <SimpleGrid cols={{ base: 1, md: 2, xl: 4 }} spacing="md">
                        <TextInput
                          label="Nodegroup Name"
                          placeholder="workspace-general-a"
                          value={workspaceNodeGroupName}
                          onChange={(event) => setWorkspaceNodeGroupName(event.currentTarget.value)}
                        />
                        <TextInput
                          label="Instance Types"
                          placeholder="t3.large, t3.xlarge"
                          value={workspaceNodeInstanceTypes}
                          onChange={(event) => setWorkspaceNodeInstanceTypes(event.currentTarget.value)}
                        />
                        <Select
                          label="Capacity Type"
                          data={[
                            { value: "ON_DEMAND", label: "ON_DEMAND" },
                            { value: "SPOT", label: "SPOT" },
                          ]}
                          value={workspaceNodeCapacityType}
                          onChange={setWorkspaceNodeCapacityType}
                        />
                        <TextInput
                          label="AMI Type"
                          placeholder="AL2_x86_64"
                          value={workspaceNodeAmiType}
                          onChange={(event) => setWorkspaceNodeAmiType(event.currentTarget.value)}
                        />
                        <NumberInput label="Min Size" value={workspaceNodeMinSize} onChange={setWorkspaceNodeMinSize} min={0} />
                        <NumberInput label="Max Size" value={workspaceNodeMaxSize} onChange={setWorkspaceNodeMaxSize} min={0} />
                        <NumberInput label="Desired Size" value={workspaceNodeDesiredSize} onChange={setWorkspaceNodeDesiredSize} min={0} />
                        <NumberInput label="Disk Size (GiB)" value={workspaceNodeDiskSize} onChange={setWorkspaceNodeDiskSize} min={20} />
                      </SimpleGrid>

                      <Group justify="end">
                        <Button
                          loading={creatingWorkspaceNodeGroup}
                          disabled={!workspaceNodeGroupOverview?.configured}
                          onClick={() => void createManagedNodeGroup("workspace")}
                        >
                          Create Workspace Nodegroup
                        </Button>
                      </Group>

                      <ScrollArea>
                        <Table withTableBorder highlightOnHover>
                          <Table.Thead>
                            <Table.Tr>
                              <Table.Th>Nodegroup</Table.Th>
                              <Table.Th>Status</Table.Th>
                              <Table.Th>Scale</Table.Th>
                              <Table.Th>Instances</Table.Th>
                              <Table.Th>Nodes</Table.Th>
                              <Table.Th>Created</Table.Th>
                              <Table.Th>Actions</Table.Th>
                            </Table.Tr>
                          </Table.Thead>
                          <Table.Tbody>
                            {workspaceNodeGroupOverview?.nodeGroups.length ? (
                              workspaceNodeGroupOverview.nodeGroups.map((group) => (
                                <Table.Tr key={group.nodeGroupName}>
                                  <Table.Td>{group.nodeGroupName}</Table.Td>
                                  <Table.Td>
                                    <Badge variant="light">{group.status}</Badge>
                                  </Table.Td>
                                  <Table.Td>
                                    {group.minSize} / {group.desiredSize} / {group.maxSize}
                                  </Table.Td>
                                  <Table.Td>{group.instanceTypes.join(", ") || "-"}</Table.Td>
                                  <Table.Td>{group.matchingNodeCount}</Table.Td>
                                  <Table.Td>{group.createdAt ? new Date(group.createdAt).toLocaleString() : "-"}</Table.Td>
                                  <Table.Td>
                                    <Button
                                      size="xs"
                                      color="red"
                                      variant="light"
                                      loading={deletingWorkspaceNodeGroupName === group.nodeGroupName}
                                      onClick={() => void deleteManagedNodeGroup("workspace", group.nodeGroupName)}
                                    >
                                      Delete
                                    </Button>
                                  </Table.Td>
                                </Table.Tr>
                              ))
                            ) : (
                              <Table.Tr>
                                <Table.Td colSpan={7}>
                                  <Text size="sm" c="dimmed">
                                    No workspace nodegroups matched the configured selector/taints.
                                  </Text>
                                </Table.Td>
                              </Table.Tr>
                            )}
                          </Table.Tbody>
                        </Table>
                      </ScrollArea>
                    </Stack>
                  </Paper>

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
                                <Table.Th>Actions</Table.Th>
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
                                    <Table.Td>
                                      <Button
                                        size="xs"
                                        color="red"
                                        variant="light"
                                        loading={stoppingWorkspaceResourceId === resource.sessionId}
                                        onClick={() => void stopWorkspaceResource(resource.sessionId)}
                                      >
                                        Stop
                                      </Button>
                                    </Table.Td>
                                  </Table.Tr>
                                ))
                              ) : (
                                <Table.Tr>
                                  <Table.Td colSpan={9}>
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
                      <Group justify="space-between" align="center">
                        <div>
                          <Title order={4}>Serving Managed Nodegroups</Title>
                          <Text size="sm" c="dimmed">
                            Create and delete EKS managed nodegroups that match the serving scheduling policy.
                          </Text>
                        </div>
                        <Badge variant="light">{servingNodeGroupOverview?.nodeGroups.length ?? 0} groups</Badge>
                      </Group>

                      <SimpleGrid cols={{ base: 1, md: 2, xl: 4 }} spacing="md">
                        <Paper withBorder p="md" radius="md">
                          <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
                            Cluster
                          </Text>
                          <Text mt="sm" fw={700}>
                            {servingNodeGroupOverview?.clusterName ?? "-"}
                          </Text>
                          <Text size="sm" c="dimmed" mt="xs">
                            {servingNodeGroupOverview?.region ?? "-"} / subnets {servingNodeGroupOverview?.subnetCount ?? 0}
                          </Text>
                        </Paper>
                        <Paper withBorder p="md" radius="md">
                          <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
                            Selector
                          </Text>
                          <Text mt="sm" fw={700} size="sm" style={{ whiteSpace: "pre-wrap" }}>
                            {JSON.stringify(servingNodeGroupOverview?.scheduling.selector ?? {}, null, 2)}
                          </Text>
                        </Paper>
                        <Paper withBorder p="md" radius="md">
                          <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
                            Tolerations
                          </Text>
                          <Text mt="sm" fw={700} size="sm" style={{ whiteSpace: "pre-wrap" }}>
                            {JSON.stringify(servingNodeGroupOverview?.scheduling.tolerations ?? [], null, 2)}
                          </Text>
                        </Paper>
                        <Paper withBorder p="md" radius="md">
                          <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
                            AWS Config
                          </Text>
                          <Text mt="sm" fw={700}>
                            {servingNodeGroupOverview?.configured ? "Ready" : "Missing"}
                          </Text>
                          <Text size="sm" c="dimmed" mt="xs">
                            {servingNodeGroupOverview?.message ?? "AWS credentials and EKS settings are configured."}
                          </Text>
                        </Paper>
                      </SimpleGrid>

                      <SimpleGrid cols={{ base: 1, md: 2, xl: 4 }} spacing="md">
                        <TextInput
                          label="Nodegroup Name"
                          placeholder="serving-general-a"
                          value={servingNodeGroupName}
                          onChange={(event) => setServingNodeGroupName(event.currentTarget.value)}
                        />
                        <TextInput
                          label="Instance Types"
                          placeholder="t3.large, t3.xlarge"
                          value={servingNodeInstanceTypes}
                          onChange={(event) => setServingNodeInstanceTypes(event.currentTarget.value)}
                        />
                        <Select
                          label="Capacity Type"
                          data={[
                            { value: "ON_DEMAND", label: "ON_DEMAND" },
                            { value: "SPOT", label: "SPOT" },
                          ]}
                          value={servingNodeCapacityType}
                          onChange={setServingNodeCapacityType}
                        />
                        <TextInput
                          label="AMI Type"
                          placeholder="AL2_x86_64"
                          value={servingNodeAmiType}
                          onChange={(event) => setServingNodeAmiType(event.currentTarget.value)}
                        />
                        <NumberInput label="Min Size" value={servingNodeMinSize} onChange={setServingNodeMinSize} min={0} />
                        <NumberInput label="Max Size" value={servingNodeMaxSize} onChange={setServingNodeMaxSize} min={0} />
                        <NumberInput label="Desired Size" value={servingNodeDesiredSize} onChange={setServingNodeDesiredSize} min={0} />
                        <NumberInput label="Disk Size (GiB)" value={servingNodeDiskSize} onChange={setServingNodeDiskSize} min={20} />
                      </SimpleGrid>

                      <Group justify="end">
                        <Button
                          loading={creatingServingNodeGroup}
                          disabled={!servingNodeGroupOverview?.configured}
                          onClick={() => void createManagedNodeGroup("serving")}
                        >
                          Create Serving Nodegroup
                        </Button>
                      </Group>

                      <ScrollArea>
                        <Table withTableBorder highlightOnHover>
                          <Table.Thead>
                            <Table.Tr>
                              <Table.Th>Nodegroup</Table.Th>
                              <Table.Th>Status</Table.Th>
                              <Table.Th>Scale</Table.Th>
                              <Table.Th>Instances</Table.Th>
                              <Table.Th>Nodes</Table.Th>
                              <Table.Th>Created</Table.Th>
                              <Table.Th>Actions</Table.Th>
                            </Table.Tr>
                          </Table.Thead>
                          <Table.Tbody>
                            {servingNodeGroupOverview?.nodeGroups.length ? (
                              servingNodeGroupOverview.nodeGroups.map((group) => (
                                <Table.Tr key={group.nodeGroupName}>
                                  <Table.Td>{group.nodeGroupName}</Table.Td>
                                  <Table.Td>
                                    <Badge variant="light">{group.status}</Badge>
                                  </Table.Td>
                                  <Table.Td>
                                    {group.minSize} / {group.desiredSize} / {group.maxSize}
                                  </Table.Td>
                                  <Table.Td>{group.instanceTypes.join(", ") || "-"}</Table.Td>
                                  <Table.Td>{group.matchingNodeCount}</Table.Td>
                                  <Table.Td>{group.createdAt ? new Date(group.createdAt).toLocaleString() : "-"}</Table.Td>
                                  <Table.Td>
                                    <Button
                                      size="xs"
                                      color="red"
                                      variant="light"
                                      loading={deletingServingNodeGroupName === group.nodeGroupName}
                                      onClick={() => void deleteManagedNodeGroup("serving", group.nodeGroupName)}
                                    >
                                      Delete
                                    </Button>
                                  </Table.Td>
                                </Table.Tr>
                              ))
                            ) : (
                              <Table.Tr>
                                <Table.Td colSpan={7}>
                                  <Text size="sm" c="dimmed">
                                    No serving nodegroups matched the configured selector/taints.
                                  </Text>
                                </Table.Td>
                              </Table.Tr>
                            )}
                          </Table.Tbody>
                        </Table>
                      </ScrollArea>
                    </Stack>
                  </Paper>

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
                                <Table.Th>Actions</Table.Th>
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
                                    <Table.Td>
                                      <Button
                                        size="xs"
                                        color="red"
                                        variant="light"
                                        loading={stoppingServingResourceKey === `${resource.type}-${resource.id}`}
                                        onClick={() => void stopServingResource(resource.type, resource.id)}
                                      >
                                        Stop
                                      </Button>
                                    </Table.Td>
                                  </Table.Tr>
                                ))
                              ) : (
                                <Table.Tr>
                                  <Table.Td colSpan={11}>
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

      <Drawer opened={detailProject !== null} onClose={() => setDetailProject(null)} title="Project Detail" position="right" size="xl">
        <LoadingOverlay visible={loadingProjectDetail} zIndex={1000} overlayProps={{ radius: "sm", blur: 2 }} />
        {detailProject ? (
          <Stack>
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <Paper withBorder p="md">
                <Stack gap={4}>
                  <Text fw={700}>{detailProjectOverview?.project.name ?? detailProject.name}</Text>
                  <Text size="sm" c="dimmed">
                    {detailProjectOverview?.project.description || detailProject.description || "No description"}
                  </Text>
                  <Text size="sm">ID: {detailProject.id}</Text>
                  <Text size="sm">Creator: {detailProject.requestedByDisplayName || detailProject.requestedByUserEmail || "-"}</Text>
                  <Text size="sm">Created: {new Date(detailProject.createdAt).toLocaleString()}</Text>
                </Stack>
              </Paper>
              <Paper withBorder p="md">
                <Stack gap={4}>
                  <Text fw={600}>Project Summary</Text>
                  <Text size="sm">Approval: {detailProject.approvalStatus}</Text>
                  <Text size="sm">Members: {detailProjectOverview?.members.length ?? 0}</Text>
                  <Text size="sm">CPU Limit: {detailProjectOverview?.resourceLimit?.cpu ?? "-"}</Text>
                  <Text size="sm">Memory Limit: {detailProjectOverview?.resourceLimit?.memoryGi ?? "-"} Gi</Text>
                </Stack>
              </Paper>
            </SimpleGrid>
            <Paper withBorder p="md">
              <Stack>
                <Group justify="space-between" align="center">
                  <div>
                    <Text fw={600}>GitLab Repositories</Text>
                    <Text size="sm" c="dimmed">
                      Review repositories mapped to this project.
                    </Text>
                  </div>
                  <Button size="xs" variant="light" onClick={() => setGitlabOpen(true)}>
                    Add Git Repo
                  </Button>
                </Group>
                <ScrollArea>
                  <Table withTableBorder>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Repo</Table.Th>
                        <Table.Th>Namespace</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {detailProjectRepos.length ? (
                        detailProjectRepos.map((repo) => (
                          <Table.Tr key={repo.id}>
                            <Table.Td>{repo.repoName}</Table.Td>
                            <Table.Td>{repo.namespacePath}</Table.Td>
                          </Table.Tr>
                        ))
                      ) : (
                        <Table.Tr>
                          <Table.Td colSpan={2}>
                            <Text size="sm" c="dimmed">
                              No Git repositories mapped to this project.
                            </Text>
                          </Table.Td>
                        </Table.Tr>
                      )}
                    </Table.Tbody>
                  </Table>
                </ScrollArea>
              </Stack>
            </Paper>
            <Paper withBorder p="md">
              <Stack>
                <Group justify="space-between" align="center">
                  <div>
                    <Text fw={600}>Project Members</Text>
                    <Text size="sm" c="dimmed">
                      Manage project access for portal users.
                    </Text>
                  </div>
                  <Badge variant="light">{detailProjectOverview?.members.length ?? 0} members</Badge>
                </Group>
                <Group align="end">
                  <Select
                    style={{ flex: 1 }}
                    label="Add user"
                    placeholder="Select a user"
                    data={detailProjectAvailableUsers.map((user) => ({
                      value: user.id,
                      label: user.displayName ? `${user.displayName} (${user.email})` : user.email,
                    }))}
                    value={selectedProjectMemberId}
                    onChange={setSelectedProjectMemberId}
                    searchable
                    nothingFoundMessage="No available users"
                  />
                  <Select
                    label="Role"
                    data={[
                      { value: "member", label: "Member" },
                      { value: "manager", label: "Manager" },
                    ]}
                    value={selectedProjectMemberRole}
                    onChange={setSelectedProjectMemberRole}
                  />
                  <Button loading={updatingProjectMembers} onClick={() => void addProjectMember()}>
                    Add Member
                  </Button>
                </Group>
                <ScrollArea>
                  <Table withTableBorder>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Name</Table.Th>
                        <Table.Th>Email</Table.Th>
                        <Table.Th>Global Role</Table.Th>
                        <Table.Th>Project Role</Table.Th>
                        <Table.Th>Actions</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {detailProjectOverview?.members.length ? (
                        detailProjectOverview.members.map((member) => (
                          <Table.Tr key={member.id}>
                            <Table.Td>{member.displayName || member.email || member.userId}</Table.Td>
                            <Table.Td>{member.email || "-"}</Table.Td>
                            <Table.Td>{member.globalRole || "-"}</Table.Td>
                            <Table.Td>
                              <Select
                                data={[
                                  { value: "member", label: "Member" },
                                  { value: "manager", label: "Manager" },
                                ]}
                                value={member.role}
                                onChange={(value) => (value ? void updateProjectMemberRole(detailProject.id, member.userId, value) : undefined)}
                                disabled={updatingProjectMembers}
                                size="xs"
                              />
                            </Table.Td>
                            <Table.Td>
                              <Button
                                size="xs"
                                color="red"
                                variant="light"
                                loading={updatingProjectMembers}
                                onClick={() => void removeProjectMember(detailProject.id, member.userId)}
                              >
                                Remove
                              </Button>
                            </Table.Td>
                          </Table.Tr>
                        ))
                      ) : (
                        <Table.Tr>
                          <Table.Td colSpan={5}>
                            <Text size="sm" c="dimmed">
                              No project members yet.
                            </Text>
                          </Table.Td>
                        </Table.Tr>
                      )}
                    </Table.Tbody>
                  </Table>
                </ScrollArea>
              </Stack>
            </Paper>
            <Paper withBorder p="md">
              <Stack>
                <Group justify="space-between" align="center">
                  <div>
                    <Text fw={600}>Serving</Text>
                    <Text size="sm" c="dimmed">
                      Read-only list of deployed Agents and MCP servers for this project.
                    </Text>
                  </div>
                  <Badge variant="light">{detailProjectAgents.length + detailProjectMcps.length} deployments</Badge>
                </Group>
                <ScrollArea>
                  <Table withTableBorder>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Type</Table.Th>
                        <Table.Th>Name</Table.Th>
                        <Table.Th>Repo</Table.Th>
                        <Table.Th>Status</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {detailProjectAgents.length || detailProjectMcps.length ? (
                        [
                          ...detailProjectAgents.map((agent) => ({
                            id: agent.id,
                            type: "Agent",
                            name: agent.agentName,
                            repoName: agent.repoName,
                            status: agent.status,
                          })),
                          ...detailProjectMcps.map((mcp) => ({
                            id: mcp.id,
                            type: "MCP",
                            name: mcp.mcpName,
                            repoName: mcp.repoName,
                            status: mcp.status,
                          })),
                        ].map((deployment) => (
                          <Table.Tr key={`${deployment.type}-${deployment.id}`}>
                            <Table.Td>{deployment.type}</Table.Td>
                            <Table.Td>{deployment.name}</Table.Td>
                            <Table.Td>{deployment.repoName}</Table.Td>
                            <Table.Td>{deployment.status}</Table.Td>
                          </Table.Tr>
                        ))
                      ) : (
                        <Table.Tr>
                          <Table.Td colSpan={4}>
                            <Text size="sm" c="dimmed">
                              No serving deployments for this project.
                            </Text>
                          </Table.Td>
                        </Table.Tr>
                      )}
                    </Table.Tbody>
                  </Table>
                </ScrollArea>
              </Stack>
            </Paper>
          </Stack>
        ) : null}
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
    </AdminFrame>
  );
}
