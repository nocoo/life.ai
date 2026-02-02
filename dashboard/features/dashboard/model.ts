export type TimelineDay = {
  id: string;
  date: string;
  weekday: string;
  monthDay: string;
  monthKey: string;
  headline: string;
  weather: string;
  placeCount: number;
  travelKm: number;
  steps: number;
  energyKcal: number;
};

export type FootprintStop = {
  time: string;
  place: string;
  note: string;
  distanceKm: number;
  durationMin: number;
  mode: "walk" | "ride" | "rail" | "stay";
};

export type FootprintData = {
  totalDistanceKm: number;
  activeMinutes: number;
  maxSpeedKmh: number;
  cities: number;
  track: number[];
  heatmap: Array<{ x: number; y: number; intensity: number }>;
  stops: FootprintStop[];
};

export type HealthMetric = {
  label: string;
  value: number;
  unit: string;
  delta: number;
  trend: "up" | "down" | "flat";
};

export type ActivityRing = {
  label: string;
  value: number;
  goal: number;
};

export type HeartRateSample = {
  time: string;
  bpm: number;
};

export type HealthData = {
  metrics: HealthMetric[];
  activity: ActivityRing[];
  heartRate: HeartRateSample[];
  sleepHours: number;
  mindfulnessMin: number;
};

export type SpendingItem = {
  time: string;
  title: string;
  category: string;
  amount: number;
  type: "income" | "expense";
  method: string;
};

export type SpendingData = {
  incomeTotal: number;
  expenseTotal: number;
  items: SpendingItem[];
  topCategory: string;
};

export type DayData = {
  id: string;
  story: string;
  timeline: TimelineDay;
  footprint: FootprintData;
  health: HealthData;
  spending: SpendingData;
};

export const formatNumber = (value: number, digits = 0) =>
  value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });

export const formatKm = (value: number) => `${formatNumber(value, 1)} km`;

export const formatKmh = (value: number) => `${formatNumber(value, 1)} km/h`;

export const formatMinutes = (value: number) => `${formatNumber(value)} min`;

export const formatMoney = (value: number) =>
  `$${formatNumber(Math.abs(value), 2)}`;

export const formatDelta = (value: number, unit: string) => {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${Math.abs(value).toFixed(1)}${unit}`;
};

export const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec"
];

export const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);

export const pad2 = (value: number) => String(value).padStart(2, "0");

export const formatMonthKey = (date: Date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;

export const formatMonthDay = (date: Date) =>
  `${MONTH_LABELS[date.getMonth()]} ${pad2(date.getDate())}`;

export const formatWeekday = (date: Date) =>
  date.toLocaleDateString("en-US", { weekday: "short" });
