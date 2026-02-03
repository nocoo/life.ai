/**
 * Footprint (GPS tracking) data types for day view
 */

/** Single GPS track point */
export interface TrackPoint {
  ts: string; // ISO datetime
  lat: number;
  lon: number;
  ele?: number; // elevation in meters
  speed?: number; // m/s
}

/** Location with semantic name */
export interface LocationRecord {
  id: string;
  name: string; // e.g., "Home", "Work", "Gym"
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  lat: number;
  lon: number;
  duration: number; // minutes
}

/** Track segment (continuous movement) */
export interface TrackSegment {
  id: string;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  pointCount: number;
  distance: number; // meters
  avgSpeed: number; // m/s
  startLocation?: string; // location name
  endLocation?: string; // location name
}

/** Day track summary */
export interface DayTrackSummary {
  pointCount: number;
  totalDistance: number; // meters
  avgSpeed: number; // m/s
  minTime: string; // HH:mm
  maxTime: string; // HH:mm
}

/** All footprint data for a single day */
export interface DayFootprintData {
  date: string; // YYYY-MM-DD
  summary: DayTrackSummary | null;
  trackPoints: TrackPoint[]; // Raw GPS track points
  locations: LocationRecord[];
  segments: TrackSegment[];
}

/** Create an empty day footprint data object */
export const createEmptyDayFootprintData = (date: string): DayFootprintData => ({
  date,
  summary: null,
  trackPoints: [],
  locations: [],
  segments: [],
});
