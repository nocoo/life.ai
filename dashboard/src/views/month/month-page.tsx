"use client";

import { useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
  Calendar,
  Activity,
} from "lucide-react";

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {/* Stats skeleton */}
      <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-4 px-3 pb-3">
              <Skeleton className="h-3 w-20 mb-1.5" />
              <Skeleton className="h-6 w-28" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts skeleton */}
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="py-2 px-3">
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

function MonthSummaryPanel() {
  const { data } = useMonthStore();

  if (!data) return null;

  const { summary } = data;

  return (
    <div className="space-y-3">
      {/* Overview Stats */}
      <StatGrid columns={4}>
        <StatCard
          title="总步数"
          value={formatNumber(summary.totalSteps)}
          icon={Footprints}
          iconColor="text-green-500"
        />
        <StatCard
          title="平均心率"
          value={summary.avgHeartRate ? `${Math.round(summary.avgHeartRate)} bpm` : "-"}
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

      {/* Second row */}
      <StatGrid columns={4}>
        <StatCard
          title="平均睡眠"
          value={summary.avgSleepHours ? `${summary.avgSleepHours.toFixed(1)} 小时` : "-"}
          icon={Calendar}
          iconColor="text-indigo-500"
        />
        <StatCard
          title="锻炼次数"
          value={summary.totalWorkouts}
          icon={Activity}
          iconColor="text-purple-500"
        />
        <StatCard
          title="总收入"
          value={formatCurrency(summary.totalIncome)}
          iconColor="text-green-500"
        />
        <StatCard
          title="总支出"
          value={formatCurrency(summary.totalExpense)}
          iconColor="text-red-500"
        />
      </StatGrid>
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

  // Load data on mount
  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <ScrollArea className="h-[calc(100vh-57px)]">
      <div className="p-4 space-y-4">
        {/* Month Navigation */}
        <MonthNavigation
          selectedMonth={selectedMonth}
          onPrevMonth={goPrevMonth}
          onNextMonth={goNextMonth}
          onCurrentMonth={goCurrentMonth}
          onToggleCalendar={toggleCalendar}
        />

        {/* TODO: Add calendar picker when calendarOpen is true */}

        {/* Loading state */}
        {loading && <LoadingSkeleton />}

        {/* Error state */}
        {error && <ErrorDisplay message={error} />}

        {/* Data display with Tabs */}
        {!loading && !error && data && (
          <Tabs defaultValue="overview" className="w-full">
            <TabsList>
              <TabsTrigger value="overview">概览</TabsTrigger>
              <TabsTrigger value="health">健康</TabsTrigger>
              <TabsTrigger value="footprint">轨迹</TabsTrigger>
              <TabsTrigger value="finance">财务</TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="mt-3">
              <MonthSummaryPanel />
            </TabsContent>

            {/* Health Tab */}
            <TabsContent value="health" className="mt-3">
              <MonthHealthPanel data={data.health} />
            </TabsContent>

            {/* Footprint Tab */}
            <TabsContent value="footprint" className="mt-3">
              <MonthFootprintPanel data={data.footprint} />
            </TabsContent>

            {/* Finance Tab */}
            <TabsContent value="finance" className="mt-3">
              <MonthPixiuPanel data={data.pixiu} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </ScrollArea>
  );
}
