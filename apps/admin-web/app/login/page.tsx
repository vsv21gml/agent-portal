"use client";

import { Button, Group, Paper, PasswordInput, Stack, Text, TextInput, Title } from "@mantine/core";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import { setToken, clearToken } from "../../src/lib/auth";
import { notifications } from "@mantine/notifications";
import { apiFetch } from "../../src/lib/api-client";

type AuthResponse = { accessToken: string };

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      const data = (await response.json()) as AuthResponse;
      setToken(data.accessToken);

      const me = await apiFetch<{ role: string }>("auth/me");
      if (me.role !== "admin") {
        clearToken();
        notifications.show({
          title: "Access denied",
          message: "관리자 권한이 없습니다.",
          color: "red",
        });
        return;
      }

      notifications.show({ title: "Success", message: "로그인 완료", color: "teal" });
      router.push(nextPath);
    } catch {
      notifications.show({
        title: "Failed",
        message: "로그인에 실패했습니다.",
        color: "red",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack align="center" justify="center" h="100dvh">
      <Paper withBorder shadow="sm" p="xl" radius="lg" miw={360}>
        <Stack>
          <Title order={3}>Admin Web</Title>
          <Text size="sm" c="dimmed">
            관리자 계정으로 로그인하세요.
          </Text>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <Stack>
              <TextInput label="Email" value={email} onChange={(e) => setEmail(e.currentTarget.value)} />
              <PasswordInput label="Password" value={password} onChange={(e) => setPassword(e.currentTarget.value)} />
              <Group justify="end">
                <Button type="submit" loading={loading}>
                  Login
                </Button>
              </Group>
            </Stack>
          </form>
        </Stack>
      </Paper>
    </Stack>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<Stack align="center" justify="center" h="100dvh" />}>
      <LoginContent />
    </Suspense>
  );
}
