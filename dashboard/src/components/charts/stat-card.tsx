"use client";

import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

export interface StatCardProps {
  /** Card title */
  title: string;
  /** Main value to display */
  value: string | number;
  /** Optional subtitle or description */
  subtitle?: string;
  /** Optional icon */
  icon?: LucideIcon;
  /** Icon color class */
  iconColor?: string;
  /** Trend indicator (positive = up, negative = down) */
  trend?: {
    value: number;
    label?: string;
  };
  /** Additional class name */
  className?: string;
}

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconColor = "text-muted-foreground",
  trend,
  className,
}: StatCardProps) {
  const isPositiveTrend = trend && trend.value > 0;
  const isNegativeTrend = trend && trend.value < 0;

  return (
    <div
      className={cn(
        "rounded-lg border bg-card px-3 py-2.5 shadow-sm",
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5 min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground truncate">{title}</p>
          <p className="text-xl font-bold tracking-tight tabular-nums truncate">
            {typeof value === "number" ? value.toLocaleString() : value}
          </p>
          {subtitle && (
            <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>
          )}
        </div>
        {Icon && (
          <div className={cn("rounded-md bg-muted p-1.5 flex-shrink-0", iconColor)}>
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>
      {trend && (
        <div className="mt-1.5 flex items-center gap-1 text-[11px]">
          <span
            className={cn(
              "font-medium tabular-nums",
              isPositiveTrend && "text-green-600",
              isNegativeTrend && "text-red-600",
              !isPositiveTrend && !isNegativeTrend && "text-muted-foreground"
            )}
          >
            {isPositiveTrend && "+"}
            {trend.value}%
          </span>
          {trend.label && (
            <span className="text-muted-foreground">{trend.label}</span>
          )}
        </div>
      )}
    </div>
  );
}

export interface StatGridProps {
  children: React.ReactNode;
  columns?: 2 | 3 | 4;
  className?: string;
}

export function StatGrid({ children, columns = 4, className }: StatGridProps) {
  const gridCols = {
    2: "grid-cols-2",
    3: "grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-2 lg:grid-cols-4",
  };

  return (
    <div className={cn("grid gap-2", gridCols[columns], className)}>
      {children}
    </div>
  );
}
