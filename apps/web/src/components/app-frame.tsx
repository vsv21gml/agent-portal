"use client";

import { AppShell, Burger, Group, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { ReactNode } from "react";

type Props = {
  title: ReactNode;
  children: ReactNode;
  headerActions?: ReactNode;
  navbar?: ReactNode;
  navbarWidth?: number;
  hideNavbar?: boolean;
};

export function AppFrame({ title, children, headerActions, navbar, navbarWidth = 250, hideNavbar = false }: Props) {
  const [opened, { toggle }] = useDisclosure();

  if (hideNavbar) {
    return (
      <div style={{ height: "100dvh", overflow: "hidden" }}>
        <div style={{ height: 64, borderBottom: "1px solid var(--mantine-color-gray-3)" }}>
          <Group h="100%" px="md" justify="space-between">
            <Group>
              <Text fw={700}>{title}</Text>
            </Group>
            {headerActions ? <Group gap="xs">{headerActions}</Group> : null}
          </Group>
        </div>
        <main style={{ height: "calc(100dvh - 64px)", overflow: "auto", padding: "var(--mantine-spacing-md)" }}>{children}</main>
      </div>
    );
  }

  return (
    <AppShell
      header={{ height: 64 }}
      navbar={{ width: navbarWidth, breakpoint: "sm", collapsed: { mobile: !opened } }}
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
        {navbar ?? (
          <Text size="sm" c="dimmed">
            Navigation
          </Text>
        )}
      </AppShell.Navbar>
      <AppShell.Main style={{ height: "calc(100dvh - 64px)", overflow: "auto" }}>{children}</AppShell.Main>
    </AppShell>
  );
}
