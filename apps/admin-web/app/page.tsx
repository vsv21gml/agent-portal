"use client";

import {
  Badge,
  Button,
  Drawer,
  Group,
  LoadingOverlay,
  Paper,
  Pagination,
  ScrollArea,
  Select,
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

type LogRow = {
  id: string;
  method: string;
  path: string;
  statusCode?: number;
  elapsedMs?: number;
  createdAt: string;
};

type ResourceStatus = {
  projectId: string;
  projectName: string;
  limit: { cpu: number; memoryGi: number };
  usage: { usedCpu: number; usedMemoryGi: number };
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
  modelName: string;
  status: string;
  reviewNote: string | null;
  reviewerUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

const PAGE_SIZE = 8;

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
  const [auditLogs, setAuditLogs] = useState<LogRow[]>([]);
  const [accessLogs, setAccessLogs] = useState<LogRow[]>([]);
  const [resourceRows, setResourceRows] = useState<ResourceStatus[]>([]);
  const [groups, setGroups] = useState<GitlabGroup[]>([]);
  const [repos, setRepos] = useState<GitlabRepo[]>([]);
  const [vectorKeys, setVectorKeys] = useState<VectorKey[]>([]);
  const [catalogModels, setCatalogModels] = useState<CatalogModel[]>([]);
  const [modelRequests, setModelRequests] = useState<ModelAccessRequest[]>([]);
  const [activePage, setActivePage] = useState(1);
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

  const loadResourceData = async () => {
    const loadedProjects = projects.length ? projects : await loadProjectsData();
    const statusResults = await Promise.allSettled(
      loadedProjects.map(async (project) => {
        const data = await apiFetch<{ limit: { cpu: number; memoryGi: number }; usage: { usedCpu: number; usedMemoryGi: number } }>(
          `admin/projects/${project.id}/resource-status`,
        );
        return {
          projectId: project.id,
          projectName: project.name,
          limit: data.limit,
          usage: data.usage,
        };
      }),
    );
    setResourceRows(statusResults.flatMap((result) => (result.status === "fulfilled" ? [result.value] : [])));
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
    setAuditLogs(await apiFetch<LogRow[]>("admin/logs/audit"));
  };

  const loadAccessData = async () => {
    setAccessLogs(await apiFetch<LogRow[]>("admin/logs/access"));
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
      headerActions={
        <Group gap="xs">
          <Button variant="light" loading={refreshing} onClick={() => void refreshCurrentPage()}>
            Refresh
          </Button>
          <ProfileMenu />
        </Group>
      }
      navigation={adminNavigation}
      activeNav={activeSection}
    >
      <Stack pos="relative">
        <LoadingOverlay visible={authChecking} zIndex={1000} overlayProps={{ radius: "sm", blur: 2 }} />
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
          <Paper withBorder p="md">
            <Title order={4}>Workspace Resource Status</Title>
            <ScrollArea mt="sm">
              <Table withTableBorder highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Project</Table.Th>
                    <Table.Th>CPU(used/limit)</Table.Th>
                    <Table.Th>MEM Gi(used/limit)</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {resourceRows.map((resource) => (
                    <Table.Tr key={resource.projectId}>
                      <Table.Td>{resource.projectName}</Table.Td>
                      <Table.Td>
                        {resource.usage.usedCpu}/{resource.limit.cpu}
                      </Table.Td>
                      <Table.Td>
                        {resource.usage.usedMemoryGi}/{resource.limit.memoryGi}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          </Paper>
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
                        <Table.Th>User</Table.Th>
                        <Table.Th>Email</Table.Th>
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
                            <Table.Td>{request.userDisplayName}</Table.Td>
                            <Table.Td>{request.userEmail}</Table.Td>
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
                          <Table.Td colSpan={6}>
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
          <Paper withBorder p="md">
            <Title order={4}>GitLab Group Status</Title>
            <Stack mt="sm">
              {groups.map((group) => (
                <Text size="sm" key={group.id}>
                  {group.groupPath} (project: {group.projectId})
                </Text>
              ))}
            </Stack>
            <Title order={5} mt="md">
              GitLab Repo Status
            </Title>
            <Stack mt="sm">
              {repos.map((repo) => (
                <Text size="sm" key={repo.id}>
                  {repo.namespacePath}
                </Text>
              ))}
            </Stack>
          </Paper>
        ) : null}

        {activeSection === "audit" ? (
          <Paper withBorder p="md">
            <Title order={4}>Audit Logs</Title>
            <Stack mt="sm">
              {auditLogs.map((log) => (
                <Text key={log.id} size="sm">
                  [{new Date(log.createdAt).toLocaleString()}] {log.method} {log.path}
                </Text>
              ))}
            </Stack>
          </Paper>
        ) : null}

        {activeSection === "access" ? (
          <Paper withBorder p="md">
            <Title order={4}>Access Logs</Title>
            <Stack mt="sm">
              {accessLogs.map((log) => (
                <Text key={log.id} size="sm">
                  [{new Date(log.createdAt).toLocaleString()}] {log.method} {log.path} ({log.statusCode} / {log.elapsedMs}ms)
                </Text>
              ))}
            </Stack>
          </Paper>
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
