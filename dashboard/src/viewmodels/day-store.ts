import { create } from "zustand";
import { addDays, subDays, startOfDay, format } from "date-fns";
import type { DayViewData, TimelineEvent, TimeSlot } from "@/models/day-view";
import { buildDaySummary } from "@/models/day-view";
import { buildTimelineEvents } from "@/mocks";
import { fetchAllDayData } from "@/lib/api-client";
import {
  transformAppleHealthData,
  transformFootprintData,
  transformPixiuData,
} from "@/lib/transformers";
import { generateHealthTimeSlots } from "@/lib/timeline-aggregator";

export interface DayState {
  /** Currently selected date */
  selectedDate: Date;
  /** Loading state */
  loading: boolean;
  /** Error message if any */
  error: string | null;
  /** Day view data */
  data: DayViewData | null;
  /** Timeline events */
  timelineEvents: TimelineEvent[];
  /** Enhanced timeline slots (15-minute granularity) */
  timeSlots: TimeSlot[];
  /** Calendar visibility */
  calendarOpen: boolean;
}

export interface DayActions {
  /** Set selected date and load data */
  setDate: (date: Date) => void;
  /** Go to today */
  goToday: () => void;
  /** Go to previous day */
  goPrevDay: () => void;
  /** Go to next day */
  goNextDay: () => void;
  /** Toggle calendar visibility */
  toggleCalendar: () => void;
  /** Close calendar */
  closeCalendar: () => void;
  /** Load data for selected date */
  loadData: () => Promise<void>;
}

export type DayStore = DayState & DayActions;

/** Default date for the app */
const DEFAULT_DATE = new Date(2025, 11, 2); // 2025-12-02 (month is 0-indexed)

const initialState: DayState = {
  selectedDate: startOfDay(DEFAULT_DATE),
  loading: false,
  error: null,
  data: null,
  timelineEvents: [],
  timeSlots: [],
  calendarOpen: false,
};

export const useDayStore = create<DayStore>((set, get) => ({
  ...initialState,

  setDate: (date: Date) => {
    set({ selectedDate: startOfDay(date), calendarOpen: false });
    get().loadData();
  },

  goToday: () => {
    const today = startOfDay(new Date());
    set({ selectedDate: today, calendarOpen: false });
    get().loadData();
  },

  goPrevDay: () => {
    const prevDay = subDays(get().selectedDate, 1);
    set({ selectedDate: prevDay });
    get().loadData();
  },

  goNextDay: () => {
    const nextDay = addDays(get().selectedDate, 1);
    set({ selectedDate: nextDay });
    get().loadData();
  },

  toggleCalendar: () => {
    set((state) => ({ calendarOpen: !state.calendarOpen }));
  },

  closeCalendar: () => {
    set({ calendarOpen: false });
  },

  loadData: async () => {
    const { selectedDate } = get();
    set({ loading: true, error: null });

    try {
      // Fetch raw data from APIs
      const { appleHealth, footprint, pixiu } = await fetchAllDayData(selectedDate);

      // Transform raw data to view models
      const health = transformAppleHealthData(appleHealth);
      const footprintData = transformFootprintData(footprint);
      const pixiuData = transformPixiuData(pixiu);

      // Build summary and combined data
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      const summary = buildDaySummary(dateStr, health, footprintData, pixiuData);

      const data: DayViewData = {
        date: dateStr,
        summary,
        health,
        footprint: footprintData,
        pixiu: pixiuData,
      };

      const timelineEvents = buildTimelineEvents(data);
      const timeSlots = generateHealthTimeSlots(health);

      set({
        data,
        timelineEvents,
        timeSlots,
        loading: false,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to load data",
        loading: false,
      });
    }
  },
}));

/** Reset store to initial state (for testing) */
export const resetDayStore = () => {
  useDayStore.setState(initialState);
};
