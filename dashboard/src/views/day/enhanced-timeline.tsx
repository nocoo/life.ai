"use client";

import { cn } from "@/lib/utils";
import type { TimeSlot, TimelineItem, TimelineDataType } from "@/models/day-view";
import { TIMELINE_COLORS } from "@/lib/timeline-colors";
import { getSunAltitude, isSunUp } from "@/lib/sun-position";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface EnhancedTimelineProps {
  slots: TimeSlot[];
  className?: string;
  /** Date for sun position calculation */
  date?: Date;
  /** Latitude for sun position (from Footprint data) */
  latitude?: number;
  /** Longitude for sun position (from Footprint data) */
  longitude?: number;
}

/**
 * Chinese labels and tooltips for timeline items
 */
const CHINESE_LABELS: Record<TimelineDataType, { short: string; tooltip: string }> = {
  "sleep-deep": { short: "深睡", tooltip: "深度睡眠：身体恢复和细胞修复的关键阶段" },
  "sleep-core": { short: "浅睡", tooltip: "浅度睡眠：占睡眠时间最长的阶段" },
  "sleep-rem": { short: "快眼", tooltip: "快速眼动睡眠：梦境发生的阶段，有助于记忆巩固" },
  "sleep-awake": { short: "清醒", tooltip: "睡眠中的清醒时段" },
  "awake-day": { short: "起床", tooltip: "白天清醒状态" },
  workout: { short: "运动", tooltip: "运动锻炼" },
  water: { short: "饮水", tooltip: "饮水记录" },
  "transport-walking": { short: "步行", tooltip: "步行移动" },
  "transport-cycling": { short: "骑行", tooltip: "骑自行车移动" },
  "transport-driving": { short: "驾车", tooltip: "驾驶汽车移动" },
  "transport-stationary": { short: "停留", tooltip: "原地停留" },
  "transport-summary": { short: "行程", tooltip: "行程总结：连续移动超过30分钟的统计" },
  elevation: { short: "海拔", tooltip: "海拔高度" },
  heartRate: { short: "心率", tooltip: "心率" },
  hrv: { short: "心率变异", tooltip: "心率变异性：反映自主神经系统调节能力" },
  oxygenSaturation: { short: "血氧", tooltip: "血氧饱和度" },
  respiratoryRate: { short: "呼吸", tooltip: "呼吸频率：每分钟呼吸次数" },
  steps: { short: "步数", tooltip: "步数" },
  distance: { short: "距离", tooltip: "移动距离" },
};

/**
 * Generate tooltip text for a timeline item
 */
function getTooltipText(item: TimelineItem): string {
  const base = CHINESE_LABELS[item.type]?.tooltip || item.type;
  
  if (item.value !== undefined) {
    switch (item.type) {
      case "heartRate":
        return `${base}：${item.value} 次/分`;
      case "hrv":
        return `${base}：${item.value} 毫秒`;
      case "oxygenSaturation":
        return `${base}：${item.value}%`;
      case "respiratoryRate":
        return `${base}：${item.value.toFixed(1)} 次/分`;
      case "steps":
        return `${base}：${item.value} 步`;
      case "distance":
        return item.value >= 1 
          ? `${base}：${item.value.toFixed(2)} 公里`
          : `${base}：${Math.round(item.value * 1000)} 米`;
      case "water":
        return `${base}：${item.value} 毫升`;
      case "transport-walking":
      case "transport-cycling":
      case "transport-driving":
        return `${base}：平均速度 ${item.value.toFixed(1)} km/h`;
      case "elevation":
        return `${base}：${Math.round(item.value)} 米`;
      default:
        return `${base}：${item.value}`;
    }
  }
  
  return base;
}

/**
 * Pill component for displaying a timeline item with hover tooltip
 */
function Pill({ item }: { item: TimelineItem }) {
  const colorClass = TIMELINE_COLORS[item.type];
  const tooltipText = getTooltipText(item);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            colorClass,
            "text-white px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap cursor-default"
          )}
        >
          {item.label}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <p>{tooltipText}</p>
      </TooltipContent>
    </Tooltip>
  );
}

interface SunCurveIndicatorProps {
  hour: number;
  minute: number;
  date: Date;
  latitude: number;
  longitude: number;
}

/**
 * Sun/Moon curve indicator with S-curve effect
 * 
 * - Daytime (sun up): Sun emoji moves right as altitude increases
 * - Nighttime (sun down): Moon emoji moves left, tracking "anti-sun" position
 * - This creates an S-shaped curve across the day
 * - A vertical dashed line marks the sunrise/sunset threshold (horizon)
 */
