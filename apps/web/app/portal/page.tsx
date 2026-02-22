"use client";

import { Button, Drawer, Group, Stack, TextInput } from "@mantine/core";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppFrame } from "../../src/components/app-frame";
import { ProjectTable } from "../../src/components/project-table";
import { apiFetch } from "../../src/lib/api-client";
import { toastError, toastSuccess } from "../../src/lib/toast";
import { Project } from "../../src/types/project";

export default function UserPortalPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; slug?: string }>({});

  const loadProjects = async () => {
    try {
      const data = await apiFetch<Project[]>("projects");
      setProjects(data);
    } catch {
      toastError("프로젝트 목록을 불러오지 못했습니다.");
    }
  };

  useEffect(() => {
    const ensureAuth = async () => {
      try {
        await apiFetch("auth/me");
        await loadProjects();
      } catch {
        router.replace("/login?next=/portal");
      }
    };
    void ensureAuth();
  }, []);

  const createProject = async () => {
    const nextErrors: { name?: string; slug?: string } = {};
    if (!name.trim()) {
      nextErrors.name = "프로젝트 이름을 입력하세요.";
    }
    if (!slug.trim()) {
      nextErrors.slug = "Slug를 입력하세요.";
    } else if (!/^[a-z0-9-]+$/.test(slug.trim())) {
      nextErrors.slug = "Slug는 소문자, 숫자, 하이픈만 가능합니다.";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    try {
      await apiFetch<Project>("projects", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), slug: slug.trim() }),
      });
      setName("");
      setSlug("");
      setErrors({});
      setDrawerOpen(false);
      toastSuccess("프로젝트를 생성했습니다.");
      await loadProjects();
    } catch {
      toastError("프로젝트 생성에 실패했습니다.");
    }
  };

  return (
    <AppFrame title="User Portal" headerActions={<Button onClick={() => setDrawerOpen(true)}>New Project</Button>}>
      <Stack>
        <ProjectTable projects={projects} title="My Projects" />
      </Stack>

      <Drawer opened={drawerOpen} onClose={() => setDrawerOpen(false)} title="Create Project" position="right">
        <Stack>
          <TextInput
            label="Project Name"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            error={errors.name}
            placeholder="My Project"
          />
          <TextInput
            label="Slug"
            value={slug}
            onChange={(e) => setSlug(e.currentTarget.value)}
            error={errors.slug}
            placeholder="my-project"
          />
          <Group justify="end">
            <Button variant="default" onClick={() => setDrawerOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createProject}>Create</Button>
          </Group>
        </Stack>
      </Drawer>
    </AppFrame>
  );
}
