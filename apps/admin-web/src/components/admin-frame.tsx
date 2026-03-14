"use client";

import { AppShell, Burger, Group, NavLink, ScrollArea, Stack, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { ReactNode } from "react";

type AdminNavItem = {
  key: string;
  label: string;
  description?: string;
};

type Props = {
  title?: ReactNode;
  children: ReactNode;
  headerActions?: ReactNode;
  navbar?: ReactNode;
  navbarWidth?: number;
  navigation?: AdminNavItem[];
  activeNav?: string;
  onNavigate?: (key: string) => void;
};

export function AdminFrame({
  title = "Admin Web Console",
  children,
  headerActions,
  navbar,
  navbarWidth = 260,
  navigation,
  activeNav,
  onNavigate,
}: Props) {
  const [opened, { toggle }] = useDisclosure();
  const sanitizedNavigation = navigation?.filter((item) => !item.label.toLowerCase().includes("testkey1"));
  const sidebar = sanitizedNavigation ? (
    <Stack gap="lg">
      <Stack gap={2}>
        <Text size="xs" tt="uppercase" fw={700} c="dimmed">
          Console
        </Text>
        <Text size="sm" c="dimmed">
          Workspace administration
        </Text>
      </Stack>
      <Stack gap="xs">
        {sanitizedNavigation.map((item) => (
          <NavLink
            key={item.key}
            active={activeNav === item.key}
            label={item.label}
            description={item.description}
            onClick={() => onNavigate?.(item.key)}
            variant="light"
          />
        ))}
      </Stack>
    </Stack>
  ) : (
    navbar
  );

  return (
    <AppShell
      header={{ height: 64 }}
      navbar={{ width: navbarWidth, breakpoint: "sm", collapsed: { mobile: !opened } }}
      padding="md"
      style={{ height: "100dvh", overflow: "hidden" }}
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="sm">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Stack gap={0}>
              <Text fw={700}>{title}</Text>
              <Text size="xs" c="dimmed">
                Operations console
              </Text>
            </Stack>
          </Group>
          {headerActions ? <Group gap="xs">{headerActions}</Group> : null}
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md" style={{ borderInlineEnd: "1px solid var(--mantine-color-gray-3)" }}>
        <ScrollArea>{sidebar}</ScrollArea>
      </AppShell.Navbar>

      <AppShell.Main style={{ height: "calc(100dvh - 64px)", overflow: "auto" }}>{children}</AppShell.Main>
    </AppShell>
  );
}

