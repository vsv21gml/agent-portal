"use client";

import Link from "next/link";
import { Breadcrumbs, Card, LoadingOverlay, Paper, SimpleGrid, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminFrame } from "../../src/components/admin-frame";
import { ProfileMenu } from "../../src/components/profile-menu";
import { ApiError, apiFetch } from "../../src/lib/api-client";

type MyProfile = {
  sub: string;
  email: string;
  role: string;
  displayName: string;
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

export default function AdminProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [usage, setUsage] = useState<MyLiteLlmUsage | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [me, usageInfo] = await Promise.all([
          apiFetch<MyProfile>("auth/me"),
          apiFetch<MyLiteLlmUsage>("llm/me/usage"),
        ]);
        if (me.role !== "admin") {
          router.replace("/login?next=/");
          return;
        }
        setProfile(me);
        setUsage(usageInfo);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          router.replace("/login?next=/profile");
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

    void load();
  }, [router]);

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
      </Stack>
    </AdminFrame>
  );
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
