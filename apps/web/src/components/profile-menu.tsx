"use client";

import { Avatar, Divider, Group, Loader, Menu, Stack, Text } from "@mantine/core";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiFetch } from "../lib/api-client";
import { clearToken } from "../lib/auth";
import { toastError } from "../lib/toast";

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

export function ProfileMenu() {
  const router = useRouter();
  const [opened, setOpened] = useState(false);
  const [loading, setLoading] = useState(false);
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
        setProfile(me);
        setUsage(usageInfo);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          clearToken();
          router.replace("/login?next=/portal");
          return;
        }
        toastError("Failed to load profile.");
      } finally {
        setLoading(false);
      }
    };

    if (opened) {
      void load();
    }
  }, [opened, router]);

  const logout = () => {
    clearToken();
    router.replace("/login?next=/portal");
  };

  const initials = (profile?.displayName || profile?.email || "U")
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((value) => value[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <Menu opened={opened} onChange={setOpened} position="bottom-end" shadow="md" width={320}>
      <Menu.Target>
        <Avatar color="blue" radius="xl" style={{ cursor: "pointer" }}>
          {initials || "U"}
        </Avatar>
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Label>Profile</Menu.Label>
        {loading ? (
          <Group px="sm" py="md" justify="center">
            <Loader size="sm" />
          </Group>
        ) : (
          <Stack gap="xs" px="sm" py="xs">
            <div>
              <Text fw={700}>{profile?.displayName ?? "-"}</Text>
              <Text size="sm" c="dimmed">
                {profile?.email ?? "-"}
              </Text>
            </div>

            <Divider />

            <div>
              <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
                LiteLLM This Month
              </Text>
              <Text size="sm">Spend: ${formatMoney(usage?.currentMonthSpendUsd ?? 0)}</Text>
              <Text size="sm">Tokens: {formatInteger(usage?.currentMonthTotalTokens ?? 0)}</Text>
              <Text size="sm">Budget: {usage?.currentMonthBudgetUsd == null ? "-" : `$${formatMoney(usage.currentMonthBudgetUsd)}`}</Text>
            </div>
          </Stack>
        )}

        <Divider my="xs" />
        <Menu.Item color="red" onClick={logout}>
          Log out
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

function formatMoney(value: number): string {
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
