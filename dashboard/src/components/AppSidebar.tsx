"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CalendarDays, CalendarRange, CalendarClock,
  Search, ChevronUp, PanelLeft, LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRouter, usePathname } from "next/navigation";
import {
  Collapsible, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CommandDialog, CommandEmpty, CommandGroup,
  CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import type { UserInfo } from "@/components/DashboardLayout";

// ── Navigation data model ──

interface NavItem {
  title: string;
  icon: React.ElementType;
  path: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
  defaultOpen?: boolean;
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "日常",
    defaultOpen: true,
    items: [
      { title: "日视图", icon: CalendarDays, path: "/day" },
      { title: "月视图", icon: CalendarRange, path: "/month" },
      { title: "年视图", icon: CalendarClock, path: "/year" },
    ],
  },
];

const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

function getInitials(name?: string): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// ── Sub-components ──

function NavGroupSection({ group, currentPath }: { group: NavGroup; currentPath: string }) {
  const [open, setOpen] = useState(group.defaultOpen ?? true);
  const router = useRouter();

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="px-3 mt-2">
        <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2.5">
          <span className="text-sm font-normal text-muted-foreground">{group.label}</span>
          <span className="flex h-7 w-7 shrink-0 items-center justify-center">
            <ChevronUp
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform duration-200",
                !open && "rotate-180"
              )}
              strokeWidth={1.5}
            />
          </span>
        </CollapsibleTrigger>
      </div>
      <div
        className="grid overflow-hidden"
        style={{
          gridTemplateRows: open ? "1fr" : "0fr",
          transition: "grid-template-rows 200ms ease-out",
        }}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="flex flex-col gap-0.5 px-3">
            {group.items.map((item) => (
              <button
                key={item.path}
                onClick={() => router.push(item.path)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-normal transition-colors",
                  currentPath === item.path
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                <span className="flex-1 text-left">{item.title}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Collapsible>
  );
}

function CollapsedNavItem({ item, currentPath }: { item: NavItem; currentPath: string }) {
  const router = useRouter();
  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <button
          onClick={() => router.push(item.path)}
          className={cn(
            "relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
            currentPath === item.path
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          )}
        >
          <item.icon className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {item.title}
      </TooltipContent>
    </Tooltip>
  );
}

// ── Main sidebar component ──

interface AppSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  user?: UserInfo;
}

export function AppSidebar({ collapsed, onToggle, user }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);

  // ⌘K / Ctrl+K shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSelect = useCallback(
    (path: string) => {
      setSearchOpen(false);
      router.push(path);
    },
    [router],
  );

  return (
    <aside
      className={cn(
        "sticky top-0 flex h-screen shrink-0 flex-col bg-background transition-all duration-300 ease-in-out overflow-hidden",
        collapsed ? "w-[68px]" : "w-[260px]"
      )}
    >
      {collapsed ? (
        /* ── Collapsed (icon-only) view ── */
        <div className="flex h-screen w-[68px] flex-col items-center">
          <div className="flex h-14 items-center justify-center">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <span className="text-sm font-bold">L</span>
            </div>
          </div>

          <button
            onClick={onToggle}
            aria-label="Expand sidebar"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors mb-1"
          >
            <PanelLeft className="h-4 w-4" aria-hidden="true" strokeWidth={1.5} />
          </button>

          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <button
                onClick={() => setSearchOpen(true)}
                aria-label="Search (⌘K)"
                className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors mb-2"
              >
                <Search className="h-4 w-4" aria-hidden="true" strokeWidth={1.5} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              Search (⌘K)
            </TooltipContent>
          </Tooltip>

          <nav className="flex-1 flex flex-col items-center gap-1 overflow-y-auto pt-1">
            {ALL_NAV_ITEMS.map((item) => (
              <CollapsedNavItem key={item.path} item={item} currentPath={pathname} />
            ))}
          </nav>

          {/* User info — collapsed */}
          {user && (
            <div className="py-3 flex justify-center w-full">
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <Avatar className="h-9 w-9 cursor-pointer">
                    {user.image && <AvatarImage src={user.image} alt={user.name ?? "User"} />}
                    <AvatarFallback className="text-xs">{getInitials(user.name)}</AvatarFallback>
                  </Avatar>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  {user.name ?? user.email ?? "User"}
                </TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>
      ) : (
        /* ── Expanded view ── */
        <div className="flex h-screen w-[260px] flex-col">
          <div className="px-3 h-14 flex items-center">
            <div className="flex w-full items-center justify-between px-3">
              <div className="flex items-center gap-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <span className="text-sm font-bold">L</span>
                </div>
                <span className="text-lg md:text-xl font-semibold text-foreground">Life.ai</span>
              </div>
              <button
                onClick={onToggle}
                aria-label="Collapse sidebar"
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground transition-colors"
              >
                <PanelLeft className="h-4 w-4" aria-hidden="true" strokeWidth={1.5} />
              </button>
            </div>
          </div>

          <div className="px-3 pb-1">
            <button
              onClick={() => setSearchOpen(true)}
              className="flex w-full items-center gap-3 rounded-lg bg-secondary px-3 py-1.5 transition-colors hover:bg-accent cursor-pointer"
            >
              <Search className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
              <span className="flex-1 text-left text-sm text-muted-foreground">Search</span>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center">
                <kbd className="pointer-events-none hidden rounded-sm border border-border bg-card px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-block">
                  ⌘K
                </kbd>
              </span>
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto pt-1">
            {NAV_GROUPS.map((group) => (
              <NavGroupSection key={group.label} group={group} currentPath={pathname} />
            ))}
          </nav>

          {/* User info — expanded */}
          {user && (
            <div className="px-4 py-3 border-t border-border">
              <div className="flex items-center gap-3">
                <Avatar className="h-9 w-9 shrink-0">
                  {user.image && <AvatarImage src={user.image} alt={user.name ?? "User"} />}
                  <AvatarFallback className="text-xs">{getInitials(user.name)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                </div>
                <button
                  aria-label="Log out"
                  onClick={() => {
                    window.location.href = "/api/auth/signout";
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" strokeWidth={1.5} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Search command palette */}
      <CommandDialog open={searchOpen} onOpenChange={setSearchOpen}>
        <CommandInput placeholder="Search pages..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          {NAV_GROUPS.map((group) => (
            <CommandGroup key={group.label} heading={group.label}>
              {group.items.map((item) => (
                <CommandItem
                  key={item.path}
                  value={item.title}
                  onSelect={() => handleSelect(item.path)}
                  className="gap-3 cursor-pointer"
                >
                  <item.icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                  <span>{item.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </aside>
  );
}
