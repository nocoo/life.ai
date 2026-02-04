"use client";

import { useEffect, useState, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDayStore } from "@/viewmodels/day-store";
import { DateNavigation } from "./date-navigation";
import { DayCalendar } from "./day-calendar";
import { DayInfoCard } from "./day-info-card";
import { EnhancedTimeline } from "./enhanced-timeline";
import { HealthPanel } from "./health-panel";
import { ActivityPanel, TrackMapCard } from "./activity-panel";
import { RawHealthData } from "./raw-health-data";
import { RawFootprintData } from "./raw-footprint-data";
import { RawPixiuData } from "./raw-pixiu-data";
import { Clock } from "lucide-react";

function LoadingSkeleton() {
  return (
    <div>
      {/* Two-column layout skeleton: Timeline primary, Cards sidebar */}
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* Timeline Card skeleton */}
        <Card>
          <CardHeader>
            <Skeleton className="h-4 w-24" />
          </CardHeader>
          <CardContent className="space-y-2">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </CardContent>
        </Card>
        {/* Cards sidebar skeleton */}
        <div className="grid gap-4 auto-rows-min">
          {/* DayInfoCard skeleton */}
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-48" />
            </CardHeader>
          </Card>
          {/* HealthPanel skeletons */}
          <Card>
            <CardHeader>
              <Skeleton className="h-4 w-20" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-16 w-full" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-4 w-20" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-24 w-full" />
            </CardContent>
          </Card>
          {/* ActivityPanel skeleton */}
          <Card>
            <CardHeader>
              <Skeleton className="h-4 w-20" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-20 w-full" />
            </CardContent>
          </Card>
        </div>
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

export function DayPage() {
  const {
    selectedDate,
    loading,
    error,
    data,
    timeSlots,
    location,
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
    <ScrollArea className="h-[calc(100vh-57px)]">
      <div className="p-6 space-y-6">
        {/* Date Navigation */}
        <DateNavigation
          selectedDate={selectedDate}
          onPrevDay={goPrevDay}
          onNextDay={goNextDay}
          onToday={goToday}
          onToggleCalendar={toggleCalendar}
        />

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
              <TabsTrigger value="dashboard">仪表盘</TabsTrigger>
              <TabsTrigger value="health">苹果健康</TabsTrigger>
              <TabsTrigger value="footprint">运动轨迹</TabsTrigger>
              <TabsTrigger value="pixiu">记账数据</TabsTrigger>
            </TabsList>

            {/* Dashboard Tab */}
            <TabsContent value="dashboard">
              {/* Two-column layout: Timeline (left) + Cards sidebar (right) */}
              {/* Use min-w-0 to allow flex children to shrink below content size */}
              <div className="grid gap-6 lg:grid-cols-[1fr_340px] mt-4">
                {/* Left column: Map + Timeline */}
                <div className="order-2 lg:order-1 space-y-6 min-w-0 overflow-hidden">
                  {/* Track Map Card - Large map showing daily trajectory */}
                  <TrackMapCard 
                    trackPoints={data.footprint.trackPoints} 
                  />

                  {/* Enhanced Timeline in a Card */}
                  <Card className="min-w-0 overflow-hidden">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-sm font-medium">
                        <Clock className="h-4 w-4 text-indigo-500" />
                        时间线
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <EnhancedTimeline 
                        slots={timeSlots} 
                        date={selectedDate}
                        latitude={location.latitude}
                        longitude={location.longitude}
                      />
                    </CardContent>
                  </Card>
                </div>

                {/* Right: Single-column cards sidebar */}
                {/* Use min-w-0 and overflow-hidden to prevent content overflow */}
                <div className="order-1 lg:order-2 grid gap-4 auto-rows-min min-w-0 overflow-hidden">
                  {/* Day Info Card - Date and Weather */}
                  <DayInfoCard
                    date={selectedDate}
                    latitude={location.latitude}
                    longitude={location.longitude}
                  />

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
  );
}
