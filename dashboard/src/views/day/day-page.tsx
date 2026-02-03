"use client";

import { useEffect, useState, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDayStore } from "@/viewmodels/day-store";
import { DayHeader } from "./day-header";
import { DayCalendar } from "./day-calendar";
import { EnhancedTimeline } from "./enhanced-timeline";
import { HealthPanel } from "./health-panel";
import { ActivityPanel } from "./activity-panel";
import { RawHealthData } from "./raw-health-data";
import { RawFootprintData } from "./raw-footprint-data";
import { RawPixiuData } from "./raw-pixiu-data";

function LoadingSkeleton() {
  return (
    <div className="p-6">
      {/* Two-column layout skeleton: Timeline primary, Cards sidebar */}
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* Timeline skeleton */}
        <Skeleton className="h-[600px] w-full" />
        {/* Cards sidebar skeleton */}
        <div className="grid gap-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-44 w-full" />
        </div>
      </div>
    </div>
  );
}

function ErrorDisplay({ message }: { message: string }) {
  return (
    <div className="flex h-[400px] items-center justify-center">
      <div className="text-center">
        <p className="text-lg font-medium text-destructive">Error</p>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

export function DayPage() {
  const {
    selectedDate,
    loading,
    error,
    data,
    timeSlots,
    calendarOpen,
    setDate,
    goToday,
    goPrevDay,
    goNextDay,
    toggleCalendar,
    loadData,
  } = useDayStore();

  // Track which raw data tabs have been visited (for lazy loading)
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(new Set());

  // Handle tab change - mark tab as visited for lazy loading
  const handleTabChange = useCallback((value: string) => {
    if (!visitedTabs.has(value)) {
      setVisitedTabs((prev) => new Set(prev).add(value));
    }
  }, [visitedTabs]);

  // Reset visited tabs when date changes
  useEffect(() => {
    setVisitedTabs(new Set());
  }, [selectedDate]);

  // Load data on mount
  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <DayHeader
        selectedDate={selectedDate}
        onPrevDay={goPrevDay}
        onNextDay={goNextDay}
        onToday={goToday}
        onToggleCalendar={toggleCalendar}
      />

      {/* Main content */}
      <main className="flex-1 overflow-hidden">
        <ScrollArea className="h-[calc(100vh-65px)]">
          <div className="p-6 space-y-6">
            {/* Calendar (collapsible) */}
            {calendarOpen && (
              <div className="flex justify-center">
                <DayCalendar
                  selectedDate={selectedDate}
                  onSelectDate={setDate}
                />
              </div>
            )}

            {/* Loading state */}
            {loading && <LoadingSkeleton />}

            {/* Error state */}
            {error && <ErrorDisplay message={error} />}

            {/* Data display with Tabs */}
            {!loading && !error && data && (
              <Tabs
                defaultValue="dashboard"
                className="w-full"
                onValueChange={handleTabChange}
              >
                <TabsList>
                  <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
                  <TabsTrigger value="health">苹果健康</TabsTrigger>
                  <TabsTrigger value="footprint">运动软件</TabsTrigger>
                  <TabsTrigger value="pixiu">记账软件</TabsTrigger>
                </TabsList>

                {/* Dashboard Tab */}
                <TabsContent value="dashboard">
                  {/* Mobile: Stack layout (cards above timeline) */}
                  {/* Desktop: Timeline primary (60%) + Cards sidebar (40%) */}
                  <div className="grid gap-6 lg:grid-cols-[1fr_340px] mt-4">
                    {/* Left: Enhanced Timeline (primary content) */}
                    <div className="order-2 lg:order-1">
                      <h2 className="mb-4 text-sm font-medium text-muted-foreground text-center">
                        Timeline
                      </h2>
                      <EnhancedTimeline slots={timeSlots} />
                    </div>

                    {/* Right: Single-column cards sidebar */}
                    <div className="order-1 lg:order-2 grid gap-4 auto-rows-min">
                      {/* Health cards */}
                      <HealthPanel data={data.health} />

                      {/* Activity cards */}
                      <ActivityPanel
                        footprint={data.footprint}
                        pixiu={data.pixiu}
                        workouts={data.health.workouts}
                      />
                    </div>
                  </div>
                </TabsContent>

                {/* Apple Health Raw Data Tab - Lazy loaded */}
                <TabsContent value="health">
                  <div className="mt-4">
                    {visitedTabs.has("health") ? (
                      <RawHealthData data={data.health} />
                    ) : (
                      <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                        点击标签页加载数据...
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* Footprint Raw Data Tab - Lazy loaded */}
                <TabsContent value="footprint">
                  <div className="mt-4">
                    {visitedTabs.has("footprint") ? (
                      <RawFootprintData data={data.footprint} />
                    ) : (
                      <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                        点击标签页加载数据...
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* Pixiu Raw Data Tab - Lazy loaded */}
                <TabsContent value="pixiu">
                  <div className="mt-4">
                    {visitedTabs.has("pixiu") ? (
                      <RawPixiuData data={data.pixiu} />
                    ) : (
                      <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                        点击标签页加载数据...
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            )}
          </div>
        </ScrollArea>
      </main>
    </div>
  );
}
