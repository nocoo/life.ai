/**
 * API client for day, month, and year data endpoints
 */

import { format } from "date-fns";
import type { AppleHealthRawData } from "@/services/applehealth-service";
import type { FootprintRawData } from "@/services/footprint-service";
import type { PixiuRawData } from "@/services/pixiu-service";
import type { MonthHealthData, MonthFootprintData, MonthPixiuData } from "@/models/month-view";
import type { YearHealthData, YearFootprintData, YearPixiuData } from "@/models/year-view";

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/** Format date to YYYY-MM-DD string (using local timezone) */
const formatDate = (date: Date): string => {
  return format(date, "yyyy-MM-dd");
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

// ============================================================================
// Month Data API
// ============================================================================

/** Fetch Apple Health month data */
export const fetchMonthAppleHealthData = async (
  month: string
): Promise<MonthHealthData> => {
  const response = await fetch(`/api/month/applehealth?month=${month}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch Apple Health month data: ${response.statusText}`);
  }

  const result: ApiResponse<MonthHealthData> = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.error || "Failed to fetch Apple Health month data");
  }

  return result.data;
};

/** Fetch Footprint month data */
export const fetchMonthFootprintData = async (
  month: string
): Promise<MonthFootprintData> => {
  const response = await fetch(`/api/month/footprint?month=${month}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch Footprint month data: ${response.statusText}`);
  }

  const result: ApiResponse<MonthFootprintData> = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.error || "Failed to fetch Footprint month data");
  }

  return result.data;
};

/** Fetch Pixiu month data */
export const fetchMonthPixiuData = async (
  month: string
): Promise<MonthPixiuData> => {
  const response = await fetch(`/api/month/pixiu?month=${month}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch Pixiu month data: ${response.statusText}`);
  }

  const result: ApiResponse<MonthPixiuData> = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.error || "Failed to fetch Pixiu month data");
  }

  return result.data;
};

/** Fetch all month data in parallel */
export const fetchAllMonthData = async (
  month: string
): Promise<{
  health: MonthHealthData;
  footprint: MonthFootprintData;
  pixiu: MonthPixiuData;
}> => {
  const [health, footprint, pixiu] = await Promise.all([
    fetchMonthAppleHealthData(month),
    fetchMonthFootprintData(month),
    fetchMonthPixiuData(month),
  ]);

  return { health, footprint, pixiu };
};

// ============================================================================
// Year Data API
// ============================================================================

/** Fetch Apple Health year data */
export const fetchYearAppleHealthData = async (
  year: number
): Promise<YearHealthData> => {
  const response = await fetch(`/api/year/applehealth?year=${year}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch Apple Health year data: ${response.statusText}`);
  }

  const result: ApiResponse<YearHealthData> = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.error || "Failed to fetch Apple Health year data");
  }

  return result.data;
};

/** Fetch Footprint year data */
export const fetchYearFootprintData = async (
  year: number
): Promise<YearFootprintData> => {
  const response = await fetch(`/api/year/footprint?year=${year}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch Footprint year data: ${response.statusText}`);
  }

  const result: ApiResponse<YearFootprintData> = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.error || "Failed to fetch Footprint year data");
  }

  return result.data;
};

/** Fetch Pixiu year data */
export const fetchYearPixiuData = async (
  year: number
): Promise<YearPixiuData> => {
  const response = await fetch(`/api/year/pixiu?year=${year}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch Pixiu year data: ${response.statusText}`);
  }

  const result: ApiResponse<YearPixiuData> = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.error || "Failed to fetch Pixiu year data");
  }

  return result.data;
};

/** Fetch all year data in parallel */
export const fetchAllYearData = async (
  year: number
): Promise<{
  health: YearHealthData;
  footprint: YearFootprintData;
  pixiu: YearPixiuData;
}> => {
  const [health, footprint, pixiu] = await Promise.all([
    fetchYearAppleHealthData(year),
    fetchYearFootprintData(year),
    fetchYearPixiuData(year),
  ]);

  return { health, footprint, pixiu };
};
