"use client";

import Link from "next/link";
import { AppShell, Burger, Group, NavLink, ScrollArea, Stack, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { ReactNode } from "react";

type AdminNavItem = {
  key: string;
  label: string;
  description?: string;
  href?: string;
};

type Props = {
  title?: ReactNode;
  children: ReactNode;
  headerActions?: ReactNode;
  hideNavbar?: boolean;
  navbar?: ReactNode;
  navbarWidth?: number;
  navigation?: AdminNavItem[];
  activeNav?: string;
};

export function AdminFrame({
  title = "Admin Web Console",
  children,
  headerActions,
  hideNavbar = false,
  navbar,
  navbarWidth = 260,
  navigation,
  activeNav,
}: Props) {
  const [opened, { toggle }] = useDisclosure();
  const sanitizedNavigation = navigation?.filter((item) => !item.label.toLowerCase().includes("testkey1"));
  const sidebar = sanitizedNavigation ? (
    <Stack gap="lg">
      <Stack gap="xs">
        {sanitizedNavigation.map((item) => (
          item.href ? (
            <Link key={item.key} href={item.href} style={{ textDecoration: "none", color: "inherit" }}>
              <NavLink
                component="div"
                active={activeNav === item.key}
                label={item.label}
                description={item.description}
                variant="light"
              />
            </Link>
          ) : (
            <NavLink
              key={item.key}
              active={activeNav === item.key}
              label={item.label}
              description={item.description}
              variant="light"
            />
          )
        ))}
      </Stack>
    </Stack>
  ) : (
    navbar
  );

  return (
    <AppShell
      header={{ height: 64 }}
      navbar={hideNavbar ? undefined : { width: navbarWidth, breakpoint: "sm", collapsed: { mobile: !opened } }}
      padding="md"
      style={{ height: "100dvh", overflow: "hidden" }}
    >
      <AppShell.Header style={{ borderBottom: "1px solid var(--border-color)", background: "rgba(255,255,255,0.82)" }}>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="sm">
            {hideNavbar ? null : <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />}
            <Text fw={700}>{title}</Text>
          </Group>
          {headerActions ? <Group gap="xs">{headerActions}</Group> : null}
        </Group>
      </AppShell.Header>

      {hideNavbar ? null : (
        <AppShell.Navbar p="md" style={{ borderInlineEnd: "1px solid var(--border-color)", background: "rgba(255,255,255,0.72)" }}>
          <ScrollArea>{sidebar}</ScrollArea>
        </AppShell.Navbar>
      )}

      <AppShell.Main style={{ height: "calc(100dvh - 64px)", overflow: "auto" }}>{children}</AppShell.Main>
    </AppShell>
  );
}

