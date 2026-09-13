import type { Metadata } from "next";
import { AppProviders } from "@/components/AppProviders";
import "./globals.css";

export const metadata: Metadata = {
  title: "life.ai - 个人数据中心",
  description: "Dashboard for health, footprint, and finance data",
};

const themeInitScript = `(function(){try{var s=localStorage.getItem("theme");var d=window.matchMedia("(prefers-color-scheme: dark)").matches;var isDark=s==="dark"||(s!=="light"&&d);document.documentElement.classList.toggle("dark",isDark);document.documentElement.classList.toggle("light",!isDark);document.documentElement.dataset.mode=isDark?"dark":"light";}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="bg-basalt-background text-basalt-foreground antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
