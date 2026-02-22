import Link from "next/link";
import { Button, Group, Paper, Stack, Text, Title } from "@mantine/core";

export default function HomePage() {
  const adminWebUrl = process.env.NEXT_PUBLIC_ADMIN_WEB_URL ?? "http://localhost:3100";
  return (
    <Stack justify="center" align="center" h="100dvh">
      <Paper shadow="sm" p="xl" radius="lg" withBorder miw={360}>
        <Stack>
          <Title order={2}>Agent Portal</Title>
          <Text c="dimmed">유저 포탈과 어드민 포탈이 분리된 초기 구현입니다.</Text>
          <Group>
            <Button component={Link} href="/portal">
              User Portal
            </Button>
            <Button component={Link} href={adminWebUrl} variant="light">
              Admin Portal
            </Button>
          </Group>
        </Stack>
      </Paper>
    </Stack>
  );
}
