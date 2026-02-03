/**
 * Combined mock data for day view
 */

import type { DayViewData, TimelineEvent } from "@/models/day-view";
import { buildDaySummary } from "@/models/day-view";
import { createMockDayHealthData } from "./apple-health-mock";
import { createMockDayFootprintData } from "./footprint-mock";
import { createMockDayPixiuData } from "./pixiu-mock";

/** Generate complete mock day view data */
export const createMockDayViewData = (date: string): DayViewData => {
  const health = createMockDayHealthData(date);
  const footprint = createMockDayFootprintData(date);
  const pixiu = createMockDayPixiuData(date);
  const summary = buildDaySummary(date, health, footprint, pixiu);

  return {
    date,
    summary,
    health,
    footprint,
    pixiu,
  };
};

/** Extract time from ISO datetime string */
const extractTime = (datetime: string): string => {
  const match = datetime.match(/T(\d{2}:\d{2})/);
  return match ? match[1] : "00:00";
};

/** Build timeline events from day data */
export const buildTimelineEvents = (data: DayViewData): TimelineEvent[] => {
  const events: TimelineEvent[] = [];

  // Sleep events
  if (data.health.sleep) {
    events.push({
      id: "sleep-start",
      type: "sleep",
      time: extractTime(data.health.sleep.start),
      endTime: extractTime(data.health.sleep.end),
      title: "Sleep",
      subtitle: `${(data.health.sleep.duration / 60).toFixed(1)}h`,
      color: "bg-indigo-500",
    });
    events.push({
      id: "wake-up",
      type: "wake",
      time: extractTime(data.health.sleep.end),
      title: "Wake Up",
      color: "bg-amber-500",
    });
  }

  // Workout events
  data.health.workouts.forEach((workout) => {
    events.push({
      id: workout.id,
      type: "workout",
      time: extractTime(workout.start),
      endTime: extractTime(workout.end),
      title: workout.typeName,
      subtitle: workout.distance
        ? `${(workout.distance / 1000).toFixed(1)} km`
        : `${workout.duration} min`,
      color: "bg-green-500",
    });
  });

  // Location events (only named locations)
  data.footprint.locations.forEach((loc) => {
    if (loc.name !== "Home" && loc.name !== "Commute") {
      events.push({
        id: loc.id,
        type: "location",
        time: loc.startTime,
        endTime: loc.endTime,
        title: loc.name,
        subtitle: `${loc.duration} min`,
        color: "bg-blue-500",
      });
    }
  });

  // Transaction events
  data.pixiu.transactions.forEach((tx) => {
    events.push({
      id: tx.id,
      type: "transaction",
      time: tx.time,
      title: tx.categoryL2,
      subtitle: tx.isIncome ? `+¥${tx.amount}` : `-¥${tx.amount}`,
      color: tx.isIncome ? "bg-emerald-500" : "bg-rose-500",
    });
  });

  // Sort by time
  return events.sort((a, b) => a.time.localeCompare(b.time));
};

/** Get mock data for a specific date */
export const getMockDayData = (date: Date): DayViewData => {
  const dateStr = date.toISOString().split("T")[0];
  return createMockDayViewData(dateStr);
};

/** Re-export individual mock creators for testing */
export { createMockDayHealthData } from "./apple-health-mock";
export { createMockDayFootprintData } from "./footprint-mock";
export { createMockDayPixiuData } from "./pixiu-mock";
