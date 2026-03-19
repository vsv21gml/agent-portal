"use client";

import { Button, Group, Paper, PasswordInput, Stack, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ApiError, apiFetch } from "../../src/lib/api-client";
import { clearToken } from "../../src/lib/auth";
import { getAdminLoginPath, getPortalOrigin } from "../../src/lib/auth-routing";

type MyProfile = {
  role: string;
  passwordResetRequired: boolean;
};

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") ?? "/";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const me = await apiFetch<MyProfile>("auth/me");
        if (me.role !== "admin") {
          window.location.assign(getPortalOrigin());
          return;
        }
        if (!me.passwordResetRequired) {
          router.replace(nextPath);
          return;
        }
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          clearToken();
          router.replace(getAdminLoginPath(nextPath));
          return;
        }
        if (error instanceof ApiError && error.status === 403) {
          window.location.assign(getPortalOrigin());
          return;
        }
        notifications.show({
          title: "Failed",
          message: "Failed to load password reset page.",
          color: "red",
        });
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [nextPath, router]);

  const submit = async () => {
    if (password.length < 8) {
      notifications.show({
        title: "Invalid password",
        message: "Password must be at least 8 characters.",
        color: "red",
      });
      return;
    }
    if (password !== confirmPassword) {
      notifications.show({
        title: "Mismatch",
        message: "Password confirmation does not match.",
        color: "red",
      });
      return;
    }

    setSaving(true);
    try {
      await apiFetch("auth/me/password", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      notifications.show({
        title: "Success",
        message: "Password updated.",
        color: "teal",
      });
      router.replace(nextPath);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearToken();
        router.replace(getAdminLoginPath(nextPath));
        return;
      }
      if (error instanceof ApiError && error.status === 403) {
        window.location.assign(getPortalOrigin());
        return;
      }
      notifications.show({
        title: "Failed",
        message: "Failed to update password.",
        color: "red",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack align="center" justify="center" h="100dvh">
      <Paper withBorder shadow="sm" p="xl" radius="lg" miw={360}>
        <Stack>
          <Title order={3}>Set Password</Title>
          <Text size="sm" c="dimmed">
            You are signed in with a temporary password. Set a new password before accessing the admin console.
          </Text>
          <PasswordInput label="New Password" value={password} onChange={(event) => setPassword(event.currentTarget.value)} disabled={loading || saving} />
          <PasswordInput
            label="Confirm Password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.currentTarget.value)}
            disabled={loading || saving}
          />
          <Group justify="end">
            <Button onClick={() => void submit()} loading={saving} disabled={loading || saving}>
              Save Password
            </Button>
          </Group>
        </Stack>
      </Paper>
    </Stack>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<Stack align="center" justify="center" h="100dvh" />}>
      <ResetPasswordContent />
    </Suspense>
  );
}
