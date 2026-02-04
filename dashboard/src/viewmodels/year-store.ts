import { create } from "zustand";
import type { YearViewData } from "@/models/year-view";
import { buildYearSummary } from "@/models/year-view";
import { fetchAllYearData } from "@/lib/api-client";

export interface YearState {
  /** Currently selected year */
  selectedYear: number;
  /** Loading state */
  loading: boolean;
  /** Error message if any */
  error: string | null;
  /** Year view data */
  data: YearViewData | null;
  /** Calendar visibility */
  calendarOpen: boolean;
}

export interface YearActions {
  /** Set selected year and load data */
  setYear: (year: number) => void;
  /** Go to current year */
  goCurrentYear: () => void;
  /** Go to previous year */
  goPrevYear: () => void;
  /** Go to next year */
  goNextYear: () => void;
  /** Toggle calendar visibility */
  toggleCalendar: () => void;
  /** Close calendar */
  closeCalendar: () => void;
  /** Load data for selected year */
  loadData: () => Promise<void>;
}

export type YearStore = YearState & YearActions;

/** Default year for the app */
const DEFAULT_YEAR = 2025;

const initialState: YearState = {
  selectedYear: DEFAULT_YEAR,
  loading: false,
  error: null,
  data: null,
  calendarOpen: false,
};

export const useYearStore = create<YearStore>((set, get) => ({
  ...initialState,

  setYear: (year: number) => {
    set({ selectedYear: year, calendarOpen: false });
    get().loadData();
  },

  goCurrentYear: () => {
    const currentYear = new Date().getFullYear();
    set({ selectedYear: currentYear, calendarOpen: false });
    get().loadData();
  },

  goPrevYear: () => {
    const prevYear = get().selectedYear - 1;
    set({ selectedYear: prevYear });
    get().loadData();
  },

  goNextYear: () => {
    const nextYear = get().selectedYear + 1;
    set({ selectedYear: nextYear });
    get().loadData();
  },

  toggleCalendar: () => {
    set((state) => ({ calendarOpen: !state.calendarOpen }));
  },

  closeCalendar: () => {
    set({ calendarOpen: false });
  },

  loadData: async () => {
    const { selectedYear } = get();
    set({ loading: true, error: null });

    try {
      const { health, footprint, pixiu } = await fetchAllYearData(selectedYear);

      const summary = buildYearSummary(selectedYear, health, footprint, pixiu);

      const data: YearViewData = {
        year: selectedYear,
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
        error: err instanceof Error ? err.message : "Failed to load year data",
        loading: false,
      });
    }
  },
}));

/** Reset store to initial state (for testing) */
export const resetYearStore = () => {
  useYearStore.setState(initialState);
};
