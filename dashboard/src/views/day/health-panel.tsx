"use client";

import { Moon, Heart, Footprints, Droplets, Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DayHealthData, SleepStage, HeartRateRecord } from "@/models/apple-health";
import { SLEEP_STAGE_COLORS, SLEEP_STAGE_LABELS, getHeartRateColor } from "@/lib/timeline-colors";

export interface HealthPanelProps {
  data: DayHealthData;
}

/** Format time - handles both HH:mm and ISO datetime formats */
const formatTime = (time: string): string => {
  // If already in HH:mm format, return as-is
  if (/^\d{2}:\d{2}$/.test(time)) {
    return time;
  }
  // Try to extract from ISO datetime format
  const match = time.match(/T(\d{2}:\d{2})/);
  return match ? match[1] : time;
};

/**
 * Convert sleep stages to 15-minute bars
 * Each bar represents a 15-minute slot, colored by the dominant sleep stage
 */
function getSleepBars(stages: SleepStage[]): { type: string; minutes: number }[] {
  if (stages.length === 0) return [];

  const bars: { type: string; minutes: number }[] = [];
  
  for (const stage of stages) {
    // Each stage may span multiple 15-minute bars
    let remaining = stage.duration;
    while (remaining > 0) {
      const barMinutes = Math.min(remaining, 15);
      bars.push({ type: stage.type, minutes: barMinutes });
      remaining -= barMinutes;
    }
  }
  
  return bars;
}

/**
 * Convert heart rate records to 15-minute aggregated bars
 * Groups records into 15-minute slots and calculates average value per slot
 */
function getHeartRateBars(records: HeartRateRecord[]): { avgBpm: number; count: number }[] {
  if (records.length === 0) return [];

  // Group records by 15-minute slot (96 slots per day)
  const slots = new Map<number, number[]>();
  
  for (const record of records) {
    // Parse time (HH:mm format)
    const [hours, minutes] = record.time.split(":").map(Number);
    const totalMinutes = hours * 60 + minutes;
    const slotIndex = Math.floor(totalMinutes / 15);
    
    if (!slots.has(slotIndex)) {
      slots.set(slotIndex, []);
    }
    slots.get(slotIndex)!.push(record.value);
  }

  // Convert to sorted array of bars
  const sortedSlots = Array.from(slots.entries()).sort((a, b) => a[0] - b[0]);
  
  // Create bars for contiguous slots only (no gaps)
  if (sortedSlots.length === 0) return [];
  
  const minSlot = sortedSlots[0][0];
  const maxSlot = sortedSlots[sortedSlots.length - 1][0];
  
  const bars: { avgBpm: number; count: number }[] = [];
  for (let slot = minSlot; slot <= maxSlot; slot++) {
    const values = slots.get(slot);
    if (values && values.length > 0) {
      const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
      bars.push({ avgBpm: avg, count: values.length });
    } else {
      // Fill gaps with 0 (will be rendered as empty/transparent)
      bars.push({ avgBpm: 0, count: 0 });
    }
  }
  
  return bars;
}

