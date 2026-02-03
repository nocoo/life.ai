import { create } from "zustand";
import type { HealthState } from "@/models/health";
import { createInitialHealthState } from "@/models/health";
import { fetchHealth } from "@/services/health-service";

/**
 * Health Store 接口
 */
export interface HealthStore extends HealthState {
  /** 执行健康检查 */
  checkHealth: () => Promise<void>;
  /** 重置状态 */
  reset: () => void;
}

/**
 * Health ViewModel Store
 */
export const useHealthStore = create<HealthStore>((set) => ({
  ...createInitialHealthState(),

  checkHealth: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await fetchHealth();
      set({
        status: data.status,
        lastChecked: data.timestamp,
        isLoading: false,
      });
    } catch (err) {
      set({
        status: "error",
        error: err instanceof Error ? err.message : "Unknown error",
        isLoading: false,
      });
    }
  },

  reset: () => set(createInitialHealthState()),
}));

/**
 * 获取初始状态（用于测试）
 */
export function getInitialHealthStoreState(): HealthState {
  return createInitialHealthState();
}
