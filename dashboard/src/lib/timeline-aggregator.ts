/**
 * Timeline aggregator for 15-minute time slots
 * Aggregates Apple Health data into 96 slots (24 hours × 4 quarters)
 */

import type { DayHealthData, SleepStageType } from "@/models/apple-health";
import type { TimeSlot, TimelineItem, TimelineDataType } from "@/models/day-view";
import { getItemSide } from "./timeline-colors";

/** Total number of 15-minute slots in a day */
export const SLOTS_PER_DAY = 96;

/**
 * Convert HH:mm time string to slot index (0-95)
 * Rounds to the nearest 15-minute boundary
 *
 * Examples:
 * - "00:07" → 0 (rounds to 00:00)
 * - "00:08" → 1 (rounds to 00:15)
 * - "00:23" → 2 (rounds to 00:30)
 * - "00:37" → 2 (rounds to 00:30)
 * - "00:38" → 3 (rounds to 00:45)
 * - "00:53" → 4 (rounds to 01:00)
 */
export function timeToSlotIndex(time: string): number {
  const [h, m] = time.split(":").map(Number);
  const quarter = Math.round(m / 15);
  if (quarter === 4) {
    // Rounds up to the next hour
    return ((h + 1) % 24) * 4;
  }
  return h * 4 + quarter;
}

/**
 * Convert slot index to time string
 */
export function slotIndexToTime(index: number): string {
  const hour = Math.floor(index / 4);
  const quarter = index % 4;
  return `${hour.toString().padStart(2, "0")}:${(quarter * 15).toString().padStart(2, "0")}`;
}

/**
 * Extract time from ISO datetime string
 * Returns HH:mm format
 */
function extractTimeFromISO(datetime: string): string {
  const match = datetime.match(/T(\d{2}:\d{2})/);
  return match ? match[1] : "00:00";
}

/**
 * Create a TimelineItem
 */
function createItem(
  type: TimelineDataType,
  label: string,
  value?: number
): TimelineItem {
  return {
    type,
    label,
    value,
    side: getItemSide(type),
  };
}

/**
 * Map SleepStageType to TimelineDataType
 */
function sleepStageToType(stage: SleepStageType): TimelineDataType {
  switch (stage) {
    case "deep":
      return "sleep-deep";
    case "core":
      return "sleep-core";
    case "rem":
      return "sleep-rem";
    case "awake":
      return "sleep-awake";
  }
}

/**
 * Get all slot indices covered by a time range
 * Handles overnight ranges (e.g., 23:30 to 07:00)
 */
function getSlotsInRange(startTime: string, endTime: string): number[] {
  const startIdx = timeToSlotIndex(startTime);
  const endIdx = timeToSlotIndex(endTime);

  const slots: number[] = [];

  if (startIdx <= endIdx) {
    // Normal range within same day
    for (let i = startIdx; i < endIdx; i++) {
      slots.push(i);
    }
  } else {
    // Overnight range (crosses midnight)
    // From start to end of day
    for (let i = startIdx; i < SLOTS_PER_DAY; i++) {
      slots.push(i);
    }
    // From start of day to end
    for (let i = 0; i < endIdx; i++) {
      slots.push(i);
    }
  }

  return slots;
}

/**
 * Generate 96 empty time slots
 */
function createEmptySlots(): TimeSlot[] {
  const slots: TimeSlot[] = [];
  for (let i = 0; i < SLOTS_PER_DAY; i++) {
    const hour = Math.floor(i / 4);
    const quarter = (i % 4) as 0 | 1 | 2 | 3;
    slots.push({
      slot: slotIndexToTime(i),
      hour,
      quarter,
      items: [],
      hasData: false,
    });
  }
  return slots;
}

/**
 * Generate time slots from Apple Health data
 * This only handles Apple Health data for now
 */