function SunCurveIndicator({ hour, minute, date, latitude, longitude }: SunCurveIndicatorProps) {
  const altitude = getSunAltitude(hour, minute, date, latitude, longitude);
  const sunUp = isSunUp(hour, minute, date, latitude, longitude);
  
  // S-curve positioning:
  // - When sun is up: position = 50% + altitude * 50% (50-100%)
  // - When sun is down: position = 50% + altitude * 50% (0-50%)
  // This naturally creates S-curve because altitude transitions through 0 at sunrise/sunset
  // 
  // altitude ranges from -1 (deepest night) to +1 (solar noon)
  // position: altitude -1 -> 0%, altitude 0 -> 50%, altitude +1 -> 100%
  const position = ((altitude + 1) / 2) * 100;
  
  return (
    <div 
      className="w-16 flex-shrink-0 relative h-full flex items-center"
      style={{ minHeight: 32 }}
    >
      {/* Horizon reference line (dashed vertical line at 50%) */}
      <div 
        className="absolute top-0 bottom-0 border-l border-dashed border-muted-foreground/30"
        style={{ left: "50%" }}
      />
      
      {/* The emoji indicator */}
      <div
        className="absolute text-sm z-10"
        style={{
          left: `${position}%`,
          transform: "translateX(-50%)",
        }}
      >
        {sunUp ? "☀️" : "🌙"}
      </div>
    </div>
  );
}

/**
 * Priority order for left side items (higher number = closer to time axis)
 * Layout: [other items] [elevation] [transport] [awake-day/sleep]
 */
const LEFT_ITEM_PRIORITY: Record<string, number> = {
  // Sleep states - rightmost (closest to time axis)
  "awake-day": 100,
  "sleep-deep": 100,
  "sleep-core": 100,
  "sleep-rem": 100,
  "sleep-awake": 100,
  // Transportation - second position
  "transport-walking": 90,
  "transport-cycling": 90,
  "transport-driving": 90,
  "transport-stationary": 90,
  // Elevation - third position
  elevation: 80,
  // Transport summary - fourth position (left of transport capsules)
  "transport-summary": 70,
  // Other items (workout, water) - leftmost
  workout: 10,
  water: 10,
};

/**
 * Sort left items by priority (higher priority = later in array = closer to time axis)
 */
function sortLeftItems(items: TimelineItem[]): TimelineItem[] {
  return [...items].sort((a, b) => {
    const priorityA = LEFT_ITEM_PRIORITY[a.type] ?? 0;
    const priorityB = LEFT_ITEM_PRIORITY[b.type] ?? 0;
    return priorityA - priorityB;
  });
}

interface TimeSlotRowProps {
  slot: TimeSlot;
  date: Date;
  latitude: number;
  longitude: number;
}

/**
 * Single time slot row with left/right item display
 * Background alternates by hour for visual grouping
 */
function TimeSlotRow({ slot, date, latitude, longitude }: TimeSlotRowProps) {
  const leftItems = sortLeftItems(slot.items.filter((i) => i.side === "left"));
  const rightItems = slot.items.filter((i) => i.side === "right");

  // Alternate background by hour (odd hours get light gray)
  const isOddHour = slot.hour % 2 === 1;

  return (
    <div
      className={cn(
        "flex items-center py-1 min-h-[32px]",
        isOddHour && "bg-muted/50"
      )}
    >
      {/* Sun/Moon curve indicator */}
      <SunCurveIndicator 
        hour={slot.hour} 
        minute={slot.quarter * 15} 
        date={date}
        latitude={latitude}
        longitude={longitude}
      />

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
              isOddHour ? "bg-muted/50" : "bg-background",
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

/** Default coordinates (Beijing) when no location data available */
const DEFAULT_LAT = 39.9;
const DEFAULT_LON = 116.4;

/**
 * Enhanced Timeline component with center axis layout
 *
 * Layout:
 * - Left side: Sun/moon S-curve + Duration/state items (sleep stages, workouts, water)
 * - Center: Time axis (HH:mm)
 * - Right side: Instant metrics (heart rate, steps, etc.)
 *
 * Features:
 * - 15-minute granularity (96 slots per day)
 * - Shows ALL 96 time slots (no compression) for accurate time scale
 * - S-shaped sun/moon curve with horizon reference line
 * - Pill-shaped badges with stable color mapping
 * - Hover tooltips with Chinese descriptions
 */
export function EnhancedTimeline({ 
  slots, 
  className,
  date = new Date(),
  latitude = DEFAULT_LAT,
  longitude = DEFAULT_LON,
}: EnhancedTimelineProps) {
  return (
    <TooltipProvider>
      <div className={cn("flex flex-col", className)}>
        {/* Render ALL 96 slots without compression */}
        {slots.map((slot) => (
          <TimeSlotRow 
            key={slot.slot} 
            slot={slot} 
            date={date}
            latitude={latitude}
            longitude={longitude}
          />
        ))}

        {/* Empty state */}
        {slots.length === 0 && (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            暂无数据
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
