"use client";

import { Avatar, Menu } from "@mantine/core";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiFetch } from "../lib/api-client";
import { clearToken } from "../lib/auth";
import { getPortalLoginPath, getPortalResetPasswordPath } from "../lib/auth-routing";
import { toastError } from "../lib/toast";

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
          router.replace(getPortalResetPasswordPath("/portal"));
          return;
        }
        setProfile(me);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          clearToken();
          router.replace(getPortalLoginPath("/portal"));
          return;
        }
        toastError("Failed to load profile.");
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
      router.replace(getPortalLoginPath("/portal"));
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
        <Menu.Item onClick={() => router.push("/portal/profile")}>Profile</Menu.Item>
        <Menu.Item color="red" onClick={() => void logout()}>
          Log out
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
