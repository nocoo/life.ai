"use client";

import { Moon, Heart, Footprints, Droplets, Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { DayHealthData } from "@/models/apple-health";

export interface HealthPanelProps {
  data: DayHealthData;
}

/** Format time from ISO datetime */
const formatTime = (datetime: string): string => {
  const match = datetime.match(/T(\d{2}:\d{2})/);
  return match ? match[1] : datetime;
};

/** Sleep stage colors */
const stageColors: Record<string, string> = {
  deep: "bg-indigo-600",
  light: "bg-indigo-300",
  rem: "bg-purple-500",
  awake: "bg-amber-400",
};

/** Sleep stage labels */
const stageLabels: Record<string, string> = {
  deep: "Deep",
  light: "Light",
  rem: "REM",
  awake: "Awake",
};

export function HealthPanel({ data }: HealthPanelProps) {
  return (
    <>
      {/* Sleep Card */}
      {data.sleep && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Moon className="h-4 w-4 text-indigo-500" />
              Sleep
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Duration</span>
              <span className="font-medium">
                {(data.sleep.duration / 60).toFixed(1)}h
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Bedtime</span>
              <span>{formatTime(data.sleep.start)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Wake up</span>
              <span>{formatTime(data.sleep.end)}</span>
            </div>
            <Separator />
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Sleep Stages</p>
              <div className="flex h-3 w-full overflow-hidden rounded-full">
                {data.sleep.stages.map((stage, i) => (
                  <div
                    key={i}
                    className={stageColors[stage.type]}
                    style={{
                      width: `${(stage.duration / data.sleep!.duration) * 100}%`,
                    }}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(
                  data.sleep.stages.reduce(
                    (acc, s) => {
                      acc[s.type] = (acc[s.type] || 0) + s.duration;
                      return acc;
                    },
                    {} as Record<string, number>
                  )
                ).map(([type, duration]) => (
                  <Badge
                    key={type}
                    variant="secondary"
                    className="text-xs gap-1"
                  >
                    <div
                      className={`h-2 w-2 rounded-full ${stageColors[type]}`}
                    />
                    {stageLabels[type]}: {Math.round(duration)}m
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Heart Rate Card */}
      {data.heartRate && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Heart className="h-4 w-4 text-red-500" />
              Heart Rate
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-xs text-muted-foreground">Min</p>
                <p className="text-lg font-semibold">{data.heartRate.min}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Avg</p>
                <p className="text-lg font-semibold text-red-500">
                  {data.heartRate.avg}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Max</p>
                <p className="text-lg font-semibold">{data.heartRate.max}</p>
              </div>
            </div>
            <Separator />
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                Recent Readings (bpm)
              </p>
              <div className="flex flex-wrap gap-1">
                {data.heartRate.records.slice(-10).map((r, i) => (
                  <Badge key={i} variant="outline" className="text-xs">
                    {r.time}: {r.value}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Steps Card */}
      {data.steps.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Footprints className="h-4 w-4 text-green-500" />
              Steps
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total</span>
              <span className="text-lg font-semibold text-green-500">
                {data.totalSteps.toLocaleString()}
              </span>
            </div>
            <Separator />
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Hourly Breakdown</p>
              <div className="flex h-16 items-end gap-[2px]">
                {data.steps.map((s, i) => {
                  const maxSteps = Math.max(...data.steps.map((x) => x.count));
                  const height = maxSteps > 0 ? (s.count / maxSteps) * 100 : 0;
                  return (
                    <div
                      key={i}
                      className="flex-1 bg-green-500 rounded-t"
                      style={{ height: `${height}%` }}
                      title={`${s.hour}:00 - ${s.count} steps`}
                    />
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Water Card */}
      {data.water.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Droplets className="h-4 w-4 text-cyan-500" />
              Water
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total</span>
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
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Activity className="h-4 w-4 text-orange-500" />
              Activity Rings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Move</span>
              <span>
                {Math.round(data.activity.activeEnergy)} /{" "}
                {data.activity.activeEnergyGoal ?? 500} kcal
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Exercise</span>
              <span>
                {data.activity.exerciseMinutes} /{" "}
                {data.activity.exerciseGoal ?? 30} min
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Stand</span>
              <span>
                {data.activity.standHours} / {data.activity.standGoal ?? 12} hr
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
