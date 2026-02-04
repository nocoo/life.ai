import { create } from "zustand";
import { format, addMonths, subMonths, startOfMonth } from "date-fns";
import type { MonthViewData } from "@/models/month-view";
import { buildMonthSummary } from "@/models/month-view";
import { fetchAllMonthData } from "@/lib/api-client";

export interface MonthState {
  /** Currently selected month (YYYY-MM format) */
  selectedMonth: string;
  /** Loading state */
  loading: boolean;
  /** Error message if any */
  error: string | null;
  /** Month view data */
  data: MonthViewData | null;
  /** Calendar visibility */
  calendarOpen: boolean;
}

export interface MonthActions {
  /** Set selected month and load data */
  setMonth: (month: string) => void;
  /** Go to current month */
  goCurrentMonth: () => void;
  /** Go to previous month */
  goPrevMonth: () => void;
  /** Go to next month */
  goNextMonth: () => void;
  /** Toggle calendar visibility */
  toggleCalendar: () => void;
  /** Close calendar */
  closeCalendar: () => void;
  /** Load data for selected month */
  loadData: () => Promise<void>;
}

export type MonthStore = MonthState & MonthActions;

/** Default month for the app */
const DEFAULT_MONTH = "2025-12";

const initialState: MonthState = {
  selectedMonth: DEFAULT_MONTH,
  loading: false,
  error: null,
  data: null,
  calendarOpen: false,
};

/** Convert month string to Date for navigation */
const monthToDate = (month: string): Date => {
  const [year, m] = month.split("-").map(Number);
  return new Date(year, m - 1, 1);
};

/** Convert Date to month string */
const dateToMonth = (date: Date): string => {
  return format(startOfMonth(date), "yyyy-MM");
};

export const useMonthStore = create<MonthStore>((set, get) => ({
  ...initialState,

  setMonth: (month: string) => {
    set({ selectedMonth: month, calendarOpen: false });
    get().loadData();
  },

  goCurrentMonth: () => {
    const currentMonth = dateToMonth(new Date());
    set({ selectedMonth: currentMonth, calendarOpen: false });
    get().loadData();
  },

  goPrevMonth: () => {
    const currentDate = monthToDate(get().selectedMonth);
    const prevMonth = dateToMonth(subMonths(currentDate, 1));
    set({ selectedMonth: prevMonth });
    get().loadData();
  },

  goNextMonth: () => {
    const currentDate = monthToDate(get().selectedMonth);
    const nextMonth = dateToMonth(addMonths(currentDate, 1));
    set({ selectedMonth: nextMonth });
    get().loadData();
  },

  toggleCalendar: () => {
    set((state) => ({ calendarOpen: !state.calendarOpen }));
  },

  closeCalendar: () => {
    set({ calendarOpen: false });
  },

  loadData: async () => {
    const { selectedMonth } = get();
    set({ loading: true, error: null });

    try {
      const { health, footprint, pixiu } = await fetchAllMonthData(selectedMonth);

      const summary = buildMonthSummary(selectedMonth, health, footprint, pixiu);

      const data: MonthViewData = {
        month: selectedMonth,
        summary,
        health,
        footprint,
        pixiu,
      };

      set({
        data,
        loading: false,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to load month data",
        loading: false,
      });
    }
  },
}));

/** Reset store to initial state (for testing) */
export const resetMonthStore = () => {
  useMonthStore.setState(initialState);
};
