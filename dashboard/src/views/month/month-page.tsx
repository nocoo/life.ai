"use client";

import { useEffect } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { useMonthStore } from "@/viewmodels/month-store";
import { MonthNavigation } from "./month-navigation";
import { MonthHealthPanel } from "./month-health-panel";
import { MonthFootprintPanel } from "./month-footprint-panel";
import { MonthPixiuPanel } from "./month-pixiu-panel";
import { StatCard, StatGrid } from "@/components/charts/stat-card";
import {
  Footprints,
  Heart,
  Route,
  Wallet,
  Moon,
  Flame,
  Activity,
  Dumbbell,
} from "lucide-react";

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {/* Stats skeleton */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-card bg-secondary p-4">
            <Skeleton className="h-3 w-20 mb-1.5" />
            <Skeleton className="h-6 w-28" />
          </div>
        ))}
      </div>

      {/* Charts skeleton */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-card bg-secondary p-4">
            <Skeleton className="h-4 w-28 mb-3" />
            <Skeleton className="h-40 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ErrorDisplay({ message }: { message: string }) {
  return (
    <div className="flex h-[400px] items-center justify-center">
      <div className="text-center">
        <p className="text-lg font-medium text-destructive">错误</p>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

/** Format number with K suffix */
const formatNumber = (value: number): string => {
  if (value >= 10000) {
    return `${(value / 1000).toFixed(1)}k`;
  }
  return value.toLocaleString();
};

/** Format currency compact */
const formatCurrency = (value: number): string => {
  const absValue = Math.abs(value);
  const prefix = value < 0 ? "-" : "";
  if (absValue >= 10000) {
    return `${prefix}¥${(absValue / 10000).toFixed(1)}万`;
  }
  return `${prefix}¥${absValue.toFixed(0)}`;
};

/** Format distance */
const formatDistance = (meters: number): string => {
  if (meters < 1000) {
    return `${Math.round(meters)} 米`;
  }
  return `${(meters / 1000).toFixed(1)} 公里`;
};

/** Format duration in minutes */
const formatDuration = (minutes: number): string => {
  if (minutes < 60) {
    return `${Math.round(minutes)}分钟`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return mins > 0 ? `${hours}小时${mins}分` : `${hours}小时`;
};

function MonthContent() {
  const { data } = useMonthStore();

  if (!data) return null;

  const { summary, health, footprint, pixiu } = data;
  const { steps, heartRate, activity, workouts } = health;

  return (
    <div className="space-y-6">
      {/* ===== Section 1: Overview Stats ===== */}
      <section>
        <h2 className="text-sm font-normal text-muted-foreground mb-2">月度总览</h2>
        <StatGrid columns={4}>
          <StatCard
            title="总步数"
            value={formatNumber(summary.totalSteps)}
            subtitle={steps ? `日均 ${formatNumber(steps.avgSteps)}` : undefined}
            icon={Footprints}
          />
          <StatCard
            title="平均心率"
            value={summary.avgHeartRate ? `${Math.round(summary.avgHeartRate)} bpm` : "-"}
            subtitle={heartRate ? `静息 ${Math.round(heartRate.avgRestingHeartRate)}` : undefined}
            icon={Heart}
          />
          <StatCard
            title="移动距离"
            value={summary.totalDistance ? formatDistance(summary.totalDistance) : "-"}
            subtitle={`${summary.daysWithTracking} 天记录`}
            icon={Route}
          />
          <StatCard
            title="净收支"
            value={formatCurrency(summary.totalNet)}
            subtitle={`${summary.transactionCount} 笔交易`}
            icon={Wallet}
          />
        </StatGrid>

        <div className="mt-2">
          <StatGrid columns={4}>
            <StatCard
              title="平均睡眠"
              value={summary.avgSleepHours ? `${summary.avgSleepHours.toFixed(1)} 小时` : "-"}
              icon={Moon}
            />
            <StatCard
              title="活动能量"
              value={activity ? formatNumber(Math.round(activity.totalActiveEnergy)) : "-"}
              subtitle={activity ? `日均 ${Math.round(activity.avgActiveEnergy)} kcal` : undefined}
              icon={Flame}
            />
            <StatCard
              title="锻炼次数"
              value={summary.totalWorkouts}
              subtitle={workouts ? formatDuration(workouts.totalDuration) : undefined}
              icon={Activity}
            />
            <StatCard
              title="三圈达成"
              value={activity?.ringCloseCount?.all ?? 0}
              subtitle={`运动${activity?.ringCloseCount?.move ?? 0}/锻炼${activity?.ringCloseCount?.exercise ?? 0}/站立${activity?.ringCloseCount?.stand ?? 0}`}
              icon={Dumbbell}
            />
          </StatGrid>
        </div>
      </section>

      {/* ===== Section 2: Health Charts ===== */}
      <section>
        <h2 className="text-sm font-normal text-muted-foreground mb-2">健康数据</h2>
        <MonthHealthPanel data={health} />
      </section>

      {/* ===== Section 3: Footprint Charts ===== */}
      {(footprint.dailyDistance.length > 0 || footprint.byTransportMode.length > 0) && (
        <section>
          <h2 className="text-sm font-normal text-muted-foreground mb-2">轨迹数据</h2>
          <MonthFootprintPanel data={footprint} />
        </section>
      )}

      {/* ===== Section 4: Finance Charts ===== */}
      <section>
        <h2 className="text-sm font-normal text-muted-foreground mb-2">财务数据</h2>
        <MonthPixiuPanel data={pixiu} />
      </section>
    </div>
  );
}

export function MonthPage() {
  const {
    selectedMonth,
    loading,
    error,
    data,
    goCurrentMonth,
    goPrevMonth,
    goNextMonth,
    toggleCalendar,
    loadData,
  } = useMonthStore();

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div className="space-y-4">
        {/* Month Navigation */}
        <MonthNavigation
          selectedMonth={selectedMonth}
          onPrevMonth={goPrevMonth}
          onNextMonth={goNextMonth}
          onCurrentMonth={goCurrentMonth}
          onToggleCalendar={toggleCalendar}
        />

        {/* Loading state */}
        {loading && <LoadingSkeleton />}

        {/* Error state */}
        {error && <ErrorDisplay message={error} />}

        {/* Main content */}
        {!loading && !error && data && <MonthContent />}
    </div>
  );
}
