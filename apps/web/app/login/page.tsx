"use client";

import { Button, Group, Paper, PasswordInput, Stack, Text, TextInput, Title } from "@mantine/core";
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
      toastSuccess("로그인 완료");
      router.push(nextPath);
    } catch {
      toastError("로그인에 실패했습니다.");
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
            로그인하거나 관리자가 보낸 초대 링크로 비밀번호를 설정하세요.
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
