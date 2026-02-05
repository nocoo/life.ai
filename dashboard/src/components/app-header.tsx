"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ui/theme-toggle";

const navItems = [
  { href: "/day", label: "日" },
  { href: "/month", label: "月" },
  { href: "/year", label: "年" },
];

export function AppHeader() {
  const pathname = usePathname();

  return (
    <header className="flex items-center justify-between border-b border-border bg-background px-4 py-2">
      {/* Logo and Title */}
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <span className="text-base font-bold">L</span>
        </div>
        <h1 className="text-lg font-semibold">Life.ai</h1>
      </div>

      {/* Navigation */}
      <nav className="flex items-center gap-0.5" role="navigation" aria-label="主导航">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
              aria-current={isActive ? "page" : undefined}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Theme Toggle */}
      <div className="flex items-center justify-end w-28">
        <ThemeToggle />
      </div>
    </header>
  );
}
