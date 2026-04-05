import type { LucideIcon } from "lucide-react";
import { CalendarDays, CalendarRange, CalendarClock } from "lucide-react";

export interface NavItemDef {
  href: string;
  label: string;
  icon: LucideIcon;
  external?: boolean;
}

export interface NavGroupDef {
  label: string;
  items: NavItemDef[];
  defaultOpen?: boolean;
}

export const NAV_GROUPS: NavGroupDef[] = [
  {
    label: "日常",
    defaultOpen: true,
    items: [
      { href: "/day", label: "日视图", icon: CalendarDays },
      { href: "/month", label: "月视图", icon: CalendarRange },
      { href: "/year", label: "年视图", icon: CalendarClock },
    ],
  },
];

export const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

export const ROUTE_LABELS: Record<string, string> = {
  "/": "首页",
  "/day": "日视图",
  "/month": "月视图",
  "/year": "年视图",
};
