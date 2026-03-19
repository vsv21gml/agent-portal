"use client";

import Link from "next/link";
import {
  ActionIcon,
  Breadcrumbs,
  Button,
  Card,
  Group,
  LoadingOverlay,
  PasswordInput,
  Paper,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminFrame } from "../../src/components/admin-frame";
import { ProfileMenu } from "../../src/components/profile-menu";
import { ApiError, apiFetch } from "../../src/lib/api-client";
import { getAdminLoginPath, getAdminResetPasswordPath, getPortalOrigin } from "../../src/lib/auth-routing";

type MyProfile = {
  sub: string;
  email: string;
  role: string;
  displayName: string;
  passwordResetRequired: boolean;
};

type MyLiteLlmUsage = {
  currentMonthSpendUsd: number;
  currentMonthTotalTokens: number;
  currentMonthPromptTokens: number;
  currentMonthCompletionTokens: number;
  currentMonthBudgetUsd: number | null;
  budgetDuration: string | null;
  budgetResetAt: string | null;
};

type LiteLlmAccessModel = {
  modelName: string;
  isDefault: boolean;
  requestStatus?: string;
};

type LiteLlmAccessRequest = {
  id: string;
  modelName: string;
  status: string;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
};

type MyLiteLlmAccess = {
  litellmBaseUrl: string;
  personalKey: string | null;
  availableModels: LiteLlmAccessModel[];
  requestableModels: LiteLlmAccessModel[];
  requests: LiteLlmAccessRequest[];
};

