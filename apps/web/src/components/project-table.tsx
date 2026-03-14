"use client";

import Link from "next/link";
import { Badge, Card, Group, Pagination, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { useMemo, useState } from "react";
import { Project } from "../types/project";

type Props = {
  projects: Project[];
  title?: string;
};

const PAGE_SIZE = 8;

export function ProjectTable({ projects, title }: Props) {
  const [activePage, setActivePage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(projects.length / PAGE_SIZE));

  const rows = useMemo(() => {
    const start = (activePage - 1) * PAGE_SIZE;
    return projects.slice(start, start + PAGE_SIZE);
  }, [activePage, projects]);

  return (
    <Stack>
      {title ? <Title order={3}>{title}</Title> : null}
      {rows.length === 0 ? (
        <Card withBorder radius="lg" padding="xl">
          <Text c="dimmed">No projects yet.</Text>
        </Card>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, xl: 3 }} spacing="lg">
          {rows.map((project) => (
            <Card
              key={project.id}
              component={Link}
              href={`/portal/projects/${project.id}`}
              withBorder
              radius="lg"
              padding="lg"
            >
              <Stack gap="md">
                <Group justify="space-between" align="start">
                  <Stack gap={4}>
                    <Text fw={700} size="lg">
                      {project.name}
                    </Text>
                  </Stack>
                  <Badge color="cyan" variant="light">
                    Active
                  </Badge>
                </Group>
                <Text size="sm" lineClamp={3}>
                  {project.description || "No description"}
                </Text>
                <Text size="xs" c="dimmed">
                  {new Date(project.createdAt).toLocaleString()}
                </Text>
              </Stack>
            </Card>
          ))}
        </SimpleGrid>
      )}

      <Group justify="end" mt="md">
        <Pagination total={totalPages} value={activePage} onChange={setActivePage} />
      </Group>
    </Stack>
  );
}
