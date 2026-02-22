"use client";

import { Badge, Button, Drawer, Group, LoadingOverlay, Paper, Pagination, ScrollArea, Stack, Table, Tabs, Text, TextInput, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminFrame } from "../src/components/admin-frame";
import { ApiError, apiFetch } from "../src/lib/api-client";
import { clearToken } from "../src/lib/auth";

type UserRow = {
  id: string;
  email: string;
  displayName: string;
  globalRole: string;
};

type ProjectRow = {
  id: string;
  name: string;
  slug: string;
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

type LlmKey = {
  id: string;
  projectId: string;
  teamId: string;
  ownerUserId: string;
  keyAlias: string;
  createdAt: string;
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

const PAGE_SIZE = 8;

export default function AdminPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [auditLogs, setAuditLogs] = useState<LogRow[]>([]);
  const [accessLogs, setAccessLogs] = useState<LogRow[]>([]);
  const [resourceRows, setResourceRows] = useState<ResourceStatus[]>([]);
  const [groups, setGroups] = useState<GitlabGroup[]>([]);
  const [repos, setRepos] = useState<GitlabRepo[]>([]);
  const [llmKeys, setLlmKeys] = useState<LlmKey[]>([]);
  const [vectorKeys, setVectorKeys] = useState<VectorKey[]>([]);
  const [activePage, setActivePage] = useState(1);
  const [detailProject, setDetailProject] = useState<ProjectRow | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [errors, setErrors] = useState<{ name?: string; slug?: string }>({});
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

        const [u, p, audit, access, groupRows] = await Promise.all([
          apiFetch<UserRow[]>("admin/users"),
          apiFetch<ProjectRow[]>("admin/projects"),
          apiFetch<LogRow[]>("admin/logs/audit"),
          apiFetch<LogRow[]>("admin/logs/access"),
          apiFetch<GitlabGroup[]>("admin/gitlab/groups"),
        ]);
        setUsers(u);
        setProjects(p);
        setAuditLogs(audit);
        setAccessLogs(access);
        setGroups(groupRows);

        const statuses = await Promise.all(
          p.map(async (project) => {
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
        setResourceRows(statuses);

        const reposByProject = await Promise.all(
          p.map((project) => apiFetch<GitlabRepo[]>(`admin/projects/${project.id}/gitlab/repos`)),
        );
        setRepos(reposByProject.flat());

        const llmKeysByProject = await Promise.all(
          p.map((project) => apiFetch<LlmKey[]>(`llm/projects/${project.id}/keys`)),
        );
        setLlmKeys(llmKeysByProject.flat());

        const vectorKeysByProject = await Promise.all(
          p.map((project) => apiFetch<VectorKey[]>(`vectordb/projects/${project.id}/keys`)),
        );
        setVectorKeys(vectorKeysByProject.flat());
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          router.replace("/login?next=/");
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
  }, [router]);

  const createGitlabRepo = async () => {
    if (!detailProject) {
      return;
    }
    if (!gitlabRepoName.trim()) {
      setGitlabError("레포 이름을 입력하세요.");
      return;
    }
    setGitlabError(null);
    try {
      await apiFetch(`gitlab/projects/${detailProject.id}/group/${detailProject.slug}`, { method: "POST" });
      const created = await apiFetch<GitlabRepo>(`gitlab/projects/${detailProject.id}/repos`, {
        method: "POST",
        body: JSON.stringify({ repoName: gitlabRepoName.trim() }),
      });
      setRepos((prev) => [created, ...prev]);
      setGitlabRepoName("");
      setGitlabOpen(false);
      notifications.show({ title: "Created", message: "GitLab 레포를 생성했습니다.", color: "teal" });
    } catch {
      notifications.show({ title: "Failed", message: "GitLab 레포 생성에 실패했습니다.", color: "red" });
    }
  };

  const issueLlmKey = async () => {
    if (!detailProject) {
      return;
    }
    if (!llmAlias.trim()) {
      setLlmError("키 별칭을 입력하세요.");
      return;
    }
    setLlmError(null);
    try {
      await apiFetch(`llm/projects/${detailProject.id}/team/${detailProject.slug}`, { method: "POST" });
      const created = await apiFetch<LlmKey>(`llm/projects/${detailProject.id}/keys`, {
        method: "POST",
        body: JSON.stringify({ keyAlias: llmAlias.trim() }),
      });
      setLlmKeys((prev) => [created, ...prev]);
      setLlmAlias("");
      setLlmOpen(false);
      notifications.show({ title: "Issued", message: "LiteLLM 키를 발급했습니다.", color: "teal" });
    } catch {
      notifications.show({ title: "Failed", message: "LiteLLM 키 발급에 실패했습니다.", color: "red" });
    }
  };

  const issueVectorKey = async () => {
    if (!detailProject) {
      return;
    }
    if (!vectorAlias.trim()) {
      setVectorError("키 별칭을 입력하세요.");
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
      if (created.apiKey) {
        notifications.show({ title: "Issued", message: `VectorDB 키 발급: ${created.apiKey}`, color: "teal" });
      } else {
        notifications.show({ title: "Issued", message: "VectorDB 키를 발급했습니다.", color: "teal" });
      }
    } catch {
      notifications.show({ title: "Failed", message: "VectorDB 키 발급에 실패했습니다.", color: "red" });
    }
  };

  const createProject = async () => {
    const nextErrors: { name?: string; slug?: string } = {};
    if (!newName.trim()) {
      nextErrors.name = "프로젝트 이름을 입력하세요.";
    }
    if (!newSlug.trim()) {
      nextErrors.slug = "Slug를 입력하세요.";
    } else if (!/^[a-z0-9-]+$/.test(newSlug.trim())) {
      nextErrors.slug = "Slug는 소문자, 숫자, 하이픈만 가능합니다.";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    try {
      const created = await apiFetch<ProjectRow>("projects", {
        method: "POST",
        body: JSON.stringify({ name: newName.trim(), slug: newSlug.trim() }),
      });
      setProjects((prev) => [created, ...prev]);
      setNewName("");
      setNewSlug("");
      setErrors({});
      setCreateOpen(false);
      notifications.show({ title: "Created", message: "프로젝트를 생성했습니다.", color: "teal" });
    } catch {
      notifications.show({ title: "Failed", message: "프로젝트 생성에 실패했습니다.", color: "red" });
    }
  };

  const updateRole = async (userId: string, role: "admin" | "user") => {
    try {
      await apiFetch(`auth/users/${userId}/role/${role}`, { method: "PATCH" });
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, globalRole: role } : u)));
      notifications.show({ title: "Updated", message: "역할이 변경되었습니다.", color: "teal" });
    } catch {
      notifications.show({ title: "Failed", message: "역할 변경에 실패했습니다.", color: "red" });
    }
  };

  const projectPages = Math.max(1, Math.ceil(projects.length / PAGE_SIZE));
  const pagedProjects = useMemo(() => {
    const start = (activePage - 1) * PAGE_SIZE;
    return projects.slice(start, start + PAGE_SIZE);
  }, [activePage, projects]);

  return (
    <AdminFrame>
      <Stack pos="relative">
        <LoadingOverlay visible={authChecking} zIndex={1000} overlayProps={{ radius: "sm", blur: 2 }} />
        <Group justify="end" mb="md">
          <Button onClick={() => setCreateOpen(true)}>New Project</Button>
        </Group>
        <Tabs defaultValue="users">
        <Tabs.List>
          <Tabs.Tab value="users">멤버/역할관리</Tabs.Tab>
          <Tabs.Tab value="projects">프로젝트관리</Tabs.Tab>
          <Tabs.Tab value="resources">노트북 자원현황</Tabs.Tab>
          <Tabs.Tab value="gitlab">GitLab 현황</Tabs.Tab>
          <Tabs.Tab value="audit">오딧로그</Tabs.Tab>
          <Tabs.Tab value="access">엑세스로그</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="users" pt="md">
          <Paper withBorder p="md">
            <Title order={4}>Users</Title>
            <ScrollArea mt="sm">
              <Table withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Email</Table.Th>
                    <Table.Th>Name</Table.Th>
                    <Table.Th>Role</Table.Th>
                    <Table.Th>Action</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {users.map((u) => (
                    <Table.Tr key={u.id}>
                      <Table.Td>{u.email}</Table.Td>
                      <Table.Td>{u.displayName}</Table.Td>
                      <Table.Td>
                        <Badge>{u.globalRole}</Badge>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs">
                          <Badge variant="light" style={{ cursor: "pointer" }} onClick={() => void updateRole(u.id, "admin")}>
                            ADMIN
                          </Badge>
                          <Badge variant="light" style={{ cursor: "pointer" }} onClick={() => void updateRole(u.id, "user")}>
                            USER
                          </Badge>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          </Paper>
        </Tabs.Panel>
        <Tabs.Panel value="projects" pt="md">
          <Paper withBorder p="md">
            <Title order={4}>Projects</Title>
            <ScrollArea mt="sm">
              <Table withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Name</Table.Th>
                    <Table.Th>Slug</Table.Th>
                    <Table.Th>Created</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {pagedProjects.map((p) => (
                    <Table.Tr key={p.id} onClick={() => setDetailProject(p)} style={{ cursor: "pointer" }}>
                      <Table.Td>{p.name}</Table.Td>
                      <Table.Td>{p.slug}</Table.Td>
                      <Table.Td>{new Date(p.createdAt).toLocaleString()}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
            <Group justify="end" mt="md">
              <Pagination total={projectPages} value={activePage} onChange={setActivePage} />
            </Group>
          </Paper>
        </Tabs.Panel>
        <Tabs.Panel value="resources" pt="md">
          <Paper withBorder p="md">
            <Title order={4}>Notebook Resource Status</Title>
            <ScrollArea mt="sm">
              <Table withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Project</Table.Th>
                    <Table.Th>CPU(used/limit)</Table.Th>
                    <Table.Th>MEM Gi(used/limit)</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {resourceRows.map((r) => (
                    <Table.Tr key={r.projectId}>
                      <Table.Td>{r.projectName}</Table.Td>
                      <Table.Td>
                        {r.usage.usedCpu}/{r.limit.cpu}
                      </Table.Td>
                      <Table.Td>
                        {r.usage.usedMemoryGi}/{r.limit.memoryGi}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          </Paper>
        </Tabs.Panel>
        <Tabs.Panel value="gitlab" pt="md">
          <Paper withBorder p="md">
            <Title order={4}>GitLab Group Status</Title>
            <Stack mt="sm">
              {groups.map((g) => (
                <Text size="sm" key={g.id}>
                  {g.groupPath} (project: {g.projectId})
                </Text>
              ))}
            </Stack>
            <Title order={5} mt="md">
              GitLab Repo Status
            </Title>
            <Stack mt="sm">
              {repos.map((r) => (
                <Text size="sm" key={r.id}>
                  {r.namespacePath}
                </Text>
              ))}
            </Stack>
          </Paper>
        </Tabs.Panel>
        <Tabs.Panel value="audit" pt="md">
          <Paper withBorder p="md">
            <Title order={4}>Audit Logs</Title>
            <Stack mt="sm">
              {auditLogs.map((l) => (
                <Text key={l.id} size="sm">
                  [{new Date(l.createdAt).toLocaleString()}] {l.method} {l.path}
                </Text>
              ))}
            </Stack>
          </Paper>
        </Tabs.Panel>
        <Tabs.Panel value="access" pt="md">
          <Paper withBorder p="md">
            <Title order={4}>Access Logs</Title>
            <Stack mt="sm">
              {accessLogs.map((l) => (
                <Text key={l.id} size="sm">
                  [{new Date(l.createdAt).toLocaleString()}] {l.method} {l.path} ({l.statusCode} / {l.elapsedMs}ms)
                </Text>
              ))}
            </Stack>
          </Paper>
        </Tabs.Panel>
        </Tabs>
      </Stack>

      <Drawer opened={detailProject !== null} onClose={() => setDetailProject(null)} title="Project Detail" position="right">
        {detailProject ? (
          <Stack>
            <Text fw={700}>{detailProject.name}</Text>
            <Text c="dimmed">{detailProject.slug}</Text>
            <Text size="sm">ID: {detailProject.id}</Text>
            <Text size="sm">Created: {new Date(detailProject.createdAt).toLocaleString()}</Text>
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
          </Stack>
        ) : null}
      </Drawer>

      <Drawer opened={createOpen} onClose={() => setCreateOpen(false)} title="Create Project" position="right">
        <Stack>
          <TextInput
            label="Project Name"
            value={newName}
            onChange={(e) => setNewName(e.currentTarget.value)}
            error={errors.name}
            placeholder="My Project"
          />
          <TextInput
            label="Slug"
            value={newSlug}
            onChange={(e) => setNewSlug(e.currentTarget.value)}
            error={errors.slug}
            placeholder="my-project"
          />
          <Group justify="end">
            <Button variant="default" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createProject}>Create</Button>
          </Group>
        </Stack>
      </Drawer>

      <Drawer opened={gitlabOpen} onClose={() => setGitlabOpen(false)} title="Create GitLab Repo" position="right">
        <Stack>
          <TextInput
            label="Repo Name"
            value={gitlabRepoName}
            onChange={(e) => setGitlabRepoName(e.currentTarget.value)}
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

      <Drawer opened={llmOpen} onClose={() => setLlmOpen(false)} title="Issue LiteLLM Key" position="right">
        <Stack>
          <TextInput
            label="Key Alias"
            value={llmAlias}
            onChange={(e) => setLlmAlias(e.currentTarget.value)}
            error={llmError}
            placeholder="team-key"
          />
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
          <TextInput
            label="Key Alias"
            value={vectorAlias}
            onChange={(e) => setVectorAlias(e.currentTarget.value)}
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
