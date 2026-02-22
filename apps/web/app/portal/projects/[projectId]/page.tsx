"use client";

import Link from "next/link";
import {
  Badge,
  Button,
  Divider,
  Group,
  LoadingOverlay,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppFrame } from "../../../../src/components/app-frame";
import { ApiError, apiFetch } from "../../../../src/lib/api-client";
import { toastError, toastSuccess } from "../../../../src/lib/toast";
import { Project } from "../../../../src/types/project";

type NotebookSession = {
  id: string;
  projectId: string;
  endpointPath: string;
  status: string;
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

export default function ProjectDetailPage() {
  const params = useParams<{ projectId: string }>();
  const router = useRouter();
  const projectId = params?.projectId ?? "";

  const [authChecking, setAuthChecking] = useState(true);
  const [loadingProject, setLoadingProject] = useState(true);
  const [loadingLab, setLoadingLab] = useState(false);
  const [loadingLiteLlm, setLoadingLiteLlm] = useState(false);
  const [issuingKey, setIssuingKey] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [notebook, setNotebook] = useState<NotebookSession | null>(null);
  const [models, setModels] = useState<LiteLlmModel[]>([]);
  const [keys, setKeys] = useState<LiteLlmKey[]>([]);
  const [newKeyAlias, setNewKeyAlias] = useState("");

  const notebookStatusColor = useMemo(() => {
    const status = notebook?.status?.toLowerCase();
    if (status === "running") {
      return "teal";
    }
    if (status === "provisioning") {
      return "yellow";
    }
    return "gray";
  }, [notebook]);

  useEffect(() => {
    const load = async () => {
      try {
        await apiFetch("auth/me");
        setAuthChecking(false);
        const [projectRow, myNotebooks] = await Promise.all([
          apiFetch<Project>(`projects/${projectId}`),
          apiFetch<NotebookSession[]>("notebooks/me"),
        ]);
        setProject(projectRow);
        setNotebook(myNotebooks.find((item) => item.projectId === projectId) ?? null);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          router.replace(`/login?next=/portal/projects/${projectId}`);
          return;
        }
        toastError("프로젝트 정보를 불러오지 못했습니다.");
      } finally {
        setAuthChecking(false);
        setLoadingProject(false);
      }
    };
    if (projectId) {
      void load();
    }
  }, [projectId, router]);

  const openLab = async () => {
    if (!project) {
      return;
    }
    setLoadingLab(true);
    try {
      const session = await apiFetch<NotebookSession>("notebooks", {
        method: "POST",
        body: JSON.stringify({ projectId: project.id }),
      });
      setNotebook(session);
      window.open(session.endpointPath, "_blank", "noopener,noreferrer");
      toastSuccess("Lab을 열었습니다.");
    } catch {
      toastError("Lab 오픈에 실패했습니다.");
    } finally {
      setLoadingLab(false);
    }
  };

  const loadLiteLlm = async () => {
    if (!project) {
      return;
    }
    setLoadingLiteLlm(true);
    try {
      await apiFetch(`llm/projects/${project.id}/team/${project.slug}`, { method: "POST" });
      const [modelRows, keyRows] = await Promise.all([
        apiFetch<LiteLlmModel[]>(`llm/projects/${project.id}/models`),
        apiFetch<LiteLlmKey[]>(`llm/projects/${project.id}/keys`),
      ]);
      setModels(modelRows);
      setKeys(keyRows);
      toastSuccess("LiteLLM 정보를 불러왔습니다.");
    } catch {
      toastError("LiteLLM 연계에 실패했습니다.");
    } finally {
      setLoadingLiteLlm(false);
    }
  };

  const issueLiteLlmKey = async () => {
    if (!project) {
      return;
    }
    if (!newKeyAlias.trim()) {
      toastError("키 별칭을 입력하세요.");
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
      toastSuccess("LiteLLM 키를 발급했습니다.");
    } catch {
      toastError("LiteLLM 키 발급에 실패했습니다.");
    } finally {
      setIssuingKey(false);
    }
  };

  return (
    <AppFrame title="User Portal">
      <Stack pos="relative">
        <LoadingOverlay visible={authChecking || loadingProject} zIndex={1000} overlayProps={{ radius: "sm", blur: 2 }} />

        <Group justify="space-between">
          <Title order={3}>Project Workspace</Title>
          <Button component={Link} href="/portal" variant="default">
            Back to Projects
          </Button>
        </Group>

        {project ? (
          <Paper withBorder p="md" radius="md">
            <Stack>
              <Group justify="space-between">
                <Stack gap={2}>
                  <Text fw={700}>{project.name}</Text>
                  <Text size="sm" c="dimmed">
                    {project.slug}
                  </Text>
                </Stack>
                <Badge variant="light" color="cyan">
                  Active
                </Badge>
              </Group>
              <Text size="sm">Project ID: {project.id}</Text>
              <Text size="sm">Created: {new Date(project.createdAt).toLocaleString()}</Text>
            </Stack>
          </Paper>
        ) : null}

        <Paper withBorder p="md" radius="md">
          <Stack>
            <Group justify="space-between">
              <Title order={4}>Lab</Title>
              <Button loading={loadingLab} onClick={() => void openLab()}>
                Open Lab
              </Button>
            </Group>
            {notebook ? (
              <Group>
                <Badge color={notebookStatusColor} variant="light">
                  {notebook.status}
                </Badge>
                <Text size="sm">{notebook.endpointPath}</Text>
              </Group>
            ) : (
              <Text size="sm" c="dimmed">
                아직 생성된 Lab 세션이 없습니다.
              </Text>
            )}
          </Stack>
        </Paper>

        <Paper withBorder p="md" radius="md">
          <Stack>
            <Group justify="space-between">
              <Title order={4}>LiteLLM</Title>
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
                  모델 정보가 없습니다. Refresh를 눌러 동기화하세요.
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
                  발급된 키가 없습니다.
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
      </Stack>
    </AppFrame>
  );
}
