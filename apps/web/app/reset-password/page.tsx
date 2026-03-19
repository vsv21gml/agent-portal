"use client";

import { Button, Group, Paper, PasswordInput, Stack, Text, Title } from "@mantine/core";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ApiError, apiFetch } from "../../src/lib/api-client";
import { clearToken } from "../../src/lib/auth";
import { getPortalLoginPath } from "../../src/lib/auth-routing";
import { toastError, toastSuccess } from "../../src/lib/toast";

type MyProfile = {
  role: string;
  passwordResetRequired: boolean;
};

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") ?? "/portal";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const me = await apiFetch<MyProfile>("auth/me");
        if (!me.passwordResetRequired) {
          router.replace(nextPath);
          return;
        }
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          clearToken();
          router.replace(getPortalLoginPath(nextPath));
          return;
        }
        toastError("Failed to load password reset page.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [nextPath, router]);

  const submit = async () => {
    if (password.length < 8) {
      toastError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      toastError("Password confirmation does not match.");
      return;
    }

    setSaving(true);
    try {
      await apiFetch("auth/me/password", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      toastSuccess("Password updated.");
      router.replace(nextPath);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearToken();
        router.replace(getPortalLoginPath(nextPath));
        return;
      }
      toastError("Failed to update password.");
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
            You are signed in with a temporary password. Set your own password to continue.
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
