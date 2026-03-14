"use client";

import { Button, Group, Paper, PasswordInput, Stack, Text, Title } from "@mantine/core";
import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { setToken } from "../../../src/lib/auth";
import { toastError, toastSuccess } from "../../../src/lib/toast";
import { ApiError, apiFetch } from "../../../src/lib/api-client";

type InvitationInfo = {
  email: string;
  displayName: string;
  globalRole: string;
};

type AcceptResponse = {
  accessToken: string;
  role: string;
};

function InviteContent() {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";

  const [invitation, setInvitation] = useState<InvitationInfo | null>(null);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await apiFetch<InvitationInfo>(`auth/invitations/${token}`);
        setInvitation(data);
      } catch (error: unknown) {
        if (error instanceof ApiError && error.status === 404) {
          toastError("유효하지 않거나 이미 사용된 초대 링크입니다.");
        } else {
          toastError("초대 정보를 불러오지 못했습니다.");
        }
      } finally {
        setLoading(false);
      }
    };

    if (token) {
      void load();
    }
  }, [token]);

  const submit = async () => {
    if (!password.trim()) {
      toastError("초기 비밀번호를 입력하세요.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await apiFetch<AcceptResponse>(`auth/invitations/${token}/accept`, {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      setToken(response.accessToken);
      toastSuccess("비밀번호 설정이 완료되었습니다.");

      if (response.role === "admin") {
        const adminOrigin = window.location.origin.replace("://", "://admin.");
        window.location.href = `${adminOrigin}/`;
        return;
      }

      router.push("/portal");
    } catch {
      toastError("초대 수락에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Stack align="center" justify="center" h="100dvh">
      <Paper withBorder shadow="sm" p="xl" radius="lg" miw={380}>
        <Stack>
          <Title order={3}>Accept Invitation</Title>
          {loading ? (
            <Text size="sm" c="dimmed">
              초대 정보를 확인하고 있습니다.
            </Text>
          ) : invitation ? (
            <>
              <Text size="sm" c="dimmed">
                {invitation.displayName} ({invitation.email})
              </Text>
              <Text size="sm" c="dimmed">
                Role: {invitation.globalRole}
              </Text>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void submit();
                }}
              >
                <Stack mt="md">
                  <PasswordInput
                    label="Initial Password"
                    value={password}
                    onChange={(event) => setPassword(event.currentTarget.value)}
                  />
                  <Group justify="end">
                    <Button type="submit" loading={submitting}>
                      Set Password
                    </Button>
                  </Group>
                </Stack>
              </form>
            </>
          ) : (
            <Text size="sm" c="dimmed">
              초대 정보를 찾을 수 없습니다.
            </Text>
          )}
        </Stack>
      </Paper>
    </Stack>
  );
}

export default function InvitePage() {
  return (
    <Suspense fallback={<Stack align="center" justify="center" h="100dvh" />}>
      <InviteContent />
    </Suspense>
  );
}
