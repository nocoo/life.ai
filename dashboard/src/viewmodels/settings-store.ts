/**
 * Settings store for user preferences
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type MapProvider = "carto" | "google";

interface SettingsState {
  mapProvider: MapProvider;
  setMapProvider: (provider: MapProvider) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      mapProvider: "carto",
      setMapProvider: (provider) => set({ mapProvider: provider }),
    }),
    {
      name: "life-ai-settings",
    }
  )
);
