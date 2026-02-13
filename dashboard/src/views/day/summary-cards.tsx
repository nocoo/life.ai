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
import type { DaySummary } from "@/models/day-view";

export interface SummaryCardsProps {
  summary: DaySummary;
}

interface SummaryCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle?: string;
}

function SummaryCard({
  icon,
  label,
  value,
  subtitle,
}: SummaryCardProps) {
  return (
    <div className="rounded-card bg-secondary p-4">
      <div className="flex items-center gap-3">
        <div className="text-muted-foreground">{icon}</div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold text-foreground font-display tracking-tight truncate">{value}</p>
          {subtitle && (
            <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Format number with thousands separator */
const formatNumber = (n: number): string => n.toLocaleString();

/** Format duration in hours and minutes */
const formatHours = (hours: number | null): string => {
  if (hours === null) return "-";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m > 0 ? `${h}小时${m}分` : `${h}小时`;
};

/** Format distance in km */
const formatDistance = (meters: number | null): string => {
  if (meters === null) return "-";
  return `${(meters / 1000).toFixed(1)} 公里`;
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
        icon={<Footprints className="h-5 w-5" strokeWidth={1.5} />}
        label="步数"
        value={formatNumber(summary.steps)}
      />

      {/* Heart Rate */}
      <SummaryCard
        icon={<Heart className="h-5 w-5" strokeWidth={1.5} />}
        label="心率"
        value={summary.heartRateAvg ? `${summary.heartRateAvg} 次/分` : "-"}
        subtitle={
          summary.heartRateMin && summary.heartRateMax
            ? `${summary.heartRateMin}-${summary.heartRateMax} 次/分`
            : undefined
        }
      />

      {/* Active Energy */}
      <SummaryCard
        icon={<Flame className="h-5 w-5" strokeWidth={1.5} />}
        label="活动能量"
        value={
          summary.activeEnergy ? `${Math.round(summary.activeEnergy)} 千卡` : "-"
        }
      />

      {/* Exercise */}
      <SummaryCard
        icon={<Timer className="h-5 w-5" strokeWidth={1.5} />}
        label="运动"
        value={
          summary.exerciseMinutes ? `${summary.exerciseMinutes} 分钟` : "-"
        }
      />

      {/* Sleep */}
      <SummaryCard
        icon={<Moon className="h-5 w-5" strokeWidth={1.5} />}
        label="睡眠"
        value={formatHours(summary.sleepHours)}
      />

      {/* Distance */}
      <SummaryCard
        icon={<MapPin className="h-5 w-5" strokeWidth={1.5} />}
        label="距离"
        value={formatDistance(summary.distance)}
        subtitle={
          summary.locationCount > 0
            ? `${summary.locationCount} 个地点`
            : undefined
        }
      />

      {/* Spending */}
      <SummaryCard
        icon={<Wallet className="h-5 w-5" strokeWidth={1.5} />}
        label="支出"
        value={formatCurrency(summary.expense)}
        subtitle={
          summary.transactionCount > 0
            ? `${summary.transactionCount} 笔交易`
            : undefined
        }
      />

      {/* Net */}
      {summary.income > 0 && (
        <SummaryCard
          icon={<TrendingUp className="h-5 w-5" strokeWidth={1.5} />}
          label="净收入"
          value={formatCurrency(summary.net)}
          subtitle={`收入：${formatCurrency(summary.income)}`}
        />
      )}
    </div>
  );
}
