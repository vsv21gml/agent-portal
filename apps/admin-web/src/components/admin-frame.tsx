"use client";

import { AppShell, Group, Text } from "@mantine/core";
import { ReactNode } from "react";

export function AdminFrame({ children, headerActions }: { children: ReactNode; headerActions?: ReactNode }) {
  return (
    <AppShell header={{ height: 62 }} padding="md" style={{ height: "100dvh", overflow: "hidden" }}>
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Text fw={700}>Admin Web Console</Text>
          {headerActions ? <Group gap="xs">{headerActions}</Group> : null}
        </Group>
      </AppShell.Header>
      <AppShell.Main style={{ height: "calc(100dvh - 62px)", overflow: "auto" }}>{children}</AppShell.Main>
    </AppShell>
  );
}
