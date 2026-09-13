import type { Metadata } from "next";
import { AppProviders } from "@/components/AppProviders";
import { THEME_INIT_SCRIPT } from "@/lib/theme-init";
import "./globals.css";

export const metadata: Metadata = {
  title: "life.ai - 个人数据中心",
  description: "Dashboard for health, footprint, and finance data",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="bg-basalt-background text-basalt-foreground antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
