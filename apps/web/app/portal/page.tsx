"use client";

import { ActionIcon, Affix, Button, Drawer, Group, LoadingOverlay, Stack, TextInput, Textarea } from "@mantine/core";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppFrame } from "../../src/components/app-frame";
import { ProjectTable } from "../../src/components/project-table";
import { ApiError, apiFetch } from "../../src/lib/api-client";
import { toastError, toastSuccess } from "../../src/lib/toast";
import { Project } from "../../src/types/project";

export default function UserPortalPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [search, setSearch] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; description?: string }>({});
  const [authChecking, setAuthChecking] = useState(true);
  const [creatingProject, setCreatingProject] = useState(false);

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
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          router.replace("/login?next=/portal");
          return;
        }
        router.replace("/login?next=/portal");
      } finally {
        setAuthChecking(false);
      }
    };

    void ensureAuth();
  }, [router]);

  const filteredProjects = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) {
      return projects;
    }

    return projects.filter((project) => {
      return project.name.toLowerCase().includes(keyword) || project.description.toLowerCase().includes(keyword);
    });
  }, [projects, search]);

  const createProject = async () => {
    const nextErrors: { name?: string; description?: string } = {};
    if (!name.trim()) {
      nextErrors.name = "프로젝트 이름을 입력하세요.";
    }
    if (!description.trim()) {
      nextErrors.description = "Description을 입력하세요.";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setCreatingProject(true);
    try {
      await apiFetch<Project>("projects", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), description: description.trim() }),
      });
      setName("");
      setDescription("");
      setErrors({});
      setDrawerOpen(false);
      toastSuccess("프로젝트를 생성했습니다.");
      await loadProjects();
    } catch {
      toastError("프로젝트 생성에 실패했습니다.");
    } finally {
      setCreatingProject(false);
    }
  };

  return (
    <AppFrame title="User Portal" hideNavbar>
      <Stack pos="relative">
        <LoadingOverlay
          visible={authChecking || creatingProject}
          zIndex={1000}
          overlayProps={{ radius: "sm", blur: 2 }}
          loaderProps={{ children: creatingProject ? "Creating project..." : undefined }}
        />
        <TextInput
          placeholder="Search by project name or description"
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          maw={520}
          mx="auto"
          w="100%"
          disabled={creatingProject}
        />
        <ProjectTable projects={filteredProjects} />
      </Stack>

      <Affix position={{ bottom: 24, right: 24 }}>
        <ActionIcon
          size={56}
          radius="xl"
          variant="filled"
          onClick={() => setDrawerOpen(true)}
          aria-label="New Project"
          disabled={creatingProject}
        >
          <span style={{ fontSize: 36, lineHeight: 1, fontWeight: 300 }}>+</span>
        </ActionIcon>
      </Affix>

      <Drawer
        opened={drawerOpen}
        onClose={() => {
          if (!creatingProject) {
            setDrawerOpen(false);
          }
        }}
        title="Create Project"
        position="right"
        closeOnClickOutside={!creatingProject}
        closeOnEscape={!creatingProject}
        withCloseButton={!creatingProject}
      >
        <Stack>
          <TextInput
            label="Project Name"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            error={errors.name}
            placeholder="My Project"
            disabled={creatingProject}
          />
          <Textarea
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value)}
            error={errors.description}
            placeholder="Project summary"
            minRows={4}
            disabled={creatingProject}
          />
          <Group justify="end">
            <Button variant="default" onClick={() => setDrawerOpen(false)} disabled={creatingProject}>
              Cancel
            </Button>
            <Button onClick={createProject} loading={creatingProject} disabled={creatingProject}>
              Create
            </Button>
          </Group>
        </Stack>
      </Drawer>
    </AppFrame>
  );
}
