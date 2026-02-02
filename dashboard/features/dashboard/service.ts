import type { DayData, TimelineDay } from "./model";
import {
  formatMonthDay,
  formatMonthKey,
  formatWeekday,
  toIsoDate
} from "./model";

export type DashboardData = {
  days: DayData[];
  selectedDayId: string;
};

const buildDays = (): DayData[] => {
  const days: DayData[] = [
    {
      id: "2026-02-14",
      story:
        "A winter Saturday that drifted from quiet routines to a warm reunion dinner, stitched together by long walks and short rides.",
      timeline: {
        id: "2026-02-14",
        date: "2026-02-14",
        weekday: "Sat",
        monthDay: "Feb 14",
        monthKey: "2026-02",
        headline: "Snowy city loop",
        weather: "-1°C / Light snow",
        placeCount: 6,
        travelKm: 18.4,
        steps: 12840,
        energyKcal: 2120
      },
      footprint: {
        totalDistanceKm: 18.4,
        activeMinutes: 132,
        maxSpeedKmh: 28.7,
        cities: 1,
        track: [
          8, 12, 10, 14, 18, 20, 24, 28, 30, 26, 22, 20, 18, 16, 14, 12, 10,
          9, 8, 7, 6, 5, 6, 8
        ],
        heatmap: [
          { x: 18, y: 32, intensity: 0.9 },
          { x: 36, y: 28, intensity: 0.7 },
          { x: 42, y: 18, intensity: 0.6 },
          { x: 24, y: 20, intensity: 0.8 },
          { x: 12, y: 26, intensity: 0.5 },
          { x: 30, y: 40, intensity: 0.4 }
        ],
        stops: [
          {
            time: "07:40",
            place: "Garden Residence",
            note: "Morning coffee and journaling",
            distanceKm: 0,
            durationMin: 42,
            mode: "stay"
          },
          {
            time: "09:10",
            place: "Riverside Park",
            note: "Snow walk loop",
            distanceKm: 3.2,
            durationMin: 38,
            mode: "walk"
          },
          {
            time: "10:30",
            place: "Artisan Market",
            note: "Picked up pastries",
            distanceKm: 1.4,
            durationMin: 24,
            mode: "walk"
          },
          {
            time: "13:20",
            place: "South Line Station",
            note: "Metro to old town",
            distanceKm: 5.6,
            durationMin: 18,
            mode: "rail"
          },
          {
            time: "14:00",
            place: "Old Town Gallery",
            note: "Friend meetup",
            distanceKm: 0.8,
            durationMin: 76,
            mode: "walk"
          },
          {
            time: "19:30",
            place: "Saffron Table",
            note: "Long dinner + photos",
            distanceKm: 2.4,
            durationMin: 110,
            mode: "ride"
          }
        ]
      },
      health: {
        metrics: [
          {
            label: "Steps",
            value: 12840,
            unit: "steps",
            delta: 12.4,
            trend: "up"
          },
          {
            label: "Active Energy",
            value: 690,
            unit: "kcal",
            delta: 8.1,
            trend: "up"
          },
          {
            label: "Resting HR",
            value: 56,
            unit: "bpm",
            delta: -3.4,
            trend: "down"
          },
          {
            label: "VO₂ Max",
            value: 43.8,
            unit: "ml/kg/min",
            delta: 1.2,
            trend: "up"
          }
        ],
        activity: [
          { label: "Move", value: 690, goal: 520 },
          { label: "Exercise", value: 68, goal: 40 },
          { label: "Stand", value: 13, goal: 10 }
        ],
        heartRate: [
          { time: "06:00", bpm: 52 },
          { time: "08:30", bpm: 74 },
          { time: "11:00", bpm: 88 },
          { time: "14:30", bpm: 96 },
          { time: "18:00", bpm: 82 },
          { time: "21:30", bpm: 64 }
        ],
        sleepHours: 7.4,
        mindfulnessMin: 18
      },
      spending: {
        incomeTotal: 120.0,
        expenseTotal: 98.6,
        topCategory: "Dining",
        items: [
          {
            time: "08:05",
            title: "Morning pastry",
            category: "Food",
            amount: -6.8,
            type: "expense",
            method: "Apple Pay"
          },
          {
            time: "10:52",
            title: "Metro ticket",
            category: "Transit",
            amount: -3.4,
            type: "expense",
            method: "Transit Card"
          },
          {
            time: "14:10",
            title: "Gallery prints",
            category: "Culture",
            amount: -28.0,
            type: "expense",
            method: "Visa"
          },
          {
            time: "18:40",
            title: "Dinner with friends",
            category: "Dining",
            amount: -52.4,
            type: "expense",
            method: "Apple Pay"
          },
          {
            time: "20:10",
            title: "Reimbursement",
            category: "Friends",
            amount: 120.0,
            type: "income",
            method: "Transfer"
          }
        ]
      }
    },
    {
      id: "2026-02-13",
      story:
        "Focused workday with a dusk run and a short supply trip. Quiet spending, steady energy, early night.",
      timeline: {
        id: "2026-02-13",
        date: "2026-02-13",
        weekday: "Fri",
        monthDay: "Feb 13",
        monthKey: "2026-02",
        headline: "Work sprint + run",
        weather: "2°C / Cloudy",
        placeCount: 3,
        travelKm: 8.9,
        steps: 10310,
        energyKcal: 1890
      },
      footprint: {
        totalDistanceKm: 8.9,
        activeMinutes: 88,
        maxSpeedKmh: 19.3,
        cities: 1,
        track: [6, 8, 12, 14, 18, 22, 19, 16, 12, 10, 8, 7],
        heatmap: [
          { x: 14, y: 28, intensity: 0.6 },
          { x: 28, y: 22, intensity: 0.5 },
          { x: 34, y: 30, intensity: 0.7 },
          { x: 22, y: 18, intensity: 0.4 }
        ],
        stops: [
          {
            time: "08:20",
            place: "Garden Residence",
            note: "Deep work block",
            distanceKm: 0,
            durationMin: 210,
            mode: "stay"
          },
          {
            time: "17:40",
            place: "West Loop Track",
            note: "5k tempo run",
            distanceKm: 4.8,
            durationMin: 34,
            mode: "walk"
          },
          {
            time: "19:05",
            place: "Corner Market",
            note: "Grocery pickup",
            distanceKm: 1.2,
            durationMin: 16,
            mode: "walk"
          }
        ]
      },
      health: {
        metrics: [
          {
            label: "Steps",
            value: 10310,
            unit: "steps",
            delta: -6.2,
            trend: "down"
          },
          {
            label: "Active Energy",
            value: 560,
            unit: "kcal",
            delta: -4.1,
            trend: "down"
          },
          {
            label: "Resting HR",
            value: 58,
            unit: "bpm",
            delta: -1.1,
            trend: "down"
          },
          {
            label: "VO₂ Max",
            value: 43.2,
            unit: "ml/kg/min",
            delta: 0.0,
            trend: "flat"
          }
        ],
        activity: [
          { label: "Move", value: 560, goal: 520 },
          { label: "Exercise", value: 42, goal: 40 },
          { label: "Stand", value: 11, goal: 10 }
        ],
        heartRate: [
          { time: "06:30", bpm: 54 },
          { time: "12:00", bpm: 72 },
          { time: "17:50", bpm: 112 },
          { time: "20:20", bpm: 70 }
        ],
        sleepHours: 6.8,
        mindfulnessMin: 12
      },
      spending: {
        incomeTotal: 0,
        expenseTotal: 24.2,
        topCategory: "Grocery",
        items: [
          {
            time: "19:12",
            title: "Groceries",
            category: "Grocery",
            amount: -24.2,
            type: "expense",
            method: "Visa"
          }
        ]
      }
    },
    {
      id: "2026-02-12",
      story:
        "Creative morning, long studio session, late-night tea at the river. Light travel but high focus.",
      timeline: {
        id: "2026-02-12",
        date: "2026-02-12",
        weekday: "Thu",
        monthDay: "Feb 12",
        monthKey: "2026-02",
        headline: "Studio flow",
        weather: "5°C / Clear",
        placeCount: 4,
        travelKm: 6.2,
        steps: 8420,
        energyKcal: 1620
      },
      footprint: {
        totalDistanceKm: 6.2,
        activeMinutes: 64,
        maxSpeedKmh: 16.8,
        cities: 1,
        track: [
          5, 7, 9, 11, 14, 16, 18, 16, 14, 12, 10, 8, 6, 5
        ],
        heatmap: [
          { x: 10, y: 24, intensity: 0.5 },
          { x: 24, y: 20, intensity: 0.4 },
          { x: 30, y: 32, intensity: 0.6 }
        ],
        stops: [
          {
            time: "08:00",
            place: "Garden Residence",
            note: "Sketching session",
            distanceKm: 0,
            durationMin: 60,
            mode: "stay"
          },
          {
            time: "11:10",
            place: "Studio Loft",
            note: "Design sprint",
            distanceKm: 2.1,
            durationMin: 210,
            mode: "walk"
          },
          {
            time: "20:40",
            place: "River Tea House",
            note: "Late tea + notes",
            distanceKm: 1.6,
            durationMin: 55,
            mode: "walk"
          }
        ]
      },
      health: {
        metrics: [
          {
            label: "Steps",
            value: 8420,
            unit: "steps",
            delta: -8.4,
            trend: "down"
          },
          {
            label: "Active Energy",
            value: 480,
            unit: "kcal",
            delta: -12.2,
            trend: "down"
          },
          {
            label: "Resting HR",
            value: 57,
            unit: "bpm",
            delta: -0.4,
            trend: "down"
          },
          {
            label: "VO₂ Max",
            value: 43.0,
            unit: "ml/kg/min",
            delta: -0.3,
            trend: "down"
          }
        ],
        activity: [
          { label: "Move", value: 480, goal: 520 },
          { label: "Exercise", value: 28, goal: 40 },
          { label: "Stand", value: 10, goal: 10 }
        ],
        heartRate: [
          { time: "07:00", bpm: 53 },
          { time: "12:30", bpm: 76 },
          { time: "16:40", bpm: 68 },
          { time: "21:10", bpm: 60 }
        ],
        sleepHours: 7.9,
        mindfulnessMin: 22
      },
      spending: {
        incomeTotal: 0,
        expenseTotal: 16.2,
        topCategory: "Cafe",
        items: [
          {
            time: "20:55",
            title: "Tea set",
            category: "Cafe",
            amount: -16.2,
            type: "expense",
            method: "Apple Pay"
          }
        ]
      }
    }
  ];

  return days;
};

