import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import { DashboardLayout } from "@/components/DashboardLayout";
import "./globals.css";

export const metadata: Metadata = {
  title: "Life.AI Dashboard",
  description: "Dashboard for health, footprint, and finance data",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <DashboardLayout>{children}</DashboardLayout>
        </ThemeProvider>
      </body>
    </html>
  );
}
