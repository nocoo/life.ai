"use client";

import { cn } from "@/lib/utils";
import type { TimeSlot, TimelineItem } from "@/models/day-view";
import { TIMELINE_COLORS } from "@/lib/timeline-colors";

export interface EnhancedTimelineProps {
  slots: TimeSlot[];
  className?: string;
}

/** Compressed display item - either a slot or a gap */
type DisplayItem =
  | { type: "slot"; slot: TimeSlot }
  | { type: "gap"; startSlot: string; endSlot: string };

/**
 * Compress consecutive empty slots into gap indicators
 * Returns a mix of slots and gaps for display
 */
function compressEmptySlots(slots: TimeSlot[]): DisplayItem[] {
  const result: DisplayItem[] = [];
  let gapStart: string | null = null;
  let gapEnd: string | null = null;

  for (const slot of slots) {
    if (slot.hasData) {
      // If we were tracking a gap, add it first
      if (gapStart !== null && gapEnd !== null) {
        result.push({ type: "gap", startSlot: gapStart, endSlot: gapEnd });
        gapStart = null;
        gapEnd = null;
      }
      result.push({ type: "slot", slot });
    } else {
      // Track the gap
      if (gapStart === null) {
        gapStart = slot.slot;
      }
      gapEnd = slot.slot;
    }
  }

  // Don't add trailing gap (after last data)

  return result;
}

/**
 * Pill component for displaying a timeline item
 */
function Pill({ item }: { item: TimelineItem }) {
  const colorClass = TIMELINE_COLORS[item.type];

  return (
    <span
      className={cn(
        colorClass,
        "text-white px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
      )}
    >
      {item.label}
    </span>
  );
}

/**
 * Gap indicator between compressed empty slots
 */
function GapIndicator() {
  return (
    <div className="flex items-center py-1">
      {/* Left side empty */}
      <div className="flex-1" />

      {/* Center - gap indicator */}
      <div className="w-14 flex justify-center">
        <span className="text-xs text-muted-foreground">···</span>
      </div>

      {/* Right side empty */}
      <div className="flex-1" />
    </div>
  );
}

/**
 * Single time slot row with left/right item display
 * Background alternates by hour for visual grouping
 */
function TimeSlotRow({ slot }: { slot: TimeSlot }) {
  const leftItems = slot.items.filter((i) => i.side === "left");
  const rightItems = slot.items.filter((i) => i.side === "right");

  // Alternate background by hour (odd hours get light gray)
  const isOddHour = slot.hour % 2 === 1;

  return (
    <div
      className={cn(
        "flex items-center py-1 min-h-[32px]",
        isOddHour && "bg-muted/30"
      )}
    >
      {/* Left side - right aligned */}
      <div className="flex-1 flex justify-end gap-1 pr-3">
        {leftItems.map((item, idx) => (
          <Pill key={`${item.type}-${idx}`} item={item} />
        ))}
      </div>

      {/* Center - time label with border */}
      <div className="w-14 flex-shrink-0 relative">
        {/* Vertical line */}
        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-border" />

        {/* Time label */}
        <div className="relative flex justify-center">
          <span
            className={cn(
              "text-xs px-1",
              // Use transparent background to let row bg show through
              isOddHour ? "bg-muted/30" : "bg-background",
              slot.hasData
                ? "text-foreground font-medium"
                : "text-muted-foreground"
            )}
          >
            {slot.slot}
          </span>
        </div>
      </div>

      {/* Right side - left aligned */}
      <div className="flex-1 flex gap-1 pl-3">
        {rightItems.map((item, idx) => (
          <Pill key={`${item.type}-${idx}`} item={item} />
        ))}
      </div>
    </div>
  );
}

/**
 * Enhanced Timeline component with center axis layout
 *
 * Layout:
 * - Left side: Duration/state items (sleep stages, workouts, water)
 * - Center: Time axis (HH:mm)
 * - Right side: Instant metrics (heart rate, steps, etc.)
 *
 * Features:
 * - 15-minute granularity (96 slots per day)
 * - Compresses consecutive empty slots into "..." gaps
 * - Pill-shaped badges with stable color mapping
 */
export function EnhancedTimeline({ slots, className }: EnhancedTimelineProps) {
  const displayItems = compressEmptySlots(slots);

  return (
    <div className={cn("flex flex-col", className)}>
      {displayItems.map((item, idx) =>
        item.type === "gap" ? (
          <GapIndicator key={`gap-${idx}`} />
        ) : (
          <TimeSlotRow key={item.slot.slot} slot={item.slot} />
        )
      )}

      {/* Empty state */}
      {displayItems.length === 0 && (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          No data for this day
        </div>
      )}
    </div>
  );
}
