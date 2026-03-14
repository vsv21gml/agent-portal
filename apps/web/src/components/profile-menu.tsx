"use client";

import { Avatar, Menu } from "@mantine/core";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiFetch } from "../lib/api-client";
import { clearToken } from "../lib/auth";
import { toastError } from "../lib/toast";

type MyProfile = {
  sub: string;
  email: string;
  role: string;
  displayName: string;
};

export function ProfileMenu() {
  const router = useRouter();
  const [profile, setProfile] = useState<MyProfile | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const me = await apiFetch<MyProfile>("auth/me");
        setProfile(me);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          clearToken();
          router.replace("/login?next=/portal");
          return;
        }
        toastError("Failed to load profile.");
      }
    };

    void load();
  }, [router]);

  const logout = () => {
    clearToken();
    router.replace("/login?next=/portal");
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
        <Menu.Item color="red" onClick={logout}>
          Log out
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
