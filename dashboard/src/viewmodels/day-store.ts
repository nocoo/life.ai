import { create } from "zustand";
import { addDays, subDays, startOfDay } from "date-fns";
import type { DayViewData, TimelineEvent } from "@/models/day-view";
import { getMockDayData, buildTimelineEvents } from "@/mocks";

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

const initialState: DayState = {
  selectedDate: startOfDay(new Date()),
  loading: false,
  error: null,
  data: null,
  timelineEvents: [],
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
      // For now, use mock data
      // TODO: Replace with actual API call
      const data = getMockDayData(selectedDate);
      const timelineEvents = buildTimelineEvents(data);

      set({
        data,
        timelineEvents,
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
