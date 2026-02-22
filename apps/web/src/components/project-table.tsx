"use client";

import { Badge, Button, Drawer, Group, Pagination, Paper, ScrollArea, Stack, Table, Text, Title } from "@mantine/core";
import { useMemo, useState } from "react";
import { Project } from "../types/project";

type Props = {
  projects: Project[];
  title: string;
};

const PAGE_SIZE = 8;

export function ProjectTable({ projects, title }: Props) {
  const [activePage, setActivePage] = useState(1);
  const [detail, setDetail] = useState<Project | null>(null);
  const totalPages = Math.max(1, Math.ceil(projects.length / PAGE_SIZE));

  const rows = useMemo(() => {
    const start = (activePage - 1) * PAGE_SIZE;
    return projects.slice(start, start + PAGE_SIZE);
  }, [activePage, projects]);

  return (
    <Stack>
      <Title order={3}>{title}</Title>
      <Paper withBorder radius="md" p="md">
        <ScrollArea>
          <Table striped highlightOnHover withTableBorder verticalSpacing="sm" miw={900}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Slug</Table.Th>
                <Table.Th>Created At</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((project) => (
                <Table.Tr key={project.id}>
                  <Table.Td>{project.name}</Table.Td>
                  <Table.Td>{project.slug}</Table.Td>
                  <Table.Td>{new Date(project.createdAt).toLocaleString()}</Table.Td>
                  <Table.Td>
                    <Badge color="cyan" variant="light">
                      Active
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Button variant="subtle" onClick={() => setDetail(project)}>
                      Detail
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>

        <Group justify="end" mt="md">
          <Pagination total={totalPages} value={activePage} onChange={setActivePage} />
        </Group>
      </Paper>

      <Drawer opened={detail !== null} onClose={() => setDetail(null)} position="right" size="md" title="Project Detail">
        {detail ? (
          <Stack>
            <Text fw={700}>{detail.name}</Text>
            <Text c="dimmed">{detail.slug}</Text>
            <Text size="sm">Project ID: {detail.id}</Text>
            <Text size="sm">Created: {new Date(detail.createdAt).toLocaleString()}</Text>
          </Stack>
        ) : null}
      </Drawer>
    </Stack>
  );
}
