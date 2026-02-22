"use client";

import { Button, Group, Stack, TextInput } from "@mantine/core";
import { useEffect, useState } from "react";
import { AppFrame } from "../../src/components/app-frame";
import { ProjectTable } from "../../src/components/project-table";
import { apiFetch } from "../../src/lib/api-client";
import { toastError, toastSuccess } from "../../src/lib/toast";
import { Project } from "../../src/types/project";

export default function UserPortalPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");

  const loadProjects = async () => {
    try {
      const data = await apiFetch<Project[]>("projects");
      setProjects(data);
    } catch {
      toastError("프로젝트 목록을 불러오지 못했습니다.");
    }
  };

  useEffect(() => {
    void loadProjects();
  }, []);

  const createProject = async () => {
    try {
      await apiFetch<Project>("projects", {
        method: "POST",
        body: JSON.stringify({ name, slug }),
      });
      setName("");
      setSlug("");
      toastSuccess("프로젝트를 생성했습니다.");
      await loadProjects();
    } catch {
      toastError("프로젝트 생성에 실패했습니다.");
    }
  };

  return (
    <AppFrame title="User Portal">
      <Stack>
        <Group align="end">
          <TextInput label="Project Name" value={name} onChange={(e) => setName(e.currentTarget.value)} />
          <TextInput label="Slug" value={slug} onChange={(e) => setSlug(e.currentTarget.value)} />
          <Button onClick={createProject}>Create</Button>
        </Group>
        <ProjectTable projects={projects} title="My Projects" />
      </Stack>
    </AppFrame>
  );
}
