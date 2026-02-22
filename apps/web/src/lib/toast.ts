"use client";

import { notifications } from "@mantine/notifications";

export function toastSuccess(message: string) {
  notifications.show({
    color: "teal",
    title: "Success",
    message,
  });
}

export function toastError(message: string) {
  notifications.show({
    color: "red",
    title: "Error",
    message,
  });
}
