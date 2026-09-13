"use client";

import { type ReactNode, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Github } from "@/components/icons/github";
import { AppSidebar } from "@/components/AppSidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { ROUTE_LABELS } from "@/lib/navigation";
import {
  Button,
  ContentIsland,
  Sheet,
  SheetContent,
  SheetTitle,
  ThemeToggle,
} from "@nocoo/basalt";
import { AppHeader } from "@nocoo/basalt/components/app-header";
import { AppMain, AppShell, AppSkipLink } from "@nocoo/basalt/components/app-shell";
import { Menu } from "lucide-react";

export interface UserInfo {
  name?: string;
  email?: string;
  image?: string;
}

interface DashboardLayoutProps {
  children: ReactNode;
  user?: UserInfo;
}

export function DashboardLayout({ children, user }: DashboardLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isMobile = useIsMobile();
  const pathname = usePathname();
  const title = ROUTE_LABELS[pathname] ?? "Life.ai";
  const breadcrumbs = pathname === "/settings/storage"
    ? [{ href: "/settings", label: "Settings" }]
    : [];

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <AppShell>
      <AppSkipLink>Skip to main content</AppSkipLink>
      {!isMobile ? (
        <AppSidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed((value) => !value)}
          user={user}
        />
      ) : (
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent
            side="left"
            className="w-[260px] max-w-[260px] border-0 bg-basalt-background p-0"
          >
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <AppSidebar
              collapsed={false}
              onToggle={() => setMobileOpen(false)}
              user={user}
            />
          </SheetContent>
        </Sheet>
      )}
      <AppMain>
        <AppHeader
          leading={
            isMobile ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setMobileOpen(true)}
                aria-label="Open navigation"
              >
                <Menu className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
              </Button>
            ) : null
          }
          breadcrumbs={breadcrumbs}
          title={title}
          actions={
            <>
              <Button variant="ghost" size="icon" asChild>
                <a
                  href="https://github.com/nocoo/life.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="GitHub repository"
                >
                  <Github className="h-[18px] w-[18px]" strokeWidth={1.5} aria-hidden="true" />
                </a>
              </Button>
              <ThemeToggle aria-label="Toggle theme" />
            </>
          }
        />
        <div className="flex min-h-0 flex-1 flex-col px-2 pb-2 md:px-3 md:pb-3">
          <ContentIsland>{children}</ContentIsland>
        </div>
      </AppMain>
    </AppShell>
  );
}
