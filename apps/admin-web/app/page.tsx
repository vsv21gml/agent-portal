"use client";

import { Badge, Drawer, Group, Paper, Pagination, ScrollArea, Stack, Table, Tabs, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useEffect, useMemo, useState } from "react";
import { AdminFrame } from "../src/components/admin-frame";
import { apiFetch } from "../src/lib/api-client";

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

const PAGE_SIZE = 8;

export default function AdminPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [auditLogs, setAuditLogs] = useState<LogRow[]>([]);
  const [accessLogs, setAccessLogs] = useState<LogRow[]>([]);
  const [resourceRows, setResourceRows] = useState<ResourceStatus[]>([]);
  const [groups, setGroups] = useState<GitlabGroup[]>([]);
  const [repos, setRepos] = useState<GitlabRepo[]>([]);
  const [activePage, setActivePage] = useState(1);
  const [detailProject, setDetailProject] = useState<ProjectRow | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
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
      } catch {
        notifications.show({
          title: "Load failed",
          message: "관리자 데이터를 불러오지 못했습니다.",
          color: "red",
        });
      }
    };
    void load();
  }, []);

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

      <Drawer opened={detailProject !== null} onClose={() => setDetailProject(null)} title="Project Detail" position="right">
        {detailProject ? (
          <Stack>
            <Text fw={700}>{detailProject.name}</Text>
            <Text c="dimmed">{detailProject.slug}</Text>
            <Text size="sm">ID: {detailProject.id}</Text>
            <Text size="sm">Created: {new Date(detailProject.createdAt).toLocaleString()}</Text>
          </Stack>
        ) : null}
      </Drawer>
    </AdminFrame>
  );
}