export default function AdminProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [requestingModelName, setRequestingModelName] = useState<string | null>(null);
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [usage, setUsage] = useState<MyLiteLlmUsage | null>(null);
  const [access, setAccess] = useState<MyLiteLlmAccess | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [me, usageInfo, accessInfo] = await Promise.all([
        apiFetch<MyProfile>("auth/me"),
        apiFetch<MyLiteLlmUsage>("llm/me/usage"),
        apiFetch<MyLiteLlmAccess>("llm/me/access"),
      ]);
      if (me.passwordResetRequired) {
        router.replace(getAdminResetPasswordPath("/profile"));
        return;
      }
      if (me.role !== "admin") {
        window.location.assign(getPortalOrigin());
        return;
      }
      setProfile(me);
      setUsage(usageInfo);
      setAccess(accessInfo);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        router.replace(getAdminLoginPath("/profile"));
        return;
      }
      if (error instanceof ApiError && error.status === 403) {
        window.location.assign(getPortalOrigin());
        return;
      }
      notifications.show({
        title: "Failed",
        message: "Failed to load profile.",
        color: "red",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [router]);

  const requestModelAccess = async (modelName: string) => {
    setRequestingModelName(modelName);
    try {
      await apiFetch("llm/me/model-requests", {
        method: "POST",
        body: JSON.stringify({ modelName }),
      });
      notifications.show({
        title: "Submitted",
        message: "Model access request submitted.",
        color: "teal",
      });
      await load();
    } catch {
      notifications.show({
        title: "Failed",
        message: "Failed to submit model access request.",
        color: "red",
      });
    } finally {
      setRequestingModelName(null);
    }
  };

  const breadcrumbs = (
    <Breadcrumbs separator=">">
      <Text component={Link} href="/" inherit>
        Admin Web
      </Text>
      <Text inherit>Profile</Text>
    </Breadcrumbs>
  );

  return (
    <AdminFrame title={breadcrumbs} headerActions={<ProfileMenu />} hideNavbar>
      <Stack pos="relative" gap="lg">
        <LoadingOverlay visible={loading} zIndex={1000} overlayProps={{ radius: "sm", blur: 2 }} />

        <Paper withBorder radius="lg" p="xl">
          <Stack gap="xs">
            <Text size="sm" c="dimmed">
              Name
            </Text>
            <Text fw={700} size="lg">
              {profile?.displayName ?? "-"}
            </Text>
            <Text size="sm" c="dimmed" mt="sm">
              Email
            </Text>
            <Text>{profile?.email ?? "-"}</Text>
          </Stack>
        </Paper>

        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="lg">
          <Card withBorder radius="lg" p="xl">
            <Text size="sm" c="dimmed">
              Spend
            </Text>
            <Text fw={700} size="xl">
              ${formatSpend(usage?.currentMonthSpendUsd ?? 0)}
            </Text>
            <Text size="sm" c="dimmed">
              Current month
            </Text>
          </Card>

          <Card withBorder radius="lg" p="xl">
            <Text size="sm" c="dimmed">
              Tokens
            </Text>
            <Text fw={700} size="xl">
              {formatInteger(usage?.currentMonthTotalTokens ?? 0)}
            </Text>
            <Text size="sm" c="dimmed">
              Current month
            </Text>
          </Card>

          <Card withBorder radius="lg" p="xl">
            <Text size="sm" c="dimmed">
              Budget
            </Text>
            <Text fw={700} size="xl">
              {usage?.currentMonthBudgetUsd == null ? "-" : `$${formatBudget(usage.currentMonthBudgetUsd)}`}
            </Text>
            <Text size="sm" c="dimmed">
              {usage?.budgetDuration ?? "No reset policy"}
            </Text>
          </Card>
        </SimpleGrid>

        <Paper withBorder radius="lg" p="xl">
          <Stack gap="lg">
            <div>
              <Title order={4}>LiteLLM Access</Title>
              <Text size="sm" c="dimmed" mt={4}>
                Copy your personal endpoint and key, and request additional model permissions when needed.
              </Text>
            </div>

            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
              <Group align="end" wrap="nowrap">
                <TextInput label="LLM URL" value={access?.litellmBaseUrl ?? ""} readOnly style={{ flex: 1 }} />
                <ActionIcon
                  size="lg"
                  variant="light"
                  aria-label="Copy LLM URL"
                  onClick={() => void copyText(access?.litellmBaseUrl ?? "", "LLM URL copied.")}
                >
                  ⧉
                </ActionIcon>
              </Group>
              <Group align="end" wrap="nowrap">
                <PasswordInput label="Personal Key" value={access?.personalKey ?? ""} readOnly style={{ flex: 1 }} />
                <ActionIcon
                  size="lg"
                  variant="light"
                  aria-label="Copy personal key"
                  onClick={() => void copyText(access?.personalKey ?? "", "Personal key copied.")}
                >
                  ⧉
                </ActionIcon>
              </Group>
            </SimpleGrid>

            <Stack gap="sm">
              <Title order={5}>Available Models</Title>
              <Table withTableBorder highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Model</Table.Th>
                    <Table.Th>Source</Table.Th>
                    <Table.Th>Action</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {access?.availableModels.length ? (
                    access.availableModels.map((model) => (
                      <Table.Tr key={model.modelName}>
                        <Table.Td>{model.modelName}</Table.Td>
                        <Table.Td>{model.isDefault ? "Default" : "Approved"}</Table.Td>
                        <Table.Td>
                          <Button
                            size="xs"
                            variant="light"
                            onClick={() => void copyText(model.modelName, `Model name copied: ${model.modelName}`)}
                          >
                            Copy Model
                          </Button>
                        </Table.Td>
                      </Table.Tr>
                    ))
                  ) : (
                    <Table.Tr>
                      <Table.Td colSpan={3}>
                        <Text size="sm" c="dimmed">
                          No models are currently available on your personal key.
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  )}
                </Table.Tbody>
              </Table>
            </Stack>

            <Stack gap="sm">
              <Title order={5}>Request Model Access</Title>
              <Table withTableBorder highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Model</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Action</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {access?.requestableModels.length ? (
                    access.requestableModels.map((model) => (
                      <Table.Tr key={model.modelName}>
                        <Table.Td>{model.modelName}</Table.Td>
                        <Table.Td>{formatRequestStatus(model.requestStatus ?? "none")}</Table.Td>
                        <Table.Td>
                          <Button
                            size="xs"
                            variant="light"
                            disabled={model.requestStatus === "pending"}
                            loading={requestingModelName === model.modelName}
                            onClick={() => void requestModelAccess(model.modelName)}
                          >
                            {model.requestStatus === "rejected" ? "Request Again" : "Request"}
                          </Button>
                        </Table.Td>
                      </Table.Tr>
                    ))
                  ) : (
                    <Table.Tr>
                      <Table.Td colSpan={3}>
                        <Text size="sm" c="dimmed">
                          No additional models are available to request.
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  )}
                </Table.Tbody>
              </Table>
            </Stack>

            <Stack gap="sm">
              <Title order={5}>Request History</Title>
              <Table withTableBorder highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Model</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Updated</Table.Th>
                    <Table.Th>Note</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {access?.requests.length ? (
                    access.requests.map((request) => (
                      <Table.Tr key={request.id}>
                        <Table.Td>{request.modelName}</Table.Td>
                        <Table.Td>{formatRequestStatus(request.status)}</Table.Td>
                        <Table.Td>{new Date(request.updatedAt).toLocaleString()}</Table.Td>
                        <Table.Td>{request.reviewNote || "-"}</Table.Td>
                      </Table.Tr>
                    ))
                  ) : (
                    <Table.Tr>
                      <Table.Td colSpan={4}>
                        <Text size="sm" c="dimmed">
                          No model access requests yet.
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  )}
                </Table.Tbody>
              </Table>
            </Stack>
          </Stack>
        </Paper>
      </Stack>
    </AdminFrame>
  );
}

async function copyText(value: string, successMessage: string) {
  if (!value) {
    notifications.show({
      title: "Nothing to copy",
      message: "The requested value is empty.",
      color: "yellow",
    });
    return;
  }

  try {
    await navigator.clipboard.writeText(value);
    notifications.show({
      title: "Copied",
      message: successMessage,
      color: "teal",
    });
  } catch {
    notifications.show({
      title: "Failed",
      message: "Copy failed.",
      color: "red",
    });
  }
}

function formatSpend(value: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);
}

function formatBudget(value: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatRequestStatus(status: string): string {
  if (status === "pending") {
    return "Pending";
  }
  if (status === "approved") {
    return "Approved";
  }
  if (status === "rejected") {
    return "Rejected";
  }
  return "Not requested";
}
