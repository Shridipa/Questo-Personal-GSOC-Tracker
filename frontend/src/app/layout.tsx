import type { Metadata, Viewport } from "next";
import { AppShell } from "@/components/questline/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Questo — your open-source learning adventure",
    template: "%s | Questo",
  },
  description:
    "Turn your open-source goals into small, rewarding daily quests. Your next contribution starts here.",
  applicationName: "Questo",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Questo",
  },
  icons: {
    icon: "/icons/questo.svg",
    apple: "/icons/questo-phoenix.png",
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#fffdf7",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html data-scroll-behavior="smooth" lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
