/**
 * API client for day data endpoints
 */

import type { AppleHealthRawData } from "@/services/applehealth-service";
import type { FootprintRawData } from "@/services/footprint-service";
import type { PixiuRawData } from "@/services/pixiu-service";

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/** Format date to YYYY-MM-DD string */
const formatDate = (date: Date): string => {
  return date.toISOString().split("T")[0];
};

/** Fetch Apple Health data for a specific date */
export const fetchAppleHealthData = async (
  date: Date
): Promise<AppleHealthRawData> => {
  const dateStr = formatDate(date);
  const response = await fetch(`/api/day/applehealth?date=${dateStr}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch Apple Health data: ${response.statusText}`);
  }

  const result: ApiResponse<AppleHealthRawData> = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.error || "Failed to fetch Apple Health data");
  }

  return result.data;
};

/** Fetch Footprint data for a specific date */
export const fetchFootprintData = async (
  date: Date
): Promise<FootprintRawData> => {
  const dateStr = formatDate(date);
  const response = await fetch(`/api/day/footprint?date=${dateStr}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch Footprint data: ${response.statusText}`);
  }

  const result: ApiResponse<FootprintRawData> = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.error || "Failed to fetch Footprint data");
  }

  return result.data;
};

/** Fetch Pixiu data for a specific date */
export const fetchPixiuData = async (date: Date): Promise<PixiuRawData> => {
  const dateStr = formatDate(date);
  const response = await fetch(`/api/day/pixiu?date=${dateStr}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch Pixiu data: ${response.statusText}`);
  }

  const result: ApiResponse<PixiuRawData> = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.error || "Failed to fetch Pixiu data");
  }

  return result.data;
};

/** Fetch all day data in parallel */
export const fetchAllDayData = async (
  date: Date
): Promise<{
  appleHealth: AppleHealthRawData;
  footprint: FootprintRawData;
  pixiu: PixiuRawData;
}> => {
  const [appleHealth, footprint, pixiu] = await Promise.all([
    fetchAppleHealthData(date),
    fetchFootprintData(date),
    fetchPixiuData(date),
  ]);

  return { appleHealth, footprint, pixiu };
};
