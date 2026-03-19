"use client";

import { Avatar, Menu } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiFetch } from "../lib/api-client";
import { clearToken } from "../lib/auth";
import { getAdminLoginPath, getAdminResetPasswordPath, getPortalOrigin } from "../lib/auth-routing";

type MyProfile = {
  sub: string;
  email: string;
  role: string;
  displayName: string;
  passwordResetRequired: boolean;
};

export function ProfileMenu() {
  const router = useRouter();
  const [profile, setProfile] = useState<MyProfile | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const me = await apiFetch<MyProfile>("auth/me");
        if (me.passwordResetRequired) {
          router.replace(getAdminResetPasswordPath("/"));
          return;
        }
        setProfile(me);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          clearToken();
          router.replace(getAdminLoginPath("/"));
          return;
        }
        if (error instanceof ApiError && error.status === 403) {
          window.location.assign(getPortalOrigin());
          return;
        }
        notifications.show({
          title: "Failed",
          message: "Failed to load profile.",
          color: "red",
        });
      }
    };

    void load();
  }, [router]);

  const logout = async () => {
    try {
      await apiFetch("auth/logout", { method: "POST" });
    } catch {
      // ignore logout logging failures on client
    } finally {
      clearToken();
      router.replace(getAdminLoginPath("/"));
    }
  };

  const initials = (profile?.displayName || profile?.email || "U")
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((value) => value[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <Menu position="bottom-end" shadow="md" width={180}>
      <Menu.Target>
        <Avatar color="blue" radius="xl" style={{ cursor: "pointer" }}>
          {initials || "U"}
        </Avatar>
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Item onClick={() => router.push("/profile")}>Profile</Menu.Item>
        <Menu.Item color="red" onClick={() => void logout()}>
          Log out
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
