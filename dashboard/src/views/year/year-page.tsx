"use client";

import { useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Calendar,
  Activity,
} from "lucide-react";

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      {/* Stats skeleton */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-8 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Heatmap skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-4 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>

      {/* Charts skeleton */}
      <div className="grid gap-6 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-48 w-full" />
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

/** Format number with K/M suffix */
const formatNumber = (value: number): string => {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }
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
  if (meters >= 1000000) {
    return `${(meters / 1000).toFixed(0)} 公里`;
  }
  return `${(meters / 1000).toFixed(1)} 公里`;
};

function YearSummaryPanel() {
  const { data } = useYearStore();

  if (!data) return null;

  const { summary } = data;

  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      <StatGrid columns={4}>
        <StatCard
          title="年度总步数"
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
          title="年度净收支"
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
          title="年度收入"
          value={formatCurrency(summary.totalIncome)}
          iconColor="text-green-500"
        />
        <StatCard
          title="年度支出"
          value={formatCurrency(summary.totalExpense)}
          iconColor="text-red-500"
        />
      </StatGrid>
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

  // Load data on mount
  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <ScrollArea className="h-[calc(100vh-57px)]">
      <div className="p-6 space-y-6">
        {/* Year Navigation */}
        <YearNavigation
          selectedYear={selectedYear}
          onPrevYear={goPrevYear}
          onNextYear={goNextYear}
          onCurrentYear={goCurrentYear}
          onToggleCalendar={toggleCalendar}
        />

        {/* TODO: Add year picker when calendarOpen is true */}

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
            <TabsContent value="overview" className="mt-4">
              <YearSummaryPanel />
            </TabsContent>

            {/* Health Tab */}
            <TabsContent value="health" className="mt-4">
              <YearHealthPanel data={data.health} year={selectedYear} />
            </TabsContent>

            {/* Footprint Tab */}
            <TabsContent value="footprint" className="mt-4">
              <YearFootprintPanel data={data.footprint} year={selectedYear} />
            </TabsContent>

            {/* Finance Tab */}
            <TabsContent value="finance" className="mt-4">
              <YearPixiuPanel data={data.pixiu} year={selectedYear} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </ScrollArea>
  );
}
