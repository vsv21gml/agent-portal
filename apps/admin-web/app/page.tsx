"use client";

import {
  Badge,
  Button,
  Drawer,
  Group,
  LoadingOverlay,
  Pagination,
  Paper,
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
import { useRouter } from "next/navigation";
import { AdminFrame } from "../src/components/admin-frame";
import { ApiError, apiFetch } from "../src/lib/api-client";
import { clearToken } from "../src/lib/auth";

type UserRow = { id: string; email: string; displayName: string; globalRole: string };
type InvitationRow = { id: string; email: string; displayName: string; globalRole: string; token: string; createdAt: string };
type ProjectRow = { id: string; name: string; description: string; createdAt: string };
type LogRow = { id: string; method: string; path: string; statusCode?: number; elapsedMs?: number; createdAt: string };
type ResourceStatus = { projectId: string; projectName: string; limit: { cpu: number; memoryGi: number }; usage: { usedCpu: number; usedMemoryGi: number } };
type GitlabGroup = { id: string; projectId: string; groupPath: string };
type GitlabRepo = { id: string; projectId: string; repoName: string; namespacePath: string };
type LlmKey = { id: string; projectId: string; teamId: string; ownerUserId: string; keyAlias: string; createdAt: string };
type VectorKey = { id: string; projectId: string; ownerUserId: string; keyAlias: string; indexName: string; remoteKeyId: string | null; createdAt: string; apiKey?: string | null };
type SectionKey = "users" | "projects" | "resources" | "gitlab" | "audit" | "access";
type GitlabTableRow = { id: string; projectName: string; group: string; repo: string; namespace: string };

const PAGE_SIZE = 20;
const SECTIONS: Array<{ key: SectionKey; label: string; description: string }> = [
  { key: "users", label: "Users", description: "Members and invitations" },
  { key: "projects", label: "Projects", description: "Workspace inventory" },
  { key: "resources", label: "Resources", description: "Notebook usage" },
  { key: "gitlab", label: "GitLab", description: "Groups and repositories" },
  { key: "audit", label: "Audit", description: "Administrative activity" },
  { key: "access", label: "Access", description: "Request history" },
];

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function fallbackCopyText(text: string) {
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

function paginate<T>(items: T[], page: number) {
  const total = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const current = Math.min(page, total);
  const start = (current - 1) * PAGE_SIZE;
  return { items: items.slice(start, start + PAGE_SIZE), total };
}

function EmptyRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <Table.Tr>
      <Table.Td colSpan={colSpan}>
        <Text size="sm" c="dimmed">
          {label}
        </Text>
      </Table.Td>
    </Table.Tr>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [auditLogs, setAuditLogs] = useState<LogRow[]>([]);
  const [accessLogs, setAccessLogs] = useState<LogRow[]>([]);
  const [resourceRows, setResourceRows] = useState<ResourceStatus[]>([]);
  const [groups, setGroups] = useState<GitlabGroup[]>([]);
  const [repos, setRepos] = useState<GitlabRepo[]>([]);
  const [llmKeys, setLlmKeys] = useState<LlmKey[]>([]);
  const [vectorKeys, setVectorKeys] = useState<VectorKey[]>([]);
  const [activeSection, setActiveSection] = useState<SectionKey>("users");
  const [userTab, setUserTab] = useState<string | null>("members");
  const [usersPage, setUsersPage] = useState(1);
  const [invitationsPage, setInvitationsPage] = useState(1);
  const [projectsPage, setProjectsPage] = useState(1);
  const [resourcesPage, setResourcesPage] = useState(1);
  const [gitlabPage, setGitlabPage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);
  const [accessPage, setAccessPage] = useState(1);
  const [editingNames, setEditingNames] = useState<Record<string, string>>({});
  const [savingDisplayNameId, setSavingDisplayNameId] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
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
  const [llmOpen, setLlmOpen] = useState(false);
  const [llmAlias, setLlmAlias] = useState("");
  const [llmError, setLlmError] = useState<string | null>(null);
  const [vectorOpen, setVectorOpen] = useState(false);
  const [vectorAlias, setVectorAlias] = useState("");
  const [vectorError, setVectorError] = useState<string | null>(null);
  const [authChecking, setAuthChecking] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const me = await apiFetch<{ role: string }>("auth/me");
        if (me.role !== "admin") {
          clearToken();
          router.replace("/login?next=/");
          return;
        }

        const [usersResult, projectsResult, auditResult, accessResult, groupsResult, invitationsResult] = await Promise.allSettled([
          apiFetch<UserRow[]>("admin/users"),
          apiFetch<ProjectRow[]>("admin/projects"),
          apiFetch<LogRow[]>("admin/logs/audit"),
          apiFetch<LogRow[]>("admin/logs/access"),
          apiFetch<GitlabGroup[]>("admin/gitlab/groups"),
          apiFetch<InvitationRow[]>("auth/invitations"),
        ]);

        if (usersResult.status !== "fulfilled" || projectsResult.status !== "fulfilled") {
          throw new Error("Failed to load admin data");
        }

        setUsers(usersResult.value);
        setEditingNames(
          usersResult.value.reduce<Record<string, string>>((acc, user) => {
            acc[user.id] = user.displayName;
            return acc;
          }, {}),
        );
        setProjects(projectsResult.value);
        setAuditLogs(auditResult.status === "fulfilled" ? auditResult.value : []);
        setAccessLogs(accessResult.status === "fulfilled" ? accessResult.value : []);
        setGroups(groupsResult.status === "fulfilled" ? groupsResult.value : []);
        setInvitations(invitationsResult.status === "fulfilled" ? invitationsResult.value : []);

        const [statusResults, repoResults, llmResults, vectorResults] = await Promise.all([
          Promise.allSettled(
            projectsResult.value.map(async (project) => {
              const data = await apiFetch<{ limit: { cpu: number; memoryGi: number }; usage: { usedCpu: number; usedMemoryGi: number } }>(
                `admin/projects/${project.id}/resource-status`,
              );
              return { projectId: project.id, projectName: project.name, limit: data.limit, usage: data.usage };
            }),
          ),
          Promise.allSettled(projectsResult.value.map((project) => apiFetch<GitlabRepo[]>(`admin/projects/${project.id}/gitlab/repos`))),
          Promise.allSettled(projectsResult.value.map((project) => apiFetch<LlmKey[]>(`llm/projects/${project.id}/keys`))),
          Promise.allSettled(projectsResult.value.map((project) => apiFetch<VectorKey[]>(`vectordb/projects/${project.id}/keys`))),
        ]);

        setResourceRows(statusResults.flatMap((result) => (result.status === "fulfilled" ? [result.value] : [])));
        setRepos(repoResults.flatMap((result) => (result.status === "fulfilled" ? result.value : [])));
        setLlmKeys(llmResults.flatMap((result) => (result.status === "fulfilled" ? result.value : [])));
        setVectorKeys(vectorResults.flatMap((result) => (result.status === "fulfilled" ? result.value : [])));
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          router.replace("/login?next=/");
          return;
        }
        notifications.show({ title: "Load failed", message: "Admin data could not be loaded.", color: "red" });
        router.replace("/login?next=/");
      } finally {
        setAuthChecking(false);
      }
    };

    void load();
  }, [router]);

  useEffect(() => {
    if (!inviteOpen) {
      return;
    }
    setInviteEmail("");
    setInviteDisplayName("");
    setInviteRole("user");
  }, [inviteOpen]);

  const gitlabRows = useMemo<GitlabTableRow[]>(() => {
    const projectNames = new Map(projects.map((project) => [project.id, project.name]));
    const groupsByProject = new Map(groups.map((group) => [group.projectId, group.groupPath]));
    const repoRows = repos.map((repo) => ({
      id: `repo-${repo.id}`,
      projectName: projectNames.get(repo.projectId) ?? repo.projectId,
      group: groupsByProject.get(repo.projectId) ?? (repo.namespacePath.split("/").slice(0, -1).join("/") || "-"),
      repo: repo.repoName,
      namespace: repo.namespacePath,
    }));
    const groupOnlyRows = groups
      .filter((group) => !repos.some((repo) => repo.projectId === group.projectId))
      .map((group) => ({
        id: `group-${group.id}`,
        projectName: projectNames.get(group.projectId) ?? group.projectId,
        group: group.groupPath,
        repo: "-",
        namespace: "-",
      }));
    return [...repoRows, ...groupOnlyRows];
  }, [groups, projects, repos]);

  const pagedUsers = useMemo(() => paginate(users, usersPage), [users, usersPage]);
  const pagedInvitations = useMemo(() => paginate(invitations, invitationsPage), [invitations, invitationsPage]);
  const pagedProjects = useMemo(() => paginate(projects, projectsPage), [projects, projectsPage]);
  const pagedResources = useMemo(() => paginate(resourceRows, resourcesPage), [resourceRows, resourcesPage]);
  const pagedGitlab = useMemo(() => paginate(gitlabRows, gitlabPage), [gitlabRows, gitlabPage]);
  const pagedAudit = useMemo(() => paginate(auditLogs, auditPage), [auditLogs, auditPage]);
  const pagedAccess = useMemo(() => paginate(accessLogs, accessPage), [accessLogs, accessPage]);

  const buildPortalInviteUrl = (token: string) => {
    if (typeof window === "undefined") {
      return `/invite/${token}`;
    }
    return `${window.location.origin.replace("://admin.", "://")}/invite/${token}`;
  };

  const tryCopy = async (text: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        return fallbackCopyText(text);
      }
    }
    return fallbackCopyText(text);
  };

  const createInvitation = async () => {
    if (!inviteEmail.trim() || !inviteDisplayName.trim() || !inviteRole) {
      notifications.show({ title: "Failed", message: "Email, display name, and role are required.", color: "red" });
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
      setUserTab("invitations");
      setInvitationsPage(1);
      notifications.show({ title: "Created", message: "Invitation created.", color: "teal" });
    } catch {
      notifications.show({ title: "Failed", message: "Failed to create invitation.", color: "red" });
    } finally {
      setCreatingInvite(false);
    }
  };

  const copyInvitationLink = async (token: string) => {
    const copied = await tryCopy(buildPortalInviteUrl(token));
    notifications.show({
      title: copied ? "Copied" : "Copy unavailable",
      message: copied ? "Invitation link copied." : "Copy the link directly from the table field.",
      color: copied ? "teal" : "yellow",
    });
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

  const updateDisplayName = async (userId: string) => {
    const displayName = editingNames[userId]?.trim() ?? "";
    if (!displayName) {
      notifications.show({ title: "Failed", message: "Display name is required.", color: "red" });
      return;
    }

    setSavingDisplayNameId(userId);
    try {
      await apiFetch(`auth/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ displayName }),
      });
      setUsers((prev) => prev.map((user) => (user.id === userId ? { ...user, displayName } : user)));
      notifications.show({ title: "Updated", message: "Display name updated.", color: "teal" });
    } catch {
      notifications.show({ title: "Failed", message: "Failed to update display name.", color: "red" });
    } finally {
      setSavingDisplayNameId(null);
    }
  };

  const deleteUser = async (userId: string) => {
    const user = users.find((item) => item.id === userId);
    if (!user) {
      return;
    }

    if (typeof window !== "undefined" && !window.confirm(`Delete ${user.email}?`)) {
      return;
    }

    setDeletingUserId(userId);
    try {
      await apiFetch(`auth/users/${userId}`, { method: "DELETE" });
      setUsers((prev) => prev.filter((item) => item.id !== userId));
      setEditingNames((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
      notifications.show({ title: "Deleted", message: "User deleted.", color: "teal" });
    } catch {
      notifications.show({ title: "Failed", message: "Failed to delete user.", color: "red" });
    } finally {
      setDeletingUserId(null);
    }
  };

  const deleteInvitation = async (invitationId: string) => {
    setDeletingInvitationId(invitationId);
    try {
      await apiFetch(`auth/invitations/${invitationId}`, { method: "DELETE" });
      setInvitations((prev) => prev.filter((item) => item.id !== invitationId));
      notifications.show({ title: "Deleted", message: "Invitation removed.", color: "teal" });
    } catch {
      notifications.show({ title: "Failed", message: "Failed to delete invitation.", color: "red" });
    } finally {
      setDeletingInvitationId(null);
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

  const issueLlmKey = async () => {
    if (!detailProject) {
      return;
    }
    if (!llmAlias.trim()) {
      setLlmError("Key alias is required.");
      return;
    }
    setLlmError(null);
    try {
      await apiFetch(`llm/projects/${detailProject.id}/team`, { method: "POST" });
      const created = await apiFetch<LlmKey>(`llm/projects/${detailProject.id}/keys`, {
        method: "POST",
        body: JSON.stringify({ keyAlias: llmAlias.trim() }),
      });
      setLlmKeys((prev) => [created, ...prev]);
      setLlmAlias("");
      setLlmOpen(false);
      notifications.show({ title: "Issued", message: "LiteLLM key issued.", color: "teal" });
    } catch {
      notifications.show({ title: "Failed", message: "Failed to issue LiteLLM key.", color: "red" });
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

  const renderUsersSection = () => (
    <Paper withBorder p="lg">
      <Stack gap="lg">
        <Group justify="space-between" align="end">
          <Stack gap={2}>
            <Title order={3}>User Administration</Title>
            <Text size="sm" c="dimmed">
              Manage members, invitations, and role changes.
            </Text>
          </Stack>
          <Button variant="light" onClick={() => setInviteOpen(true)}>
            Invite User
          </Button>
        </Group>

        <Tabs value={userTab} onChange={setUserTab}>
          <Tabs.List>
            <Tabs.Tab value="members">Users</Tabs.Tab>
            <Tabs.Tab value="invitations">Pending Invitations</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="members" pt="md">
            <Stack gap="md">
              <ScrollArea>
                <Table withTableBorder highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Email</Table.Th>
                      <Table.Th>Display Name</Table.Th>
                      <Table.Th>Role</Table.Th>
                      <Table.Th>Actions</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {pagedUsers.items.length === 0 ? (
                      <EmptyRow colSpan={4} label="No users found." />
                    ) : (
                      pagedUsers.items.map((user) => {
                        const changed = (editingNames[user.id] ?? user.displayName) !== user.displayName;
                        return (
                          <Table.Tr key={user.id}>
                            <Table.Td>{user.email}</Table.Td>
                            <Table.Td miw={260}>
                              <Group gap="xs" wrap="nowrap" align="end">
                                <TextInput
                                  value={editingNames[user.id] ?? ""}
                                  onChange={(event) => setEditingNames((prev) => ({ ...prev, [user.id]: event.currentTarget.value }))}
                                />
                                <Button size="xs" variant="light" disabled={!changed} loading={savingDisplayNameId === user.id} onClick={() => void updateDisplayName(user.id)}>
                                  Save
                                </Button>
                              </Group>
                            </Table.Td>
                            <Table.Td miw={180}>
                              <Select
                                data={[
                                  { value: "user", label: "user" },
                                  { value: "admin", label: "admin" },
                                ]}
                                value={user.globalRole}
                                allowDeselect={false}
                                onChange={(value) => {
                                  if (value === user.globalRole) {
                                    return;
                                  }
                                  if (value === "admin" || value === "user") {
                                    void updateRole(user.id, value);
                                  }
                                }}
                              />
                            </Table.Td>
                            <Table.Td>
                              <Group gap="xs">
                                <Button size="xs" color="red" variant="light" loading={deletingUserId === user.id} onClick={() => void deleteUser(user.id)}>
                                  Delete
                                </Button>
                              </Group>
                            </Table.Td>
                          </Table.Tr>
                        );
                      })
                    )}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
              <Group justify="end">
                <Pagination total={pagedUsers.total} value={usersPage} onChange={setUsersPage} />
              </Group>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="invitations" pt="md">
            <Stack gap="md">
              <ScrollArea>
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
                    {pagedInvitations.items.length === 0 ? (
                      <EmptyRow colSpan={6} label="No pending invitations." />
                    ) : (
                      pagedInvitations.items.map((invitation) => (
                        <Table.Tr key={invitation.id}>
                          <Table.Td>{invitation.email}</Table.Td>
                          <Table.Td>{invitation.displayName}</Table.Td>
                          <Table.Td>
                            <Badge variant="light">{invitation.globalRole}</Badge>
                          </Table.Td>
                          <Table.Td>{formatDateTime(invitation.createdAt)}</Table.Td>
                          <Table.Td miw={360}>
                            <Group gap="xs" wrap="nowrap">
                              <TextInput value={buildPortalInviteUrl(invitation.token)} readOnly styles={{ input: { minWidth: 260 } }} />
                              <Button size="xs" variant="light" onClick={() => void copyInvitationLink(invitation.token)}>
                                Copy
                              </Button>
                            </Group>
                          </Table.Td>
                          <Table.Td>
                            <Button size="xs" color="red" variant="light" loading={deletingInvitationId === invitation.id} onClick={() => void deleteInvitation(invitation.id)}>
                              Delete
                            </Button>
                          </Table.Td>
                        </Table.Tr>
                      ))
                    )}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
              <Group justify="end">
                <Pagination total={pagedInvitations.total} value={invitationsPage} onChange={setInvitationsPage} />
              </Group>
            </Stack>
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </Paper>
  );

  const renderProjectsSection = () => (
    <Paper withBorder p="lg">
      <Stack gap="md">
        <Title order={3}>Projects</Title>
        <ScrollArea>
          <Table withTableBorder highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Description</Table.Th>
                <Table.Th>ID</Table.Th>
                <Table.Th>Created</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {pagedProjects.items.length === 0 ? (
                <EmptyRow colSpan={4} label="No projects found." />
              ) : (
                pagedProjects.items.map((project) => (
                  <Table.Tr key={project.id} onClick={() => setDetailProject(project)} style={{ cursor: "pointer" }}>
                    <Table.Td>{project.name}</Table.Td>
                    <Table.Td>{project.description || "-"}</Table.Td>
                    <Table.Td>{project.id}</Table.Td>
                    <Table.Td>{formatDateTime(project.createdAt)}</Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        </ScrollArea>
        <Group justify="end">
          <Pagination total={pagedProjects.total} value={projectsPage} onChange={setProjectsPage} />
        </Group>
      </Stack>
    </Paper>
  );

  const renderResourcesSection = () => (
    <Paper withBorder p="lg">
      <Stack gap="md">
        <Title order={3}>Notebook Resource Status</Title>
        <ScrollArea>
          <Table withTableBorder highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Project</Table.Th>
                <Table.Th>CPU Used / Limit</Table.Th>
                <Table.Th>Memory Used / Limit</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {pagedResources.items.length === 0 ? (
                <EmptyRow colSpan={3} label="No resource rows found." />
              ) : (
                pagedResources.items.map((resource) => (
                  <Table.Tr key={resource.projectId}>
                    <Table.Td>{resource.projectName}</Table.Td>
                    <Table.Td>{resource.usage.usedCpu}/{resource.limit.cpu}</Table.Td>
                    <Table.Td>{resource.usage.usedMemoryGi}/{resource.limit.memoryGi}</Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        </ScrollArea>
        <Group justify="end">
          <Pagination total={pagedResources.total} value={resourcesPage} onChange={setResourcesPage} />
        </Group>
      </Stack>
    </Paper>
  );

  const renderGitlabSection = () => (
    <Paper withBorder p="lg">
      <Stack gap="md">
        <Title order={3}>GitLab Overview</Title>
        <ScrollArea>
          <Table withTableBorder highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Project</Table.Th>
                <Table.Th>Group</Table.Th>
                <Table.Th>Repo</Table.Th>
                <Table.Th>Namespace</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {pagedGitlab.items.length === 0 ? (
                <EmptyRow colSpan={4} label="No GitLab rows found." />
              ) : (
                pagedGitlab.items.map((row) => (
                  <Table.Tr key={row.id}>
                    <Table.Td>{row.projectName}</Table.Td>
                    <Table.Td>{row.group}</Table.Td>
                    <Table.Td>{row.repo}</Table.Td>
                    <Table.Td>{row.namespace}</Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        </ScrollArea>
        <Group justify="end">
          <Pagination total={pagedGitlab.total} value={gitlabPage} onChange={setGitlabPage} />
        </Group>
      </Stack>
    </Paper>
  );

  const renderAuditSection = () => (
    <Paper withBorder p="lg">
      <Stack gap="md">
        <Title order={3}>Audit Logs</Title>
        <ScrollArea>
          <Table withTableBorder highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Time</Table.Th>
                <Table.Th>Method</Table.Th>
                <Table.Th>Path</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {pagedAudit.items.length === 0 ? (
                <EmptyRow colSpan={3} label="No audit logs found." />
              ) : (
                pagedAudit.items.map((log) => (
                  <Table.Tr key={log.id}>
                    <Table.Td>{formatDateTime(log.createdAt)}</Table.Td>
                    <Table.Td>{log.method}</Table.Td>
                    <Table.Td>{log.path}</Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        </ScrollArea>
        <Group justify="end">
          <Pagination total={pagedAudit.total} value={auditPage} onChange={setAuditPage} />
        </Group>
      </Stack>
    </Paper>
  );

  const renderAccessSection = () => (
    <Paper withBorder p="lg">
      <Stack gap="md">
        <Title order={3}>Access Logs</Title>
        <ScrollArea>
          <Table withTableBorder highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Time</Table.Th>
                <Table.Th>Method</Table.Th>
                <Table.Th>Path</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Latency</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {pagedAccess.items.length === 0 ? (
                <EmptyRow colSpan={5} label="No access logs found." />
              ) : (
                pagedAccess.items.map((log) => (
                  <Table.Tr key={log.id}>
                    <Table.Td>{formatDateTime(log.createdAt)}</Table.Td>
                    <Table.Td>{log.method}</Table.Td>
                    <Table.Td>{log.path}</Table.Td>
                    <Table.Td>{log.statusCode ?? "-"}</Table.Td>
                    <Table.Td>{log.elapsedMs != null ? `${log.elapsedMs} ms` : "-"}</Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        </ScrollArea>
        <Group justify="end">
          <Pagination total={pagedAccess.total} value={accessPage} onChange={setAccessPage} />
        </Group>
      </Stack>
    </Paper>
  );

  const renderSection = () => {
    switch (activeSection) {
      case "users":
        return renderUsersSection();
      case "projects":
        return renderProjectsSection();
      case "resources":
        return renderResourcesSection();
      case "gitlab":
        return renderGitlabSection();
      case "audit":
        return renderAuditSection();
      case "access":
        return renderAccessSection();
    }
  };

  return (
    <AdminFrame navigation={SECTIONS} activeNav={activeSection} onNavigate={(key) => setActiveSection(key as SectionKey)}>
      <Stack pos="relative">
        <LoadingOverlay visible={authChecking} zIndex={1000} overlayProps={{ radius: "sm", blur: 2 }} />
        {renderSection()}
      </Stack>
      <Drawer opened={detailProject !== null} onClose={() => setDetailProject(null)} title="Project Detail" position="right">
        {detailProject ? (
          <Stack>
            <Text fw={700}>{detailProject.name}</Text>
            <Text size="sm">{detailProject.description || "No description"}</Text>
            <Text size="sm">ID: {detailProject.id}</Text>
            <Text size="sm">Created: {formatDateTime(detailProject.createdAt)}</Text>
            <Group mt="sm">
              <Button size="xs" variant="light" onClick={() => setGitlabOpen(true)}>
                New GitLab Repo
              </Button>
              <Button size="xs" variant="light" onClick={() => setLlmOpen(true)}>
                Issue LiteLLM Key
              </Button>
              <Button size="xs" variant="light" onClick={() => setVectorOpen(true)}>
                Issue VectorDB Key
              </Button>
            </Group>
            <Text size="xs" c="dimmed">
              Existing keys: {llmKeys.filter((key) => key.projectId === detailProject.id).length} LiteLLM / {vectorKeys.filter((key) => key.projectId === detailProject.id).length} VectorDB
            </Text>
          </Stack>
        ) : null}
      </Drawer>
      <Drawer opened={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite User" position="right">
        <Stack>
          <TextInput label="Email" value={inviteEmail} onChange={(event) => setInviteEmail(event.currentTarget.value)} />
          <TextInput label="Display Name" value={inviteDisplayName} onChange={(event) => setInviteDisplayName(event.currentTarget.value)} />
          <Select label="Role" data={[{ value: "user", label: "user" }, { value: "admin", label: "admin" }]} value={inviteRole} onChange={setInviteRole} allowDeselect={false} />
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
          <TextInput label="Repo Name" value={gitlabRepoName} onChange={(event) => setGitlabRepoName(event.currentTarget.value)} error={gitlabError} placeholder="my-repo" />
          <Group justify="end">
            <Button variant="default" onClick={() => setGitlabOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createGitlabRepo}>Create</Button>
          </Group>
        </Stack>
      </Drawer>
      <Drawer opened={llmOpen} onClose={() => setLlmOpen(false)} title="Issue LiteLLM Key" position="right">
        <Stack>
          <TextInput label="Key Alias" value={llmAlias} onChange={(event) => setLlmAlias(event.currentTarget.value)} error={llmError} placeholder="team-key" />
          <Group justify="end">
            <Button variant="default" onClick={() => setLlmOpen(false)}>
              Cancel
            </Button>
            <Button onClick={issueLlmKey}>Issue</Button>
          </Group>
        </Stack>
      </Drawer>
      <Drawer opened={vectorOpen} onClose={() => setVectorOpen(false)} title="Issue VectorDB Key" position="right">
        <Stack>
          <TextInput label="Key Alias" value={vectorAlias} onChange={(event) => setVectorAlias(event.currentTarget.value)} error={vectorError} placeholder="project-key" />
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