export function generateHealthTimeSlots(health: DayHealthData): TimeSlot[] {
  const slots = createEmptySlots();

  // 1. Fill sleep stages
  if (health.sleep?.stages) {
    for (const stage of health.sleep.stages) {
      const slotIndices = getSlotsInRange(stage.start, stage.end);
      const type = sleepStageToType(stage.type);
      const label =
        stage.type.charAt(0).toUpperCase() + stage.type.slice(1);

      for (const idx of slotIndices) {
        // Only add if not already present (avoid duplicates)
        if (!slots[idx].items.some((item) => item.type === type)) {
          slots[idx].items.push(createItem(type, label));
        }
      }
    }
  }

  // 2. Fill workouts
  for (const workout of health.workouts) {
    const startTime = extractTimeFromISO(workout.start);
    const endTime = extractTimeFromISO(workout.end);
    const slotIndices = getSlotsInRange(startTime, endTime);

    // Use emoji based on workout type
    const emoji = workout.type.includes("Running")
      ? "🏃"
      : workout.type.includes("Walking")
        ? "🚶"
        : workout.type.includes("Cycling")
          ? "🚴"
          : workout.type.includes("Swimming")
            ? "🏊"
            : "🏋️";
    const label = `${emoji} ${workout.typeName}`;

    for (const idx of slotIndices) {
      if (!slots[idx].items.some((item) => item.type === "workout")) {
        slots[idx].items.push(createItem("workout", label));
      }
    }
  }

  // 3. Fill heart rate (group by slot and average)
  if (health.heartRate?.records) {
    const hrBySlot = new Map<number, number[]>();
    for (const record of health.heartRate.records) {
      const idx = timeToSlotIndex(record.time);
      const existing = hrBySlot.get(idx) || [];
      hrBySlot.set(idx, [...existing, record.value]);
    }

    for (const [idx, values] of hrBySlot) {
      const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
      slots[idx].items.push(createItem("heartRate", `♥ ${avg}`, avg));
    }
  }

  // 4. Fill HRV (exact time points)
  if (health.hrv?.records) {
    for (const record of health.hrv.records) {
      const idx = timeToSlotIndex(record.time);
      slots[idx].items.push(
        createItem("hrv", `HRV ${Math.round(record.value)}`, record.value)
      );
    }
  }

  // 5. Fill oxygen saturation (exact time points)
  if (health.oxygenSaturation?.records) {
    for (const record of health.oxygenSaturation.records) {
      const idx = timeToSlotIndex(record.time);
      slots[idx].items.push(
        createItem(
          "oxygenSaturation",
          `SpO₂ ${Math.round(record.value)}%`,
          record.value
        )
      );
    }
  }

  // 6. Fill respiratory rate (exact time points)
  if (health.respiratoryRate?.records) {
    for (const record of health.respiratoryRate.records) {
      const idx = timeToSlotIndex(record.time);
      slots[idx].items.push(
        createItem(
          "respiratoryRate",
          `🫁 ${record.value.toFixed(1)}`,
          record.value
        )
      );
    }
  }

  // 7. Fill water intake (exact time points)
  for (const record of health.water) {
    const idx = timeToSlotIndex(record.time);
    slots[idx].items.push(
      createItem("water", `💧 ${record.amount}ml`, record.amount)
    );
  }

  // 8. Fill steps (hourly data, only at :00 slots)
  for (const record of health.steps) {
    const idx = record.hour * 4; // :00 slot for that hour
    if (record.count > 0) {
      slots[idx].items.push(
        createItem("steps", `👣 ${record.count}`, record.count)
      );
    }
  }

  // 9. Fill distance (hourly data, only at :00 slots)
  if (health.distance?.records) {
    for (const record of health.distance.records) {
      const idx = record.hour * 4; // :00 slot for that hour
      if (record.distance > 0) {
        const label =
          record.distance >= 1
            ? `📏 ${record.distance.toFixed(1)}km`
            : `📏 ${Math.round(record.distance * 1000)}m`;
        slots[idx].items.push(createItem("distance", label, record.distance));
      }
    }
  }

  // Mark slots with data
  for (const slot of slots) {
    slot.hasData = slot.items.length > 0;
  }

  return slots;
}
