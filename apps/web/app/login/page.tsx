"use client";

import { Button, Group, Paper, PasswordInput, Stack, Tabs, Text, TextInput, Title } from "@mantine/core";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import { setToken } from "../../src/lib/auth";
import { toastError, toastSuccess } from "../../src/lib/toast";

type AuthResponse = { accessToken: string };

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") ?? "/portal";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (path: "login" | "register") => {
    setLoading(true);
    try {
      const response = await fetch(`/api/auth/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(path === "login" ? { email, password } : { email, password, displayName }),
      });
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      const data = (await response.json()) as AuthResponse;
      setToken(data.accessToken);
      toastSuccess(path === "login" ? "로그인 완료" : "회원가입 완료");
      router.push(nextPath);
    } catch {
      toastError(path === "login" ? "로그인에 실패했습니다." : "회원가입에 실패했습니다.");
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
            계정으로 로그인하거나 새로 가입하세요.
          </Text>
          <Tabs defaultValue="login">
            <Tabs.List grow>
              <Tabs.Tab value="login">Login</Tabs.Tab>
              <Tabs.Tab value="register">Register</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="login" pt="md">
              <Stack>
                <TextInput label="Email" value={email} onChange={(e) => setEmail(e.currentTarget.value)} />
                <PasswordInput label="Password" value={password} onChange={(e) => setPassword(e.currentTarget.value)} />
                <Group justify="end">
                  <Button loading={loading} onClick={() => void submit("login")}>
                    Login
                  </Button>
                </Group>
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel value="register" pt="md">
              <Stack>
                <TextInput label="Email" value={email} onChange={(e) => setEmail(e.currentTarget.value)} />
                <TextInput label="Display Name" value={displayName} onChange={(e) => setDisplayName(e.currentTarget.value)} />
                <PasswordInput label="Password" value={password} onChange={(e) => setPassword(e.currentTarget.value)} />
                <Group justify="end">
                  <Button loading={loading} onClick={() => void submit("register")}>
                    Register
                  </Button>
                </Group>
              </Stack>
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
