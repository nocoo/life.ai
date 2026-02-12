"use client";

import { useEffect } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useYearStore } from "@/viewmodels/year-store";
import { YearNavigation } from "./year-navigation";
import { YearHealthPanel } from "./year-health-panel";
import { YearFootprintPanel } from "./year-footprint-panel";
import { YearPixiuPanel } from "./year-pixiu-panel";
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
      <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-4 px-3 pb-3">
              <Skeleton className="h-3 w-20 mb-1.5" />
              <Skeleton className="h-6 w-28" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <Skeleton className="h-4 w-28" />
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <Skeleton className="h-28 w-full" />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-4 w-28" />
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <Skeleton className="h-40 w-full" />
            </CardContent>
          </Card>
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

const formatNumber = (value: number): string => {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 10000) {
    return `${(value / 1000).toFixed(1)}k`;
  }
  return value.toLocaleString();
};

const formatCurrency = (value: number): string => {
  const absValue = Math.abs(value);
  const prefix = value < 0 ? "-" : "";
  if (absValue >= 10000) {
    return `${prefix}¥${(absValue / 10000).toFixed(1)}万`;
  }
  return `${prefix}¥${absValue.toFixed(0)}`;
};

const formatDistance = (meters: number): string => {
  if (meters < 1000) {
    return `${Math.round(meters)} 米`;
  }
  if (meters >= 1000000) {
    return `${(meters / 1000).toFixed(0)} 公里`;
  }
  return `${(meters / 1000).toFixed(1)} 公里`;
};

const formatDuration = (minutes: number): string => {
  if (minutes < 60) {
    return `${Math.round(minutes)}分钟`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}小时`;
  }
  const days = Math.floor(hours / 24);
  return `${days}天`;
};

function YearContent() {
  const { data, selectedYear } = useYearStore();

  if (!data) return null;

  const { summary, health, footprint, pixiu } = data;
  const { steps, heartRate, activity, workouts } = health;

  return (
    <div className="space-y-6">
      {/* Section 1: Overview Stats */}
      <section>
        <h2 className="text-sm font-medium text-muted-foreground mb-2">年度总览</h2>
        <StatGrid columns={4}>
          <StatCard
            title="总步数"
            value={formatNumber(summary.totalSteps)}
            subtitle={steps ? `日均 ${formatNumber(steps.avgSteps)}` : undefined}
            icon={Footprints}
            iconColor="text-green-500"
          />
          <StatCard
            title="平均心率"
            value={summary.avgHeartRate ? `${Math.round(summary.avgHeartRate)} bpm` : "-"}
            subtitle={heartRate ? `静息 ${Math.round(heartRate.avgRestingHeartRate)}` : undefined}
            icon={Heart}
            iconColor="text-red-500"
          />
          <StatCard
            title="移动距离"
            value={summary.totalDistance ? formatDistance(summary.totalDistance) : "-"}
            subtitle={`${summary.daysWithTracking} 天记录`}
            icon={Route}
            iconColor="text-blue-500"
          />
          <StatCard
            title="净收支"
            value={formatCurrency(summary.totalNet)}
            subtitle={`${summary.transactionCount} 笔交易`}
            icon={Wallet}
            iconColor={summary.totalNet >= 0 ? "text-emerald-500" : "text-orange-500"}
          />
        </StatGrid>

        <div className="mt-2">
          <StatGrid columns={4}>
            <StatCard
              title="平均睡眠"
              value={summary.avgSleepHours ? `${summary.avgSleepHours.toFixed(1)} 小时` : "-"}
              icon={Moon}
              iconColor="text-indigo-500"
            />
            <StatCard
              title="活动能量"
              value={activity ? formatNumber(Math.round(activity.totalActiveEnergy)) : "-"}
              subtitle={activity ? `日均 ${Math.round(activity.avgActiveEnergy)} kcal` : undefined}
              icon={Flame}
              iconColor="text-orange-500"
            />
            <StatCard
              title="锻炼次数"
              value={summary.totalWorkouts}
              subtitle={workouts ? formatDuration(workouts.totalDuration) : undefined}
              icon={Activity}
              iconColor="text-purple-500"
            />
            <StatCard
              title="三圈达成"
              value={activity?.ringCloseCount?.all ?? 0}
              subtitle={`运动${activity?.ringCloseCount?.move ?? 0}/锻炼${activity?.ringCloseCount?.exercise ?? 0}/站立${activity?.ringCloseCount?.stand ?? 0}`}
              icon={Dumbbell}
              iconColor="text-cyan-500"
            />
          </StatGrid>
        </div>
      </section>

      {/* Section 2: Health Data */}
      <section>
        <h2 className="text-sm font-medium text-muted-foreground mb-2">健康数据</h2>
        <YearHealthPanel data={health} year={selectedYear} />
      </section>

      {/* Section 3: Footprint Data */}
      {(footprint.dailyDistance.length > 0 || footprint.byTransportMode.length > 0) && (
        <section>
          <h2 className="text-sm font-medium text-muted-foreground mb-2">轨迹数据</h2>
          <YearFootprintPanel data={footprint} year={selectedYear} />
        </section>
      )}

      {/* Section 4: Finance Data */}
      <section>
        <h2 className="text-sm font-medium text-muted-foreground mb-2">财务数据</h2>
        <YearPixiuPanel data={pixiu} year={selectedYear} />
      </section>
    </div>
  );
}

export function YearPage() {
  const {
    selectedYear,
    loading,
    error,
    data,
    goCurrentYear,
    goPrevYear,
    goNextYear,
    toggleCalendar,
    loadData,
  } = useYearStore();

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div className="space-y-4">
        <YearNavigation
          selectedYear={selectedYear}
          onPrevYear={goPrevYear}
          onNextYear={goNextYear}
          onCurrentYear={goCurrentYear}
          onToggleCalendar={toggleCalendar}
        />

        {loading && <LoadingSkeleton />}
        {error && <ErrorDisplay message={error} />}
        {!loading && !error && data && <YearContent />}
    </div>
  );
}
