import type { Metadata } from "next";
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
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
