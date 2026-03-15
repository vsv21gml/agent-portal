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
  Textarea,
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

type ProjectOverview = {
  project: Project;
  members: ProjectMember[];
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

type AgentDeployment = {
  id: string;
  repoId: string;
  agentName: string;
  description: string;
  dockerfilePath: string;
  ecrRepository: string;
  imageUrl: string;
  endpointUrl: string;
  status: string;
  lastMessage: string | null;
  createdAt: string;
};

type PlaygroundMessage = {
  id: string;
  role: "user" | "agent";
  content: string;
};

const menuItems = ["Info", "Repo", "Agent", "Play Ground"] as const;
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
  const [creatingRepo, setCreatingRepo] = useState(false);
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [deletingWorkspaceId, setDeletingWorkspaceId] = useState<string | null>(null);
  const [stoppingWorkspaceId, setStoppingWorkspaceId] = useState<string | null>(null);
  const [restartingWorkspaceId, setRestartingWorkspaceId] = useState<string | null>(null);
  const [workspaceDeleteTarget, setWorkspaceDeleteTarget] = useState<WorkspaceSession | null>(null);
  const [updatingMembers, setUpdatingMembers] = useState(false);
  const [deletingProject, setDeletingProject] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [availableUsers, setAvailableUsers] = useState<PortalUser[]>([]);
  const [repos, setRepos] = useState<GitRepo[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceSession[]>([]);
  const [newRepoName, setNewRepoName] = useState("");
  const [workspaceRuntime, setWorkspaceRuntime] = useState<string | null>("NODE22");
  const [workspaceModal, setWorkspaceModal] = useState<WorkspaceModalState>(null);
  const [agents, setAgents] = useState<AgentDeployment[]>([]);
  const [agentModalOpen, setAgentModalOpen] = useState(false);
  const [agentName, setAgentName] = useState("");
  const [agentDescription, setAgentDescription] = useState("");
  const [agentRepoId, setAgentRepoId] = useState<string | null>(null);
  const [agentDockerfilePath, setAgentDockerfilePath] = useState("./Dockerfile");
  const [deployingAgent, setDeployingAgent] = useState(false);
  const [logsTarget, setLogsTarget] = useState<AgentDeployment | null>(null);
  const [agentLogs, setAgentLogs] = useState("");
  const [loadingAgentLogs, setLoadingAgentLogs] = useState(false);
  const [selectedPlaygroundAgentId, setSelectedPlaygroundAgentId] = useState<string | null>(null);
  const [playgroundInput, setPlaygroundInput] = useState("");
  const [playgroundMessages, setPlaygroundMessages] = useState<Record<string, PlaygroundMessage[]>>({});
  const [sendingPlaygroundMessage, setSendingPlaygroundMessage] = useState(false);
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

  const runningWorkspaces = useMemo(
    () => workspaces.filter((workspace) => workspace.status === "running"),
    [workspaces],
  );

  const runningWorkspaceCpu = runningWorkspaces.length;
  const runningWorkspaceMemoryGi = runningWorkspaces.length * 4;
  const repoOptions = useMemo(
    () => repos.map((repo) => ({ value: repo.id, label: repo.repoName })),
    [repos],
  );
  const runningAgents = useMemo(
    () => agents.filter((agent) => agent.status === "running"),
    [agents],
  );
  const selectedPlaygroundAgent = useMemo(
    () => runningAgents.find((agent) => agent.id === selectedPlaygroundAgentId) ?? null,
    [runningAgents, selectedPlaygroundAgentId],
  );
  const currentPlaygroundMessages = useMemo(
    () => (selectedPlaygroundAgentId ? playgroundMessages[selectedPlaygroundAgentId] ?? [] : []),
    [playgroundMessages, selectedPlaygroundAgentId],
  );

  const loadMembersAndProject = async (targetProjectId: string) => {
    const overview = await apiFetch<ProjectOverview>(`projects/${targetProjectId}/overview`);
    setProject(overview.project);
    setEditName(overview.project.name);
    setEditDescription(overview.project.description);
    setMembers(overview.members);
    return overview;
  };

  const loadRepos = async (targetProject?: Project | null) => {
    const activeProject = targetProject ?? project;
    if (!activeProject) {
      return;
    }

    setLoadingRepos(true);
    try {
      const [, repoRows, workspaceRows] = await Promise.all([
        apiFetch(`gitlab/projects/${activeProject.id}/group`, { method: "POST" }),
        apiFetch<GitRepo[]>(`gitlab/projects/${activeProject.id}/repos`),
        apiFetch<WorkspaceSession[]>(`workspaces/project/${activeProject.id}`),
      ]);
      setRepos(repoRows);
      setWorkspaces(workspaceRows);
    } catch {
      toastError("Failed to load repositories.");
    } finally {
      setLoadingRepos(false);
    }
  };

  const loadAgents = async (targetProject?: Project | null) => {
    const activeProject = targetProject ?? project;
    if (!activeProject) {
      return;
    }

    try {
      const agentRows = await apiFetch<AgentDeployment[]>(`agents/project/${activeProject.id}`);
      setAgents(agentRows);
    } catch {
      toastError("Failed to load agents.");
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
        await loadAgents(overview.project);
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

  useEffect(() => {
    if (!runningAgents.length) {
      setSelectedPlaygroundAgentId(null);
      return;
    }

    if (!selectedPlaygroundAgentId || !runningAgents.some((agent) => agent.id === selectedPlaygroundAgentId)) {
      setSelectedPlaygroundAgentId(runningAgents[0].id);
    }
  }, [runningAgents, selectedPlaygroundAgentId]);

  const refreshWorkspace = async (workspaceId: string) => {
    const latest = await apiFetch<WorkspaceSession>(`workspaces/${workspaceId}`);
    setWorkspaces((prev) => [latest, ...prev.filter((item) => item.id !== latest.id)]);
    return latest;
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

  const deployAgent = async () => {
    if (!project || !agentName.trim() || !agentRepoId) {
      toastError("Fill in agent name and repo.");
      return;
    }

    setDeployingAgent(true);
    try {
      const created = await apiFetch<AgentDeployment>("agents", {
        method: "POST",
        body: JSON.stringify({
          projectId: project.id,
          repoId: agentRepoId,
          agentName: agentName.trim(),
          description: agentDescription.trim(),
          dockerfilePath: agentDockerfilePath.trim() || "./Dockerfile",
        }),
      });
      setAgents((prev) => [created, ...prev.filter((item) => item.id !== created.id)]);
      setAgentModalOpen(false);
      setAgentName("");
      setAgentDescription("");
      setAgentRepoId(null);
      setAgentDockerfilePath("./Dockerfile");
      toastSuccess("Agent deployment requested.");
    } catch {
      toastError("Failed to deploy agent.");
    } finally {
      setDeployingAgent(false);
    }
  };

  const loadAgentLogs = async (agent: AgentDeployment) => {
    setLogsTarget(agent);
    setLoadingAgentLogs(true);
    try {
      const result = await apiFetch<{ logs: string }>(`agents/${agent.id}/logs`);
      setAgentLogs(result.logs);
    } catch {
      setAgentLogs("");
      toastError("Failed to load agent logs.");
    } finally {
      setLoadingAgentLogs(false);
    }
  };

  const sendPlaygroundMessage = async () => {
    if (!selectedPlaygroundAgent || !playgroundInput.trim()) {
      return;
    }

    const agentId = selectedPlaygroundAgent.id;
    const userMessage: PlaygroundMessage = {
      id: `${Date.now()}-user`,
      role: "user",
      content: playgroundInput.trim(),
    };
    setPlaygroundMessages((prev) => ({
      ...prev,
      [agentId]: [...(prev[agentId] ?? []), userMessage],
    }));
    setPlaygroundInput("");
    setSendingPlaygroundMessage(true);

    try {
      const result = await apiFetch<{ reply: string; endpoint: string }>(`agents/${agentId}/chat`, {
        method: "POST",
        body: JSON.stringify({ message: userMessage.content }),
      });
      const agentMessage: PlaygroundMessage = {
        id: `${Date.now()}-agent`,
        role: "agent",
        content: result.reply,
      };
      setPlaygroundMessages((prev) => ({
        ...prev,
        [agentId]: [...(prev[agentId] ?? []), agentMessage],
      }));
    } catch {
      toastError("Failed to chat with agent.");
    } finally {
      setSendingPlaygroundMessage(false);
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
        const latest = await refreshWorkspace(updated.id);
        window.open(latest.endpointUrl, "_blank", "noopener,noreferrer");
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
        const latest = await refreshWorkspace(created.id);
        window.open(latest.endpointUrl, "_blank", "noopener,noreferrer");
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
      const latest = await refreshWorkspace(restarted.id);
      window.open(latest.endpointUrl, "_blank", "noopener,noreferrer");
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
                      Git / Repos
                    </Text>
                    <Text mt="sm" fw={600}>
                      {repos.length} repos
                    </Text>
                  </Card>
                  <Card withBorder radius="md" padding="lg">
                    <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
                      Running VS Code
                    </Text>
                    <Text mt="sm" fw={600}>
                      {runningWorkspaces.length} sessions
                    </Text>
                  </Card>
                  <Card withBorder radius="md" padding="lg">
                    <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
                      VS Code Usage
                    </Text>
                    <Text mt="sm" fw={600}>
                      CPU {runningWorkspaceCpu} / MEM {runningWorkspaceMemoryGi} Gi
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
                        </Stack>
                      </Group>

                      <Divider />

                      <Stack gap={6}>
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

        {activeMenu === "Agent" ? (
          <Stack>
            <Paper withBorder p="md" radius="md">
              <Group justify="space-between" align="center">
                <div>
                  <Title order={4}>Agents</Title>
                  <Text size="sm" c="dimmed">
                    Build, deploy, and inspect project agents.
                  </Text>
                </div>
                <Group gap="sm">
                  <Button variant="light" onClick={() => void loadAgents()}>
                    Refresh
                  </Button>
                  <Button onClick={() => setAgentModalOpen(true)}>Deploy</Button>
                </Group>
              </Group>
            </Paper>

            <Paper withBorder p="md" radius="md">
              <Table withTableBorder highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Agent</Table.Th>
                    <Table.Th>Repo</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Image</Table.Th>
                    <Table.Th>Endpoint</Table.Th>
                    <Table.Th>Message</Table.Th>
                    <Table.Th />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {agents.length ? (
                    agents.map((agent) => (
                      <Table.Tr key={agent.id}>
                        <Table.Td>
                          <Text fw={600}>{agent.agentName}</Text>
                          <Text size="sm" c="dimmed">
                            {agent.description || "-"}
                          </Text>
                        </Table.Td>
                        <Table.Td>{repos.find((repo) => repo.id === agent.repoId)?.repoName ?? agent.repoId}</Table.Td>
                        <Table.Td>
                          <Badge variant="light">{agent.status}</Badge>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">{agent.imageUrl}</Text>
                        </Table.Td>
                        <Table.Td>
                          {agent.status === "running" ? (
                            <Text component="a" href={agent.endpointUrl} target="_blank" rel="noreferrer" size="sm">
                              {agent.endpointUrl}
                            </Text>
                          ) : (
                            <Text size="sm" c="dimmed">
                              {agent.endpointUrl}
                            </Text>
                          )}
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">{agent.lastMessage ?? "-"}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Button size="xs" variant="light" onClick={() => void loadAgentLogs(agent)}>
                            Logs
                          </Button>
                        </Table.Td>
                      </Table.Tr>
                    ))
                  ) : (
                    <Table.Tr>
                      <Table.Td colSpan={7}>
                        <Text size="sm" c="dimmed">
                          No agents deployed yet.
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  )}
                </Table.Tbody>
              </Table>
            </Paper>
          </Stack>
        ) : null}

        {activeMenu === "Play Ground" ? (
          <Stack>
            <Paper withBorder p="md" radius="md">
              <Stack gap="xs">
                <Group justify="space-between" align="center">
                  <div>
                    <Title order={4}>Play Ground</Title>
                    <Text size="sm" c="dimmed">
                      Chat with deployed agents through A2A.
                    </Text>
                  </div>
                  <Button variant="light" onClick={() => void loadAgents()}>
                    Refresh Agents
                  </Button>
                </Group>
              </Stack>
            </Paper>

            <SimpleGrid cols={{ base: 1, xl: 3 }} spacing="md">
              <Stack>
                {runningAgents.length ? (
                  runningAgents.map((agent) => (
                    <Card
                      key={agent.id}
                      withBorder
                      radius="md"
                      padding="lg"
                      style={{
                        cursor: "pointer",
                        borderColor: selectedPlaygroundAgentId === agent.id ? "var(--mantine-color-blue-6)" : undefined,
                      }}
                      onClick={() => setSelectedPlaygroundAgentId(agent.id)}
                    >
                      <Stack gap={6}>
                        <Group justify="space-between" align="center">
                          <Text fw={700}>{agent.agentName}</Text>
                          <Badge variant="light">{agent.status}</Badge>
                        </Group>
                        <Text size="sm" c="dimmed">
                          {agent.description || "No description"}
                        </Text>
                        <Text size="sm">{repos.find((repo) => repo.id === agent.repoId)?.repoName ?? agent.repoId}</Text>
                      </Stack>
                    </Card>
                  ))
                ) : (
                  <Paper withBorder p="md" radius="md">
                    <Text size="sm" c="dimmed">
                      No running agents available.
                    </Text>
                  </Paper>
                )}
              </Stack>

              <Paper withBorder p="md" radius="md" style={{ gridColumn: "span 2" }}>
                {selectedPlaygroundAgent ? (
                  <Stack>
                    <Group justify="space-between" align="center">
                      <div>
                        <Title order={4}>{selectedPlaygroundAgent.agentName}</Title>
                        <Text size="sm" c="dimmed">
                          {selectedPlaygroundAgent.endpointUrl}
                        </Text>
                      </div>
                      <Badge variant="light">A2A</Badge>
                    </Group>

                    <Paper withBorder p="md" radius="md" style={{ minHeight: 360, maxHeight: 360, overflow: "auto" }}>
                      <Stack gap="sm">
                        {currentPlaygroundMessages.length ? (
                          currentPlaygroundMessages.map((message) => (
                            <Paper
                              key={message.id}
                              p="sm"
                              radius="md"
                              withBorder
                              style={{
                                marginLeft: message.role === "user" ? "auto" : undefined,
                                maxWidth: "85%",
                                background: message.role === "user" ? "rgba(12, 74, 110, 0.08)" : undefined,
                              }}
                            >
                              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                                {message.role === "user" ? "You" : selectedPlaygroundAgent.agentName}
                              </Text>
                              <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                                {message.content}
                              </Text>
                            </Paper>
                          ))
                        ) : (
                          <Text size="sm" c="dimmed">
                            Start a conversation with this agent.
                          </Text>
                        )}
                      </Stack>
                    </Paper>

                    <Textarea
                      label="Message"
                      minRows={4}
                      value={playgroundInput}
                      onChange={(event) => setPlaygroundInput(event.currentTarget.value)}
                      placeholder="Ask this agent something..."
                    />
                    <Group justify="end">
                      <Button loading={sendingPlaygroundMessage} onClick={() => void sendPlaygroundMessage()}>
                        Send
                      </Button>
                    </Group>
                  </Stack>
                ) : (
                  <Stack justify="center" align="center" style={{ minHeight: 420 }}>
                    <Text size="sm" c="dimmed">
                      Select a running agent to start chatting.
                    </Text>
                  </Stack>
                )}
              </Paper>
            </SimpleGrid>
          </Stack>
        ) : null}

      </Stack>

      <Modal opened={agentModalOpen} onClose={() => setAgentModalOpen(false)} title="Deploy Agent" centered>
        <Stack>
          <TextInput label="Agent Name" value={agentName} onChange={(event) => setAgentName(event.currentTarget.value)} />
          <TextInput
            label="Agent Description"
            value={agentDescription}
            onChange={(event) => setAgentDescription(event.currentTarget.value)}
          />
          <Select label="Repository" data={repoOptions} value={agentRepoId} onChange={setAgentRepoId} searchable />
          <TextInput
            label="Dockerfile Path"
            value={agentDockerfilePath}
            onChange={(event) => setAgentDockerfilePath(event.currentTarget.value)}
          />
          <Button loading={deployingAgent} onClick={() => void deployAgent()}>
            Deploy Agent
          </Button>
        </Stack>
      </Modal>

      <Modal opened={logsTarget !== null} onClose={() => setLogsTarget(null)} title={logsTarget ? `${logsTarget.agentName} logs` : "Agent logs"} size="xl" centered>
        <Stack>
          <Button variant="light" loading={loadingAgentLogs} onClick={() => (logsTarget ? void loadAgentLogs(logsTarget) : undefined)}>
            Refresh Logs
          </Button>
          <Paper withBorder p="md" style={{ maxHeight: 480, overflow: "auto", whiteSpace: "pre-wrap" }}>
            <Text size="sm">{agentLogs || "No logs yet."}</Text>
          </Paper>
        </Stack>
      </Modal>

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
