"use client";

import { useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useDayStore } from "@/viewmodels/day-store";
import { DayHeader } from "./day-header";
import { DayCalendar } from "./day-calendar";
import { SummaryCards } from "./summary-cards";
import { Timeline } from "./timeline";
import { HealthPanel } from "./health-panel";
import { ActivityPanel } from "./activity-panel";

function LoadingSkeleton() {
  return (
    <div className="space-y-4 p-6">
      {/* Summary cards skeleton */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
      {/* Main content skeleton */}
      <div className="grid gap-6 lg:grid-cols-[1fr_200px_1fr]">
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
        <Skeleton className="h-[600px] w-full" />
        <div className="space-y-4">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-56 w-full" />
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
    timelineEvents,
    calendarOpen,
    setDate,
    goToday,
    goPrevDay,
    goNextDay,
    toggleCalendar,
    loadData,
  } = useDayStore();

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

            {/* Data display */}
            {!loading && !error && data && (
              <>
                {/* Summary Cards */}
                <SummaryCards summary={data.summary} />

                {/* Three-column layout */}
                <div className="grid gap-6 lg:grid-cols-[1fr_220px_1fr]">
                  {/* Left: Health Panel */}
                  <HealthPanel data={data.health} />

                  {/* Center: Timeline */}
                  <div className="order-first lg:order-none">
                    <div className="sticky top-0">
                      <h2 className="mb-4 text-sm font-medium text-muted-foreground pl-14">
                        Timeline
                      </h2>
                      <Timeline events={timelineEvents} />
                    </div>
                  </div>

                  {/* Right: Activity Panel */}
                  <ActivityPanel
                    footprint={data.footprint}
                    pixiu={data.pixiu}
                    workouts={data.health.workouts}
                  />
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      </main>
    </div>
  );
}