export const buildMockDay = (date: Date): DayData => {
  const iso = toIsoDate(date);
  const seed = date.getDate();
  const steps = 7200 + seed * 210;
  const distance = 4.2 + seed * 0.32;
  const energy = 1500 + seed * 18;
  const track = Array.from({ length: 18 }, (_, index) =>
    Math.round(6 + Math.abs(Math.sin((index + seed) / 3) * 22))
  );

  return {
    id: iso,
    story:
      "A calm day captured in soft movements, a few intentional stops, and small moments that stitched the day together.",
    timeline: {
      id: iso,
      date: iso,
      weekday: formatWeekday(date),
      monthDay: formatMonthDay(date),
      monthKey: formatMonthKey(date),
      headline: "Everyday flow",
      weather: "6°C / Clear",
      placeCount: 4,
      travelKm: Number(distance.toFixed(1)),
      steps,
      energyKcal: Math.round(energy)
    },
    footprint: {
      totalDistanceKm: Number(distance.toFixed(1)),
      activeMinutes: 68 + seed,
      maxSpeedKmh: 16.2 + seed * 0.3,
      cities: 1,
      track,
      heatmap: [
        { x: 16, y: 26, intensity: 0.6 },
        { x: 32, y: 22, intensity: 0.5 },
        { x: 40, y: 34, intensity: 0.4 }
      ],
      stops: [
        {
          time: "09:20",
          place: "Morning base",
          note: "Coffee + planning",
          distanceKm: 0,
          durationMin: 42,
          mode: "stay"
        },
        {
          time: "12:10",
          place: "Neighborhood walk",
          note: "Midday steps",
          distanceKm: 2.6,
          durationMin: 24,
          mode: "walk"
        },
        {
          time: "19:30",
          place: "Evening stop",
          note: "Dinner + notes",
          distanceKm: 1.8,
          durationMin: 55,
          mode: "walk"
        }
      ]
    },
    health: {
      metrics: [
        {
          label: "Steps",
          value: steps,
          unit: "steps",
          delta: 4.2,
          trend: "up"
        },
        {
          label: "Active Energy",
          value: Math.round(460 + seed * 6),
          unit: "kcal",
          delta: 2.4,
          trend: "up"
        },
        {
          label: "Resting HR",
          value: 58 - (seed % 4),
          unit: "bpm",
          delta: -1.2,
          trend: "down"
        },
        {
          label: "VO₂ Max",
          value: Number((42.2 + seed * 0.05).toFixed(1)),
          unit: "ml/kg/min",
          delta: 0.6,
          trend: "up"
        }
      ],
      activity: [
        { label: "Move", value: 520 + seed * 4, goal: 520 },
        { label: "Exercise", value: 32 + seed, goal: 40 },
        { label: "Stand", value: 10 + (seed % 3), goal: 10 }
      ],
      heartRate: [
        { time: "07:00", bpm: 54 + (seed % 4) },
        { time: "12:30", bpm: 72 + (seed % 8) },
        { time: "18:10", bpm: 88 + (seed % 10) },
        { time: "21:10", bpm: 62 + (seed % 6) }
      ],
      sleepHours: Number((7.1 + (seed % 3) * 0.3).toFixed(1)),
      mindfulnessMin: 12 + (seed % 6)
    },
    spending: {
      incomeTotal: seed % 5 === 0 ? 120 : 0,
      expenseTotal: Number((18 + seed * 1.4).toFixed(2)),
      topCategory: "Food",
      items: [
        {
          time: "10:20",
          title: "Coffee",
          category: "Food",
          amount: -4.8,
          type: "expense",
          method: "Apple Pay"
        },
        {
          time: "13:05",
          title: "Lunch",
          category: "Dining",
          amount: -12.4,
          type: "expense",
          method: "Visa"
        }
      ]
    }
  };
};

export const getDashboardData = (): DashboardData => {
  const days = buildDays();
  return {
    days,
    selectedDayId: days[0]?.id ?? ""
  };
};

export const getDayById = (
  days: DayData[],
  dayId: string
): DayData | undefined => days.find((day) => day.id === dayId);

export const buildTimelineDays = (days: DayData[]): TimelineDay[] =>
  days.map((day) => day.timeline);
