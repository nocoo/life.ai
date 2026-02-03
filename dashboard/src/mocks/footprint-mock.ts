/**
 * Mock data for Footprint (GPS tracking)
 */

import type {
  DayFootprintData,
  DayTrackSummary,
  LocationRecord,
  TrackSegment,
} from "@/models/footprint";

/** Generate mock track summary */
export const createMockTrackSummary = (): DayTrackSummary => ({
  pointCount: 4320,
  totalDistance: 15600, // 15.6 km
  avgSpeed: 1.8, // m/s (~6.5 km/h)
  minTime: "07:30",
  maxTime: "22:45",
});

/** Generate mock locations */
export const createMockLocations = (): LocationRecord[] => [
  {
    id: "loc-1",
    name: "Home",
    startTime: "00:00",
    endTime: "07:30",
    lat: 39.9042,
    lon: 116.4074,
    duration: 450,
  },
  {
    id: "loc-2",
    name: "Commute",
    startTime: "07:30",
    endTime: "08:15",
    lat: 39.9142,
    lon: 116.4274,
    duration: 45,
  },
  {
    id: "loc-3",
    name: "Office",
    startTime: "08:15",
    endTime: "12:00",
    lat: 39.9242,
    lon: 116.4474,
    duration: 225,
  },
  {
    id: "loc-4",
    name: "Restaurant",
    startTime: "12:00",
    endTime: "13:00",
    lat: 39.9252,
    lon: 116.4484,
    duration: 60,
  },
  {
    id: "loc-5",
    name: "Office",
    startTime: "13:00",
    endTime: "18:00",
    lat: 39.9242,
    lon: 116.4474,
    duration: 300,
  },
  {
    id: "loc-6",
    name: "Park",
    startTime: "18:00",
    endTime: "18:45",
    lat: 39.9342,
    lon: 116.4574,
    duration: 45,
  },
  {
    id: "loc-7",
    name: "Supermarket",
    startTime: "19:00",
    endTime: "19:30",
    lat: 39.9062,
    lon: 116.4094,
    duration: 30,
  },
  {
    id: "loc-8",
    name: "Home",
    startTime: "19:45",
    endTime: "23:59",
    lat: 39.9042,
    lon: 116.4074,
    duration: 254,
  },
];

/** Generate mock track segments */
export const createMockSegments = (): TrackSegment[] => [
  {
    id: "seg-1",
    startTime: "07:30",
    endTime: "08:15",
    pointCount: 540,
    distance: 8500,
    avgSpeed: 3.1,
    startLocation: "Home",
    endLocation: "Office",
  },
  {
    id: "seg-2",
    startTime: "12:00",
    endTime: "12:10",
    pointCount: 60,
    distance: 350,
    avgSpeed: 0.6,
    startLocation: "Office",
    endLocation: "Restaurant",
  },
  {
    id: "seg-3",
    startTime: "18:00",
    endTime: "18:45",
    pointCount: 270,
    distance: 5200,
    avgSpeed: 1.9,
    startLocation: "Office",
    endLocation: "Park",
  },
  {
    id: "seg-4",
    startTime: "18:50",
    endTime: "19:30",
    pointCount: 240,
    distance: 1200,
    avgSpeed: 0.5,
    startLocation: "Park",
    endLocation: "Supermarket",
  },
  {
    id: "seg-5",
    startTime: "19:35",
    endTime: "19:45",
    pointCount: 60,
    distance: 350,
    avgSpeed: 0.6,
    startLocation: "Supermarket",
    endLocation: "Home",
  },
];

/** Generate complete mock footprint data for a day */
export const createMockDayFootprintData = (date: string): DayFootprintData => ({
  date,
  summary: createMockTrackSummary(),
  trackPoints: [], // Mock data doesn't need full track points
  locations: createMockLocations(),
  segments: createMockSegments(),
});
