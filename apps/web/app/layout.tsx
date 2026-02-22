import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "./globals.css";
import { Space_Grotesk } from "next/font/google";
import { ReactNode } from "react";
import { Providers } from "./providers";

const font = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-space-grotesk",
});

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" className={font.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