export function HealthPanel({ data }: HealthPanelProps) {
  // Generate sleep bars for visualization
  const sleepBars = data.sleep ? getSleepBars(data.sleep.stages) : [];

  return (
    <>
      {/* Sleep Card */}
      {data.sleep && (
        <Card className="min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Moon className="h-4 w-4 text-indigo-500" />
              睡眠
              <span className="ml-auto text-base font-semibold text-indigo-500">
                {(data.sleep.duration / 60).toFixed(1)}h
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Bar Chart - Vertical bars representing 15-minute slots */}
            <div className="flex h-6 w-full items-end gap-px">
              {sleepBars.map((bar, i) => (
                <div
                  key={i}
                  className={`flex-1 rounded-sm ${SLEEP_STAGE_COLORS[bar.type as keyof typeof SLEEP_STAGE_COLORS]}`}
                  style={{ height: "100%" }}
                />
              ))}
            </div>

            {/* Row 1: Start time, End time, Efficiency */}
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div>
                <p className="text-xs text-muted-foreground">入睡</p>
                <p className="font-medium">{formatTime(data.sleep.start)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">醒来</p>
                <p className="font-medium">{formatTime(data.sleep.end)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">效率</p>
                <p className="font-medium text-indigo-500">
                  {Math.round(((data.sleep.duration - data.sleep.awakeMinutes) / data.sleep.duration) * 100)}%
                </p>
              </div>
            </div>

            {/* Row 2: Sleep stage durations */}
            <div className="grid grid-cols-4 gap-1 text-center text-xs">
              <div className="flex flex-col items-center gap-1">
                <div className={`h-2 w-2 rounded-sm ${SLEEP_STAGE_COLORS.deep}`} />
                <span className="text-muted-foreground">{SLEEP_STAGE_LABELS.deep}</span>
                <span className="font-medium">{data.sleep.deepMinutes}m</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <div className={`h-2 w-2 rounded-sm ${SLEEP_STAGE_COLORS.core}`} />
                <span className="text-muted-foreground">{SLEEP_STAGE_LABELS.core}</span>
                <span className="font-medium">{data.sleep.coreMinutes}m</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <div className={`h-2 w-2 rounded-sm ${SLEEP_STAGE_COLORS.rem}`} />
                <span className="text-muted-foreground">{SLEEP_STAGE_LABELS.rem}</span>
                <span className="font-medium">{data.sleep.remMinutes}m</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <div className={`h-2 w-2 rounded-sm ${SLEEP_STAGE_COLORS.awake}`} />
                <span className="text-muted-foreground">{SLEEP_STAGE_LABELS.awake}</span>
                <span className="font-medium">{data.sleep.awakeMinutes}m</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Heart Rate Card */}
      {data.heartRate && (
        <Card className="min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Heart className="h-4 w-4 text-red-500" />
              心率
              <span className="ml-auto text-base font-semibold text-red-500">
                {data.heartRate.avg} bpm
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Bar Chart - Vertical bars representing 15-minute slots */}
            {(() => {
              const heartRateBars = getHeartRateBars(data.heartRate!.records);
              return (
                <div className="flex h-6 w-full items-end gap-px">
                  {heartRateBars.map((bar, i) => (
                    <div
                      key={i}
                      className={`flex-1 rounded-sm ${bar.avgBpm > 0 ? getHeartRateColor(bar.avgBpm) : "bg-muted"}`}
                      style={{ height: "100%" }}
                      title={bar.avgBpm > 0 ? `${bar.avgBpm} bpm` : "无数据"}
                    />
                  ))}
                </div>
              );
            })()}

            {/* Row: Min, Avg, Max */}
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div>
                <p className="text-xs text-muted-foreground">最低</p>
                <p className="font-medium">{data.heartRate.min}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">平均</p>
                <p className="font-medium text-red-500">{data.heartRate.avg}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">最高</p>
                <p className="font-medium">{data.heartRate.max}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Steps Card */}
      {data.steps.length > 0 && (
        <Card className="min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Footprints className="h-4 w-4 text-green-500" />
              步数
              <span className="ml-auto text-base font-semibold text-green-500">
                {data.totalSteps.toLocaleString()}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Bar Chart - Vertical bars representing hourly steps */}
            {(() => {
              const maxSteps = Math.max(...data.steps.map((x) => x.count));
              return (
                <div className="flex h-6 w-full items-end gap-px">
                  {data.steps.map((s, i) => {
                    const height = maxSteps > 0 ? (s.count / maxSteps) * 100 : 0;
                    return (
                      <div
                        key={i}
                        className={`flex-1 rounded-sm ${s.count > 0 ? "bg-green-500" : "bg-muted"}`}
                        style={{ height: s.count > 0 ? `${Math.max(height, 10)}%` : "100%" }}
                        title={`${s.hour}:00 - ${s.count.toLocaleString()} 步`}
                      />
                    );
                  })}
                </div>
              );
            })()}

            {/* Stats Row */}
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div>
                <p className="text-xs text-muted-foreground">总计</p>
                <p className="font-medium">{data.totalSteps.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">距离</p>
                <p className="font-medium">
                  {data.distance ? `${data.distance.total.toFixed(1)} km` : "-"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">楼层</p>
                <p className="font-medium">{data.flightsClimbed || "-"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Water Card */}
      {data.water.length > 0 && (
        <Card className="min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Droplets className="h-4 w-4 text-cyan-500" />
              饮水
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">总计</span>
              <span className="text-lg font-semibold text-cyan-500">
                {(data.totalWater / 1000).toFixed(1)}L
              </span>
            </div>
            <div className="space-y-1">
              {data.water.map((w, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="text-muted-foreground">{w.time}</span>
                  <span>{w.amount}ml</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Activity Rings Card */}
      {data.activity && (
        <Card className="min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Activity className="h-4 w-4 text-orange-500" />
              活动圆环
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Progress Bars - 3 horizontal bars for Move/Exercise/Stand */}
            {(() => {
              const moveGoal = data.activity!.activeEnergyGoal ?? 500;
              const exerciseGoal = data.activity!.exerciseGoal ?? 30;
              const standGoal = data.activity!.standGoal ?? 12;
              const moveProgress = Math.min((data.activity!.activeEnergy / moveGoal) * 100, 100);
              const exerciseProgress = Math.min((data.activity!.exerciseMinutes / exerciseGoal) * 100, 100);
              const standProgress = Math.min((data.activity!.standHours / standGoal) * 100, 100);
              return (
                <div className="flex h-6 w-full gap-1">
                  {/* Move bar */}
                  <div className="flex-1 rounded-sm bg-muted overflow-hidden" title={`活动 ${Math.round(data.activity!.activeEnergy)}/${moveGoal} 千卡`}>
                    <div className="h-full bg-red-500" style={{ width: `${moveProgress}%` }} />
                  </div>
                  {/* Exercise bar */}
                  <div className="flex-1 rounded-sm bg-muted overflow-hidden" title={`运动 ${data.activity!.exerciseMinutes}/${exerciseGoal} 分钟`}>
                    <div className="h-full bg-green-500" style={{ width: `${exerciseProgress}%` }} />
                  </div>
                  {/* Stand bar */}
                  <div className="flex-1 rounded-sm bg-muted overflow-hidden" title={`站立 ${data.activity!.standHours}/${standGoal} 小时`}>
                    <div className="h-full bg-cyan-500" style={{ width: `${standProgress}%` }} />
                  </div>
                </div>
              );
            })()}

            {/* Stats Row */}
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div>
                <p className="text-xs text-muted-foreground">活动</p>
                <p className="font-medium text-red-500">
                  {Math.round(data.activity.activeEnergy)} 千卡
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">运动</p>
                <p className="font-medium text-green-500">
                  {data.activity.exerciseMinutes} 分钟
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">站立</p>
                <p className="font-medium text-cyan-500">
                  {data.activity.standHours} 小时
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
