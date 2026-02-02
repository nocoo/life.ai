import type { DayData, TimelineDay } from "./model";

export type DashboardViewModel = {
  title: string;
  subtitle: string;
  timeline: TimelineDay[];
  selectedDay: DayData;
};

export const createDashboardViewModel = (
  days: DayData[],
  selectedDayId: string
): DashboardViewModel => {
  const selectedDay =
    days.find((day) => day.id === selectedDayId) ?? days[0];

  if (!selectedDay) {
    throw new Error("Dashboard requires at least one day.");
  }

  return {
    title: "Life.ai",
    subtitle: "Memory Atlas",
    timeline: days.map((day) => day.timeline),
    selectedDay
  };
};
