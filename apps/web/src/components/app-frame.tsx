"use client";

import { AppShell, Burger, Group, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { ReactNode } from "react";

type Props = {
  title: string;
  children: ReactNode;
  headerActions?: ReactNode;
};

export function AppFrame({ title, children, headerActions }: Props) {
  const [opened, { toggle }] = useDisclosure();

  return (
    <AppShell
      header={{ height: 64 }}
      navbar={{ width: 250, breakpoint: "sm", collapsed: { mobile: !opened } }}
      padding="md"
      style={{ height: "100dvh", overflow: "hidden" }}
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Text fw={700}>{title}</Text>
          </Group>
          {headerActions ? <Group gap="xs">{headerActions}</Group> : null}
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="md">
        <Text size="sm" c="dimmed">
          Navigation
        </Text>
      </AppShell.Navbar>
      <AppShell.Main style={{ height: "calc(100dvh - 64px)", overflow: "auto" }}>{children}</AppShell.Main>
    </AppShell>
  );
}
