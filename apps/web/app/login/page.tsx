"use client";

import { Button, Group, Paper, PasswordInput, Stack, Tabs, Text, TextInput, Title } from "@mantine/core";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import { setToken } from "../../src/lib/auth";
import { getPortalResetPasswordPath } from "../../src/lib/auth-routing";
import { toastError, toastSuccess } from "../../src/lib/toast";

type AuthResponse = { accessToken: string; passwordResetRequired: boolean; role: string };
type RegisterResponse = { accessToken: string };

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") ?? "/portal";

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<string | null>("login");
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
        const errorBody = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(errorBody?.message ?? `${response.status} ${response.statusText}`);
      }
      const data = (await response.json()) as AuthResponse;
      setToken(data.accessToken);
      if (data.passwordResetRequired) {
        router.push(getPortalResetPasswordPath(nextPath));
        return;
      }
      toastSuccess("로그인 완료");
      router.push(nextPath);
    } catch (error) {
      toastError(error instanceof Error ? error.message : "로그인에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const submitSignup = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, displayName }),
      });
      if (!response.ok) {
        const errorBody = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(errorBody?.message ?? `${response.status} ${response.statusText}`);
      }
      void ((await response.json()) as RegisterResponse);
      toastSuccess("회원가입 요청이 접수되었습니다. 관리자 승인 후 로그인할 수 있습니다.");
      setMode("login");
      setPassword("");
    } catch (error) {
      toastError(error instanceof Error ? error.message : "회원가입 요청에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack align="center" justify="center" h="100dvh">
      <Paper withBorder shadow="sm" p="xl" radius="lg" miw={360}>
        <Stack>
          <Title order={3}>Agent Portal</Title>
          <Text size="sm" c="dimmed">
            로그인하거나 회원가입 요청을 보내 관리자 승인을 기다리세요.
          </Text>
          <Tabs value={mode} onChange={setMode}>
            <Tabs.List>
              <Tabs.Tab value="login">Login</Tabs.Tab>
              <Tabs.Tab value="signup">Sign Up</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="login" pt="md">
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
            </Tabs.Panel>

            <Tabs.Panel value="signup" pt="md">
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitSignup();
                }}
              >
                <Stack>
                  <TextInput label="Email" value={email} onChange={(e) => setEmail(e.currentTarget.value)} />
                  <TextInput label="Display Name" value={displayName} onChange={(e) => setDisplayName(e.currentTarget.value)} />
                  <PasswordInput label="Password" value={password} onChange={(e) => setPassword(e.currentTarget.value)} />
                  <Group justify="end">
                    <Button type="submit" loading={loading}>
                      Request Sign Up
                    </Button>
                  </Group>
                </Stack>
              </form>
            </Tabs.Panel>
          </Tabs>
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
