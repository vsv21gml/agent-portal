"use client";

import { MantineProvider, createTheme } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { ReactNode } from "react";

const theme = createTheme({
  primaryColor: "cyan",
  fontFamily: "Space Grotesk, sans-serif",
  defaultRadius: "md",
});

type Props = {
  children: ReactNode;
};

export function Providers({ children }: Props) {
  return (
    <MantineProvider theme={theme}>
      <Notifications position="top-right" />
      {children}
    </MantineProvider>
  );
}
