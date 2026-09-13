"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, PanelLeft, Search } from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPalette,
  Sidebar,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarIconItem,
  SidebarItem,
  SidebarNav,
  SidebarSearch,
  SidebarUser,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@nocoo/basalt";
import { ALL_NAV_ITEMS, NAV_GROUPS } from "@/lib/navigation";
import { APP_VERSION } from "@/lib/version";
import type { UserInfo } from "@/components/DashboardLayout";

function getInitials(name?: string): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

interface AppSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  user?: UserInfo;
}

export function AppSidebar({ collapsed, onToggle, user }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const navigate = useCallback(
    (href: string) => {
      setSearchOpen(false);
      router.push(href);
    },
    [router],
  );

  const avatar = user ? (
    <Avatar className="h-9 w-9 shrink-0">
      {user.image && <AvatarImage src={user.image} alt={user.name ?? "User"} />}
      <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
    </Avatar>
  ) : null;

  return (
    <Sidebar collapsed={collapsed} aria-label="Primary navigation">
      {collapsed ? (
        <>
          <SidebarHeader className="justify-start px-3">
            <Image src="/logo-24.png" alt="Life.ai" width={24} height={24} />
          </SidebarHeader>
          <Button
            variant="ghost"
            size="icon"
            className="mb-1 ml-1.5"
            onClick={onToggle}
            aria-label="Expand sidebar"
          >
            <PanelLeft aria-hidden="true" />
          </Button>
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <SidebarIconItem
                className="mb-2 ml-1.5"
                onClick={() => setSearchOpen(true)}
                aria-label="Search (⌘K)"
              >
                <Search className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
              </SidebarIconItem>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              Search (⌘K)
            </TooltipContent>
          </Tooltip>
          <SidebarNav className="w-full gap-1 pt-1">
            {ALL_NAV_ITEMS.map((item) => (
              <Tooltip key={item.href} delayDuration={0}>
                <TooltipTrigger asChild>
                  <SidebarIconItem
                    active={pathname === item.href}
                    className="ml-1.5"
                    onClick={() => navigate(item.href)}
                    aria-label={item.label}
                  >
                    <item.icon className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                  </SidebarIconItem>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  {item.label}
                </TooltipContent>
              </Tooltip>
            ))}
          </SidebarNav>
          {user && (
            <SidebarFooter className="px-4">
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <span className="inline-flex">{avatar}</span>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  {user.name ?? user.email ?? "User"}
                </TooltipContent>
              </Tooltip>
            </SidebarFooter>
          )}
        </>
      ) : (
        <>
          <SidebarHeader>
            <div className="flex w-full items-center justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <Image src="/logo-24.png" alt="Life.ai" width={24} height={24} />
                <span className="truncate text-lg font-semibold text-basalt-foreground">Life.ai</span>
                <span className="shrink-0 rounded-md bg-basalt-secondary px-1.5 py-0.5 font-mono text-[10px] leading-none font-medium text-basalt-muted-foreground">
                  v{APP_VERSION}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={onToggle}
                aria-label="Collapse sidebar"
              >
                <PanelLeft aria-hidden="true" />
              </Button>
            </div>
          </SidebarHeader>
          <div className="px-3 pb-1">
            <SidebarSearch onClick={() => setSearchOpen(true)}>Search</SidebarSearch>
          </div>
          <SidebarNav className="pt-1">
            {NAV_GROUPS.map((group) => (
              <SidebarGroup
                key={group.label}
                label={group.label}
                defaultOpen={group.defaultOpen}
              >
                {group.items.map((item) => (
                  <SidebarItem
                    key={item.href}
                    active={pathname === item.href}
                    onClick={() => navigate(item.href)}
                  >
                    <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                    <span className="flex-1 truncate text-left">{item.label}</span>
                  </SidebarItem>
                ))}
              </SidebarGroup>
            ))}
          </SidebarNav>
          {user && (
            <SidebarFooter>
              <SidebarUser
                name={user.name ?? "User"}
                email={user.email}
                avatar={avatar}
                action={
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Log out"
                    onClick={() => {
                      window.location.href = "/api/auth/signout";
                    }}
                  >
                    <LogOut className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                  </Button>
                }
              />
            </SidebarFooter>
          )}
        </>
      )}

      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen}>
        <CommandInput placeholder="Search pages..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          {NAV_GROUPS.map((group) => (
            <CommandGroup key={group.label} heading={group.label}>
              {group.items.map((item) => (
                <CommandItem
                  key={item.href}
                  value={item.label}
                  onSelect={() => navigate(item.href)}
                >
                  <item.icon className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                  <span>{item.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandPalette>
    </Sidebar>
  );
}
