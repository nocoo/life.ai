"use client";

import {
  Footprints,
  Heart,
  Flame,
  Moon,
  Wallet,
  MapPin,
  Timer,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { DaySummary } from "@/models/day-view";

export interface SummaryCardsProps {
  summary: DaySummary;
}

interface SummaryCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle?: string;
  iconColor?: string;
}

function SummaryCard({
  icon,
  label,
  value,
  subtitle,
  iconColor = "text-primary",
}: SummaryCardProps) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`${iconColor}`}>{icon}</div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold truncate">{value}</p>
          {subtitle && (
            <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** Format number with thousands separator */
const formatNumber = (n: number): string => n.toLocaleString();

/** Format duration in hours and minutes */
const formatHours = (hours: number | null): string => {
  if (hours === null) return "-";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

/** Format distance in km */
const formatDistance = (meters: number | null): string => {
  if (meters === null) return "-";
  return `${(meters / 1000).toFixed(1)} km`;
};

/** Format currency */
const formatCurrency = (amount: number): string => {
  return `¥${amount.toFixed(2)}`;
};

export function SummaryCards({ summary }: SummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {/* Steps */}
      <SummaryCard
        icon={<Footprints className="h-5 w-5" />}
        label="Steps"
        value={formatNumber(summary.steps)}
        iconColor="text-green-500"
      />

      {/* Heart Rate */}
      <SummaryCard
        icon={<Heart className="h-5 w-5" />}
        label="Heart Rate"
        value={summary.heartRateAvg ? `${summary.heartRateAvg} bpm` : "-"}
        subtitle={
          summary.heartRateMin && summary.heartRateMax
            ? `${summary.heartRateMin}-${summary.heartRateMax} bpm`
            : undefined
        }
        iconColor="text-red-500"
      />

      {/* Active Energy */}
      <SummaryCard
        icon={<Flame className="h-5 w-5" />}
        label="Active Energy"
        value={
          summary.activeEnergy ? `${Math.round(summary.activeEnergy)} kcal` : "-"
        }
        iconColor="text-orange-500"
      />

      {/* Exercise */}
      <SummaryCard
        icon={<Timer className="h-5 w-5" />}
        label="Exercise"
        value={
          summary.exerciseMinutes ? `${summary.exerciseMinutes} min` : "-"
        }
        iconColor="text-blue-500"
      />

      {/* Sleep */}
      <SummaryCard
        icon={<Moon className="h-5 w-5" />}
        label="Sleep"
        value={formatHours(summary.sleepHours)}
        iconColor="text-indigo-500"
      />

      {/* Distance */}
      <SummaryCard
        icon={<MapPin className="h-5 w-5" />}
        label="Distance"
        value={formatDistance(summary.distance)}
        subtitle={
          summary.locationCount > 0
            ? `${summary.locationCount} locations`
            : undefined
        }
        iconColor="text-cyan-500"
      />

      {/* Spending */}
      <SummaryCard
        icon={<Wallet className="h-5 w-5" />}
        label="Spending"
        value={formatCurrency(summary.expense)}
        subtitle={
          summary.transactionCount > 0
            ? `${summary.transactionCount} transactions`
            : undefined
        }
        iconColor="text-rose-500"
      />

      {/* Net */}
      {summary.income > 0 && (
        <SummaryCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="Net"
          value={formatCurrency(summary.net)}
          subtitle={`Income: ${formatCurrency(summary.income)}`}
          iconColor={summary.net >= 0 ? "text-emerald-500" : "text-rose-500"}
        />
      )}
    </div>
  );
}
