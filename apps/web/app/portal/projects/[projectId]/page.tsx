"use client";

import Link from "next/link";
import {
  ActionIcon,
  Badge,
  Box,
  Breadcrumbs,
  Button,
  Card,
  Divider,
  Group,
  LoadingOverlay,
  Menu,
  Modal,
  NavLink,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { ComponentPropsWithoutRef, forwardRef, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppFrame } from "../../../../src/components/app-frame";
import { ProfileMenu } from "../../../../src/components/profile-menu";
import { ApiError, apiFetch } from "../../../../src/lib/api-client";
import { toastError, toastSuccess } from "../../../../src/lib/toast";
import { Project } from "../../../../src/types/project";

type CurrentUser = {
  sub: string;
  email: string;
  role: string;
};

type PortalUser = {
  id: string;
  email: string;
  displayName: string;
};

type ProjectMember = {
  id: string;
  userId: string;
  role: string;
  email: string | null;
  displayName: string | null;
  globalRole: string | null;
};

type ResourceLimit = {
  cpu: number;
  memoryGi: number;
};

type ProjectOverview = {
  project: Project;
  members: ProjectMember[];
  resourceLimit: ResourceLimit;
};

type GitGroup = {
  id: string;
  projectId: string;
  groupPath: string;
  webUrl: string | null;
};

type GitRepo = {
  id: string;
  projectId: string;
  repoName: string;
  namespacePath: string;
  cloneUrl: string | null;
  webUrl: string | null;
  createdAt: string;
};

type LiteLlmModel = {
  id: string;
  modelName: string;
};

type LiteLlmKey = {
  id: string;
  keyAlias: string;
  createdAt: string;
};

type WorkspaceSession = {
  id: string;
  repoId: string;
  runtime: string;
  repoName: string;
  endpointUrl: string;
  status: string;
  createdAt: string;
};

type WorkspaceModalState = {
  repo: GitRepo;
  workspace?: WorkspaceSession;
} | null;

const menuItems = ["Info", "Repo", "LLM"] as const;
const runtimeOptions = [
  { value: "NODE22", label: "NODE22" },
  { value: "NODE23", label: "NODE23" },
  { value: "NODE24", label: "NODE24" },
  { value: "PYTHON3.8", label: "PYTHON3.8" },
];

type SectionMenuButtonProps = ComponentPropsWithoutRef<typeof ActionIcon> & {
  label: string;
};

const SectionMenuButton = forwardRef<HTMLButtonElement, SectionMenuButtonProps>(function SectionMenuButton(
  { label, ...props },
  ref,
) {
  return (
    <ActionIcon ref={ref} variant="default" color="gray" radius="xl" size="lg" aria-label={label} {...props}>
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <circle cx="9" cy="3.5" r="1.5" fill="currentColor" />
        <circle cx="9" cy="9" r="1.5" fill="currentColor" />
        <circle cx="9" cy="14.5" r="1.5" fill="currentColor" />
      </svg>
    </ActionIcon>
  );
});

export default function ProjectDetailPage() {
  const params = useParams<{ projectId: string }>();
  const router = useRouter();
  const projectId = params?.projectId ?? "";

  const [authChecking, setAuthChecking] = useState(true);
  const [loadingProject, setLoadingProject] = useState(true);
  const [activeMenu, setActiveMenu] = useState<(typeof menuItems)[number]>("Info");
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [loadingLiteLlm, setLoadingLiteLlm] = useState(false);
  const [creatingRepo, setCreatingRepo] = useState(false);
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [deletingWorkspaceId, setDeletingWorkspaceId] = useState<string | null>(null);
  const [stoppingWorkspaceId, setStoppingWorkspaceId] = useState<string | null>(null);
  const [restartingWorkspaceId, setRestartingWorkspaceId] = useState<string | null>(null);
  const [workspaceDeleteTarget, setWorkspaceDeleteTarget] = useState<WorkspaceSession | null>(null);
  const [issuingKey, setIssuingKey] = useState(false);
  const [updatingMembers, setUpdatingMembers] = useState(false);
  const [deletingProject, setDeletingProject] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [availableUsers, setAvailableUsers] = useState<PortalUser[]>([]);
  const [resourceLimit, setResourceLimit] = useState<ResourceLimit | null>(null);
  const [gitGroup, setGitGroup] = useState<GitGroup | null>(null);
  const [repos, setRepos] = useState<GitRepo[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceSession[]>([]);
  const [models, setModels] = useState<LiteLlmModel[]>([]);
  const [keys, setKeys] = useState<LiteLlmKey[]>([]);
  const [newRepoName, setNewRepoName] = useState("");
  const [newKeyAlias, setNewKeyAlias] = useState("");
  const [workspaceRuntime, setWorkspaceRuntime] = useState<string | null>("NODE22");
  const [workspaceModal, setWorkspaceModal] = useState<WorkspaceModalState>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<string | null>("member");
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [memberEditMode, setMemberEditMode] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [savingProject, setSavingProject] = useState(false);

  const repoWorkspaces = useMemo(() => {
    const map = new Map<string, WorkspaceSession>();
    for (const workspace of workspaces) {
      map.set(workspace.repoId, workspace);
    }
    return map;
  }, [workspaces]);

  const isManager = useMemo(() => {
    if (!currentUser) {
      return false;
    }
    return members.some((member) => member.userId === currentUser.sub && member.role === "manager");
  }, [currentUser, members]);

  const managerCount = useMemo(() => members.filter((member) => member.role === "manager").length, [members]);

  const loadMembersAndProject = async (targetProjectId: string) => {
    const overview = await apiFetch<ProjectOverview>(`projects/${targetProjectId}/overview`);
    setProject(overview.project);
    setEditName(overview.project.name);
    setEditDescription(overview.project.description);
    setMembers(overview.members);
    setResourceLimit(overview.resourceLimit);
    return overview;
  };

  const loadRepos = async (targetProject?: Project | null) => {
    const activeProject = targetProject ?? project;
    if (!activeProject) {
      return;
    }

    setLoadingRepos(true);
    try {
      const [groupRow, repoRows, workspaceRows] = await Promise.all([
        apiFetch<GitGroup>(`gitlab/projects/${activeProject.id}/group`, { method: "POST" }),
        apiFetch<GitRepo[]>(`gitlab/projects/${activeProject.id}/repos`),
        apiFetch<WorkspaceSession[]>(`workspaces/project/${activeProject.id}`),
      ]);
      setGitGroup(groupRow);
      setRepos(repoRows);
      setWorkspaces(workspaceRows);
    } catch {
      toastError("Failed to load repositories.");
    } finally {
      setLoadingRepos(false);
    }
  };

  const loadAvailableUsers = async (targetProjectId: string) => {
    try {
      const users = await apiFetch<PortalUser[]>(`projects/${targetProjectId}/available-users`);
      setAvailableUsers(users);
    } catch {
      setAvailableUsers([]);
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        const me = await apiFetch<CurrentUser>("auth/me");
        setCurrentUser(me);
        const overview = await loadMembersAndProject(projectId);
        await loadRepos(overview.project);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          router.replace(`/login?next=/portal/projects/${projectId}`);
          return;
        }
        toastError("Failed to load project workspace.");
      } finally {
        setAuthChecking(false);
        setLoadingProject(false);
      }
    };

    if (projectId) {
      void load();
    }
  }, [projectId, router]);

  useEffect(() => {
    if (projectId && isManager) {
      void loadAvailableUsers(projectId);
      return;
    }

    setAvailableUsers([]);
  }, [isManager, projectId]);

  const loadLiteLlm = async () => {
    if (!project) {
      return;
    }

    setLoadingLiteLlm(true);
    try {
      await apiFetch(`llm/projects/${project.id}/team`, { method: "POST" });
      const [modelRows, keyRows] = await Promise.all([
        apiFetch<LiteLlmModel[]>(`llm/projects/${project.id}/models`),
        apiFetch<LiteLlmKey[]>(`llm/projects/${project.id}/keys`),
      ]);
      setModels(modelRows);
      setKeys(keyRows);
      toastSuccess("LLM data refreshed.");
    } catch {
      toastError("Failed to refresh LLM data.");
    } finally {
      setLoadingLiteLlm(false);
    }
  };

  const refreshWorkspace = async (workspaceId: string) => {
    const latest = await apiFetch<WorkspaceSession>(`workspaces/${workspaceId}`);
    setWorkspaces((prev) => [latest, ...prev.filter((item) => item.id !== latest.id)]);
    return latest;
  };

  const waitForWorkspaceAndOpen = async (workspaceId: string) => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const latest = await refreshWorkspace(workspaceId);
      if (latest.status === "running") {
        window.open(latest.endpointUrl, "_blank", "noopener,noreferrer");
        toastSuccess("VS Code workspace is ready.");
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    toastError("Workspace is still provisioning. Try opening it again shortly.");
  };

  const issueLiteLlmKey = async () => {
    if (!project) {
      return;
    }
    if (!newKeyAlias.trim()) {
      toastError("Enter a key alias.");
      return;
    }

    setIssuingKey(true);
    try {
      await apiFetch(`llm/projects/${project.id}/keys`, {
        method: "POST",
        body: JSON.stringify({ keyAlias: newKeyAlias.trim() }),
      });
      setNewKeyAlias("");
      await loadLiteLlm();
      toastSuccess("LLM key issued.");
    } catch {
      toastError("Failed to issue LLM key.");
    } finally {
      setIssuingKey(false);
    }
  };

  const createRepo = async () => {
    if (!project) {
      return;
    }
    if (!newRepoName.trim()) {
      toastError("Enter a repository name.");
      return;
    }

    setCreatingRepo(true);
    try {
      await apiFetch<GitRepo>(`gitlab/projects/${project.id}/repos`, {
        method: "POST",
        body: JSON.stringify({ repoName: newRepoName.trim() }),
      });
      setNewRepoName("");
      await loadRepos();
      toastSuccess("Repository created.");
    } catch {
      toastError("Failed to create repository.");
    } finally {
      setCreatingRepo(false);
    }
  };

  const openWorkspaceModal = (repo: GitRepo, workspace?: WorkspaceSession) => {
    setWorkspaceRuntime(workspace?.runtime ?? "NODE22");
    setWorkspaceModal({ repo, workspace });
  };

  const handleWorkspaceSubmit = async () => {
    if (!project || !workspaceModal || !workspaceRuntime) {
      return;
    }

    setCreatingWorkspace(true);
    try {
      if (workspaceModal.workspace) {
        const updated = await apiFetch<WorkspaceSession>(`workspaces/${workspaceModal.workspace.id}`, {
          method: "PATCH",
          body: JSON.stringify({ runtime: workspaceRuntime }),
        });
        setWorkspaces((prev) => [updated, ...prev.filter((item) => item.id !== updated.id)]);
        setWorkspaceModal(null);
        toastSuccess("Workspace restart requested.");
        await waitForWorkspaceAndOpen(updated.id);
      } else {
        const created = await apiFetch<WorkspaceSession>("workspaces", {
          method: "POST",
          body: JSON.stringify({
            projectId: project.id,
            repoId: workspaceModal.repo.id,
            runtime: workspaceRuntime,
          }),
        });
        setWorkspaces((prev) => [created, ...prev.filter((item) => item.id !== created.id)]);
        setWorkspaceModal(null);
        toastSuccess("Workspace provisioning started.");
        await waitForWorkspaceAndOpen(created.id);
      }
    } catch {
      toastError("Failed to provision VS Code workspace.");
    } finally {
      setCreatingWorkspace(false);
    }
  };

  const deleteWorkspace = async (workspace: WorkspaceSession) => {
    setDeletingWorkspaceId(workspace.id);
    try {
      await apiFetch<{ id: string }>(`workspaces/${workspace.id}`, { method: "DELETE" });
      setWorkspaces((prev) => prev.filter((item) => item.id !== workspace.id));
      setWorkspaceDeleteTarget(null);
      toastSuccess("Workspace deleted.");
    } catch {
      toastError("Failed to delete workspace.");
    } finally {
      setDeletingWorkspaceId(null);
    }
  };

  const stopWorkspace = async (workspace: WorkspaceSession) => {
    setStoppingWorkspaceId(workspace.id);
    try {
      const stopped = await apiFetch<WorkspaceSession>(`workspaces/${workspace.id}/stop`, { method: "POST" });
      setWorkspaces((prev) => [stopped, ...prev.filter((item) => item.id !== stopped.id)]);
      toastSuccess("Workspace stopped.");
    } catch {
      toastError("Failed to stop workspace.");
    } finally {
      setStoppingWorkspaceId(null);
    }
  };

  const restartWorkspace = async (workspace: WorkspaceSession) => {
    setRestartingWorkspaceId(workspace.id);
    try {
      const restarted = await apiFetch<WorkspaceSession>(`workspaces/${workspace.id}/restart`, { method: "POST" });
      setWorkspaces((prev) => [restarted, ...prev.filter((item) => item.id !== restarted.id)]);
      toastSuccess("Workspace restart requested.");
      await waitForWorkspaceAndOpen(restarted.id);
    } catch {
      toastError("Failed to restart workspace.");
    } finally {
      setRestartingWorkspaceId(null);
    }
  };

  const addMember = async () => {
    if (!project || !selectedUserId || !selectedRole) {
      return;
    }

    setUpdatingMembers(true);
    try {
      await apiFetch(`projects/${project.id}/members`, {
        method: "POST",
        body: JSON.stringify({ userId: selectedUserId, role: selectedRole }),
      });
      setSelectedUserId(null);
      setSelectedRole("member");
      await loadMembersAndProject(project.id);
      await loadAvailableUsers(project.id);
      toastSuccess("Member added.");
    } catch {
      toastError("Failed to add member.");
    } finally {
      setUpdatingMembers(false);
    }
  };

  const updateMemberRole = async (userId: string, role: string) => {
    if (!project) {
      return;
    }

    setUpdatingMembers(true);
    try {
      await apiFetch(`projects/${project.id}/members`, {
        method: "POST",
        body: JSON.stringify({ userId, role }),
      });
      await loadMembersAndProject(project.id);
      toastSuccess("Member role updated.");
    } catch {
      toastError("Failed to update member role.");
    } finally {
      setUpdatingMembers(false);
    }
  };

  const removeMember = async (userId: string) => {
    if (!project) {
      return;
    }

    setUpdatingMembers(true);
    try {
      await apiFetch(`projects/${project.id}/members/${userId}`, { method: "DELETE" });
      await loadMembersAndProject(project.id);
      await loadAvailableUsers(project.id);
      toastSuccess("Member removed.");
    } catch {
      toastError("Failed to remove member.");
    } finally {
      setUpdatingMembers(false);
    }
  };

  const deleteProject = async () => {
    if (!project) {
      return;
    }

    setDeletingProject(true);
    try {
      await apiFetch(`projects/${project.id}`, { method: "DELETE" });
      toastSuccess("Project deleted.");
      router.push("/portal");
    } catch {
      toastError("Failed to delete project.");
    } finally {
      setDeletingProject(false);
      setDeleteModalOpen(false);
    }
  };

  const updateProject = async () => {
    if (!project) {
      return;
    }

    setSavingProject(true);
    try {
      const updated = await apiFetch<Project>(`projects/${project.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editName.trim(),
          description: editDescription.trim(),
        }),
      });
      setProject(updated);
      setEditProjectOpen(false);
      toastSuccess("Project updated.");
    } catch {
      toastError("Failed to update project.");
    } finally {
      setSavingProject(false);
    }
  };

  const breadcrumbs = (
    <Breadcrumbs separator=">">
      <Text component={Link} href="/portal" inherit>
        User Portal
      </Text>
      <Text inherit>{project?.name ?? "Project"}</Text>
    </Breadcrumbs>
  );

  const navbar = (
    <Stack gap="xs">
      {menuItems.map((item) => (
        <NavLink key={item} active={activeMenu === item} label={item} onClick={() => setActiveMenu(item)} variant="filled" />
      ))}
    </Stack>
  );

  return (
    <AppFrame title={breadcrumbs} headerActions={<ProfileMenu />} navbar={navbar} navbarWidth={280}>
      <Stack pos="relative">
        <LoadingOverlay visible={authChecking || loadingProject} zIndex={1000} overlayProps={{ radius: "sm", blur: 2 }} />

        {activeMenu === "Info" ? (
          <Stack>
            <Paper withBorder p="xl" radius="lg">
              <Stack gap="lg">
                <Stack gap={6}>
                  <Group justify="space-between" align="start">
                    <div>
                      <Title order={2}>{project?.name ?? "-"}</Title>
                    </div>
                    <Group gap="sm" align="center">
                      <Badge color="cyan" variant="light" size="lg">
                        Active
                      </Badge>
                      {isManager ? (
                        <Menu position="bottom-end" shadow="md">
                          <Menu.Target>
                            <SectionMenuButton label="Project actions" />
                          </Menu.Target>
                          <Menu.Dropdown>
                            <Menu.Item onClick={() => setEditProjectOpen(true)}>Edit Project</Menu.Item>
                            <Menu.Item color="red" onClick={() => setDeleteModalOpen(true)}>
                              Delete Project
                            </Menu.Item>
                          </Menu.Dropdown>
                        </Menu>
                      ) : null}
                    </Group>
                  </Group>
                  <Text size="md" c="dimmed">
                    {project?.description || "No description"}
                  </Text>
                </Stack>

                <SimpleGrid cols={{ base: 1, sm: 2, xl: 4 }} spacing="md">
                  <Card withBorder radius="md" padding="lg">
                    <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
                      Project ID
                    </Text>
                    <Text mt="sm" fw={600}>
                      {project?.id ?? "-"}
                    </Text>
                  </Card>
                  <Card withBorder radius="md" padding="lg">
                    <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
                      Created
                    </Text>
                    <Text mt="sm" fw={600}>
                      {project ? new Date(project.createdAt).toLocaleString() : "-"}
                    </Text>
                  </Card>
                  <Card withBorder radius="md" padding="lg">
                    <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
                      Resource Limit
                    </Text>
                    <Text mt="sm" fw={600}>
                      CPU {resourceLimit?.cpu ?? "-"} / MEM {resourceLimit?.memoryGi ?? "-"} Gi
                    </Text>
                  </Card>
                  <Card withBorder radius="md" padding="lg">
                    <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
                      Git / Repos
                    </Text>
                    <Text mt="sm" fw={600}>
                      {gitGroup?.groupPath ?? "Pending"} / {repos.length} repos
                    </Text>
                  </Card>
                </SimpleGrid>
              </Stack>
            </Paper>

            <Paper withBorder p="xl" radius="lg">
              <Stack>
                <Group justify="space-between" align="center">
                  <div>
                    <Title order={4}>Project Members</Title>
                    <Text size="sm" c="dimmed">
                      Manage portal users who can access this project.
                    </Text>
                  </div>
                  <Group gap="sm">
                    <Badge variant="light">{members.length} members</Badge>
                    {isManager ? (
                      <Menu position="bottom-end" shadow="md">
                        <Menu.Target>
                          <SectionMenuButton label="Member actions" />
                        </Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Item onClick={() => setMemberModalOpen(true)}>Add Member</Menu.Item>
                          <Menu.Item onClick={() => setMemberEditMode((prev) => !prev)}>
                            {memberEditMode ? "Finish Member Edit" : "Manage Members"}
                          </Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
                    ) : null}
                  </Group>
                </Group>

                <Table withTableBorder highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Name</Table.Th>
                      <Table.Th>Email</Table.Th>
                      <Table.Th>Role</Table.Th>
                      {isManager ? <Table.Th /> : null}
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {members.map((member) => {
                      const cannotRemoveSelf = member.userId === currentUser?.sub && member.role === "manager" && managerCount <= 1;

                      return (
                        <Table.Tr key={member.id}>
                          <Table.Td>{member.displayName ?? member.userId}</Table.Td>
                          <Table.Td>{member.email ?? "-"}</Table.Td>
                          <Table.Td>
                            {memberEditMode && isManager ? (
                              <Select
                                data={[
                                  { value: "member", label: "member" },
                                  { value: "manager", label: "manager" },
                                ]}
                                value={member.role}
                                onChange={(value) => {
                                  if (value && value !== member.role) {
                                    void updateMemberRole(member.userId, value);
                                  }
                                }}
                                allowDeselect={false}
                              />
                            ) : (
                              <Badge variant="light">{member.role}</Badge>
                            )}
                          </Table.Td>
                          {isManager && memberEditMode ? (
                            <Table.Td>
                              <Button
                                size="xs"
                                color="red"
                                variant="subtle"
                                disabled={cannotRemoveSelf || updatingMembers}
                                onClick={() => void removeMember(member.userId)}
                              >
                                Remove
                              </Button>
                            </Table.Td>
                          ) : null}
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              </Stack>
            </Paper>
          </Stack>
        ) : null}

        {activeMenu === "Repo" ? (
          <Stack>
            <Paper withBorder p="md" radius="md">
              <Stack>
                <Group justify="space-between" align="end">
                  <Title order={4}>Repositories</Title>
                  <Button variant="light" loading={loadingRepos} onClick={() => void loadRepos()}>
                    Refresh
                  </Button>
                </Group>

                <Group align="end">
                  <TextInput
                    style={{ flex: 1 }}
                    label="New Repo"
                    placeholder="api-server"
                    value={newRepoName}
                    onChange={(event) => setNewRepoName(event.currentTarget.value)}
                  />
                  <Button loading={creatingRepo} onClick={() => void createRepo()}>
                    Create Repo
                  </Button>
                </Group>
              </Stack>
            </Paper>

            {repos.length === 0 ? (
              <Paper withBorder p="md" radius="md">
                <Text size="sm" c="dimmed">
                  No repositories yet.
                </Text>
              </Paper>
            ) : (
              repos.map((repo) => {
                const workspace = repoWorkspaces.get(repo.id);

                return (
                  <Card key={repo.id} withBorder radius="md" padding="lg">
                    <Stack>
                      <Group justify="space-between" align="start">
                        <Stack gap={2}>
                          <Text fw={700}>{repo.repoName}</Text>
                          <Text size="sm" c="dimmed">
                            {repo.namespacePath}
                          </Text>
                          <Text size="sm">{repo.cloneUrl ?? "Remote clone URL pending"}</Text>
                        </Stack>
                      </Group>

                      <Divider />

                      <Stack gap={6}>
                        <Text fw={600}>Workspace</Text>
                        {!workspace ? (
                          <Group justify="space-between" align="center">
                            <Text size="sm" c="dimmed">
                              No workspace created for this repo yet.
                            </Text>
                            <Button size="xs" onClick={() => openWorkspaceModal(repo)}>
                              Create
                            </Button>
                          </Group>
                        ) : (
                          <Group justify="space-between" align="center">
                            <Group gap="xs">
                              <Badge color="teal" variant="light">
                                {workspace.runtime}
                              </Badge>
                              <Badge variant="light">{workspace.status}</Badge>
                            </Group>
                            <Box pos="relative">
                              <LoadingOverlay
                                visible={workspace.status === "provisioning"}
                                zIndex={10}
                                overlayProps={{ radius: "sm", blur: 1 }}
                              />
                              <Group gap="xs">
                                <Button
                                  size="xs"
                                  variant="default"
                                  disabled={!["running", "stopped"].includes(workspace.status)}
                                  loading={restartingWorkspaceId === workspace.id}
                                  onClick={() =>
                                    workspace.status === "stopped"
                                      ? void restartWorkspace(workspace)
                                      : window.open(workspace.endpointUrl, "_blank", "noopener,noreferrer")
                                  }
                                >
                                  {workspace.status === "stopped" ? "Restart" : "Open"}
                                </Button>
                                <Button
                                  size="xs"
                                  variant="light"
                                  color="yellow"
                                  loading={stoppingWorkspaceId === workspace.id}
                                  disabled={workspace.status !== "running"}
                                  onClick={() => void stopWorkspace(workspace)}
                                >
                                  Stop
                                </Button>
                                <Button size="xs" variant="light" onClick={() => openWorkspaceModal(repo, workspace)}>
                                  Edit
                                </Button>
                                <Button
                                  size="xs"
                                  color="red"
                                  variant="light"
                                  loading={deletingWorkspaceId === workspace.id}
                                  onClick={() => setWorkspaceDeleteTarget(workspace)}
                                >
                                  Delete
                                </Button>
                              </Group>
                            </Box>
                          </Group>
                        )}
                      </Stack>
                    </Stack>
                  </Card>
                );
              })
            )}
          </Stack>
        ) : null}

        {activeMenu === "LLM" ? (
          <Paper withBorder p="md" radius="md">
            <Stack>
              <Group justify="space-between">
                <Title order={4}>LLM</Title>
                <Button variant="light" loading={loadingLiteLlm} onClick={() => void loadLiteLlm()}>
                  Refresh
                </Button>
              </Group>

              <Group align="end">
                <TextInput
                  style={{ flex: 1 }}
                  label="Key Alias"
                  placeholder="team-key"
                  value={newKeyAlias}
                  onChange={(event) => setNewKeyAlias(event.currentTarget.value)}
                />
                <Button loading={issuingKey} onClick={() => void issueLiteLlmKey()}>
                  Issue Key
                </Button>
              </Group>

              <Divider />

              <Stack gap={4}>
                <Text fw={600}>Models</Text>
                {models.length === 0 ? (
                  <Text size="sm" c="dimmed">
                    No model metadata loaded yet.
                  </Text>
                ) : (
                  models.map((model) => (
                    <Text size="sm" key={model.id}>
                      {model.modelName}
                    </Text>
                  ))
                )}
              </Stack>

              <Stack gap={4}>
                <Text fw={600}>Issued Keys</Text>
                {keys.length === 0 ? (
                  <Text size="sm" c="dimmed">
                    No keys issued yet.
                  </Text>
                ) : (
                  keys.map((key) => (
                    <Text size="sm" key={key.id}>
                      {key.keyAlias} ({new Date(key.createdAt).toLocaleString()})
                    </Text>
                  ))
                )}
              </Stack>
            </Stack>
          </Paper>
        ) : null}
      </Stack>

      <Modal
        opened={workspaceModal !== null}
        onClose={() => setWorkspaceModal(null)}
        title={workspaceModal?.workspace ? "Edit VS Code Workspace" : "Create VS Code Workspace"}
        centered
      >
        <Stack>
          <Text size="sm">
            Repo: <strong>{workspaceModal?.repo.repoName}</strong>
          </Text>
          <Select
            label="Runtime"
            data={runtimeOptions}
            value={workspaceRuntime}
            onChange={setWorkspaceRuntime}
            allowDeselect={false}
          />
          <Button loading={creatingWorkspace} onClick={() => void handleWorkspaceSubmit()}>
            {workspaceModal?.workspace ? "Save and Open" : "Create and Open"}
          </Button>
        </Stack>
      </Modal>

      <Modal
        opened={workspaceDeleteTarget !== null}
        onClose={() => setWorkspaceDeleteTarget(null)}
        title="Delete Workspace"
        centered
      >
        <Stack>
          <Text size="sm">
            Delete workspace for <strong>{workspaceDeleteTarget?.repoName}</strong>? This removes the current VS Code
            workspace and its persistent volume.
          </Text>
          <Group justify="end">
            <Button variant="default" onClick={() => setWorkspaceDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              color="red"
              loading={workspaceDeleteTarget ? deletingWorkspaceId === workspaceDeleteTarget.id : false}
              onClick={() => (workspaceDeleteTarget ? void deleteWorkspace(workspaceDeleteTarget) : undefined)}
            >
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} title="Delete Project" centered>
        <Stack>
          <Text size="sm">
            Delete <strong>{project?.name}</strong>? This cannot be undone.
          </Text>
          <Group justify="end">
            <Button variant="default" onClick={() => setDeleteModalOpen(false)}>
              Cancel
            </Button>
            <Button color="red" loading={deletingProject} onClick={() => void deleteProject()}>
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={editProjectOpen} onClose={() => setEditProjectOpen(false)} title="Edit Project" centered>
        <Stack>
          <TextInput label="Project Name" value={editName} onChange={(event) => setEditName(event.currentTarget.value)} />
          <TextInput
            label="Project Description"
            value={editDescription}
            onChange={(event) => setEditDescription(event.currentTarget.value)}
          />
          <Group justify="end">
            <Button variant="default" onClick={() => setEditProjectOpen(false)}>
              Cancel
            </Button>
            <Button loading={savingProject} onClick={() => void updateProject()}>
              Save
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={memberModalOpen} onClose={() => setMemberModalOpen(false)} title="Add Project Member" centered>
        <Stack>
          <Select
            label="Portal User"
            placeholder="Select user"
            data={availableUsers.map((user) => ({
              value: user.id,
              label: `${user.displayName} (${user.email})`,
            }))}
            value={selectedUserId}
            onChange={setSelectedUserId}
            searchable
          />
          <Select
            label="Role"
            data={[
              { value: "member", label: "member" },
              { value: "manager", label: "manager" },
            ]}
            value={selectedRole}
            onChange={setSelectedRole}
            allowDeselect={false}
          />
          <Group justify="end">
            <Button variant="default" onClick={() => setMemberModalOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={updatingMembers}
              onClick={async () => {
                await addMember();
                setMemberModalOpen(false);
              }}
            >
              Add Member
            </Button>
          </Group>
        </Stack>
      </Modal>
    </AppFrame>
  );
}
