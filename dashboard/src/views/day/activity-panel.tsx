"use client";

import { useMemo, useEffect, useState } from "react";
import { MapPin, Dumbbell, Wallet, Route } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Map as LeafletMap,
  MapTileLayer,
  MapPolyline,
  MapZoomControl,
} from "@/components/ui/map";
import { useMap } from "react-leaflet";
import type { LatLngExpression, LatLngBoundsExpression } from "leaflet";
import type { DayFootprintData, TrackPoint } from "@/models/footprint";
import type { DayPixiuData } from "@/models/pixiu";
import type { WorkoutRecord } from "@/models/apple-health";

export interface ActivityPanelProps {
  footprint: DayFootprintData;
  pixiu: DayPixiuData;
  workouts: WorkoutRecord[];
}

/** Format distance */
const formatDistance = (meters: number): string => {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  return `${Math.round(meters)} m`;
};

/** Format duration */
const formatDuration = (minutes: number): string => {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${minutes}m`;
};

/** Format time from ISO datetime */
const formatTime = (datetime: string): string => {
  const match = datetime.match(/T(\d{2}:\d{2})/);
  return match ? match[1] : datetime;
};

/** Convert track points to Leaflet coordinates */
const trackPointsToPositions = (points: TrackPoint[]): LatLngExpression[] => {
  return points.map((p) => [p.lat, p.lon] as LatLngExpression);
};

/** Calculate bounds from track points */
const calculateBounds = (points: TrackPoint[]): LatLngBoundsExpression | null => {
  if (points.length === 0) return null;
  
  let minLat = points[0].lat;
  let maxLat = points[0].lat;
  let minLon = points[0].lon;
  let maxLon = points[0].lon;
  
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  }
  
  return [[minLat, minLon], [maxLat, maxLon]];
};

/** Calculate center from track points */
const calculateCenter = (points: TrackPoint[]): LatLngExpression => {
  if (points.length === 0) return [39.9042, 116.4074]; // Beijing default
  
  const sum = points.reduce(
    (acc, p) => ({ lat: acc.lat + p.lat, lon: acc.lon + p.lon }),
    { lat: 0, lon: 0 }
  );
  
  return [sum.lat / points.length, sum.lon / points.length];
};

/** Component to fit map bounds after mount */
function FitBounds({ bounds }: { bounds: LatLngBoundsExpression }) {
  const map = useMap();
  const [fitted, setFitted] = useState(false);
  
  useEffect(() => {
    if (!fitted && bounds) {
      // Use setTimeout to ensure the map container is fully rendered
      const timer = setTimeout(() => {
        map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
        setFitted(true);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [map, bounds, fitted]);
  
  return null;
}

/** Track Map Card - Displays daily movement trajectory
 * No padding or title, just a clean map with 4:3 aspect ratio
 */
export function TrackMapCard({ trackPoints, className }: { trackPoints: TrackPoint[]; className?: string }) {
  const positions = useMemo(() => trackPointsToPositions(trackPoints), [trackPoints]);
  const center = useMemo(() => calculateCenter(trackPoints), [trackPoints]);
  const bounds = useMemo(() => calculateBounds(trackPoints), [trackPoints]);
  
  if (trackPoints.length === 0) {
    return null;
  }

  return (
    <Card className={`min-w-0 overflow-hidden p-0 ${className ?? ""}`}>
      {/* 16:9 aspect ratio container for better space utilization */}
      <div className="aspect-video w-full">
        <LeafletMap 
          center={center} 
          zoom={12}
          className="h-full w-full rounded-lg"
        >
          <MapTileLayer />
          <MapZoomControl position="top-1 right-1" />
          {bounds && <FitBounds bounds={bounds} />}
          <MapPolyline 
            positions={positions}
            className="fill-none stroke-blue-500 stroke-2"
          />
        </LeafletMap>
      </div>
    </Card>
  );
}

export function ActivityPanel({
  footprint,
  pixiu,
  workouts,
}: ActivityPanelProps) {
  return (
    <>
      {/* Workouts Card */}
      {workouts.length > 0 && (
        <Card className="min-w-0 overflow-hidden">
          <CardHeader className="py-2 px-3">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Dumbbell className="h-4 w-4 text-green-500" aria-hidden="true" />
              运动
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 px-3 pb-3 pt-0">
            {workouts.map((workout, i) => (
              <div key={workout.id}>
                {i > 0 && <Separator className="my-2" />}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm truncate">{workout.typeName}</span>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 flex-shrink-0 tabular-nums">
                      {formatTime(workout.start)} - {formatTime(workout.end)}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div>
                      <p className="text-[10px] text-muted-foreground">时长</p>
                      <p className="font-medium tabular-nums">
                        {formatDuration(workout.duration)}
                      </p>
                    </div>
                    {workout.distance && (
                      <div>
                        <p className="text-[10px] text-muted-foreground">距离</p>
                        <p className="font-medium tabular-nums">
                          {formatDistance(workout.distance)}
                        </p>
                      </div>
                    )}
                    {workout.calories && (
                      <div>
                        <p className="text-[10px] text-muted-foreground">消耗</p>
                        <p className="font-medium tabular-nums">{workout.calories} 千卡</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Locations Card */}
      {footprint.locations.length > 0 && (
        <Card className="min-w-0 overflow-hidden">
          <CardHeader className="py-2 px-3">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <MapPin className="h-4 w-4 text-blue-500" aria-hidden="true" />
              地点
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 px-3 pb-3 pt-0">
            {footprint.locations
              .filter((loc) => loc.name !== "Commute")
              .map((loc) => (
                <div
                  key={loc.id}
                  className="flex items-center justify-between text-xs gap-2"
                >
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <div className="h-1.5 w-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                    <span className="truncate">{loc.name}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap flex-shrink-0 tabular-nums">
                    {loc.startTime} - {loc.endTime}
                  </span>
                </div>
              ))}
          </CardContent>
        </Card>
      )}

      {/* Track Summary Card */}
      {footprint.summary && (
        <Card className="min-w-0 overflow-hidden">
          <CardHeader className="py-2 px-3">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Route className="h-4 w-4 text-cyan-500" aria-hidden="true" />
              移动
              <span className="ml-auto text-base font-semibold text-cyan-500 tabular-nums">
                {formatDistance(footprint.summary.totalDistance)}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 px-3 pb-3 pt-0">
            {/* Bar Chart - Speed distribution from track points */}
            {(() => {
              // Group track points by hour and calculate average speed
              const hourlySpeed = new Map<number, { totalSpeed: number; count: number }>();
              footprint.trackPoints.forEach((p) => {
                if (p.speed !== undefined && p.speed >= 0) {
                  const hour = parseInt(p.ts.match(/T(\d{2}):/)?.[1] ?? "0", 10);
                  const existing = hourlySpeed.get(hour) || { totalSpeed: 0, count: 0 };
                  hourlySpeed.set(hour, {
                    totalSpeed: existing.totalSpeed + p.speed,
                    count: existing.count + 1,
                  });
                }
              });
              
              if (hourlySpeed.size === 0) {
                // No speed data, show placeholder
                return (
                  <div className="flex h-5 w-full items-end gap-px">
                    <div className="flex-1 rounded-sm bg-muted h-full" />
                  </div>
                );
              }

              const sortedHours = Array.from(hourlySpeed.entries()).sort((a, b) => a[0] - b[0]);
              const minHour = sortedHours[0][0];
              const maxHour = sortedHours[sortedHours.length - 1][0];
              
              // Calculate average speeds and find max
              const bars: { hour: number; avgSpeed: number }[] = [];
              for (let h = minHour; h <= maxHour; h++) {
                const data = hourlySpeed.get(h);
                bars.push({
                  hour: h,
                  avgSpeed: data ? data.totalSpeed / data.count : 0,
                });
              }
              const maxSpeed = Math.max(...bars.map((b) => b.avgSpeed));

              return (
                <div className="flex h-5 w-full items-end gap-px">
                  {bars.map((bar, i) => {
                    const height = maxSpeed > 0 ? (bar.avgSpeed / maxSpeed) * 100 : 0;
                    return (
                      <div
                        key={i}
                        className={`flex-1 rounded-sm ${bar.avgSpeed > 0 ? "bg-cyan-500" : "bg-muted"}`}
                        style={{ height: bar.avgSpeed > 0 ? `${Math.max(height, 10)}%` : "100%" }}
                        title={bar.avgSpeed > 0 ? `${bar.hour}:00 - ${(bar.avgSpeed * 3.6).toFixed(1)} km/h` : `${bar.hour}:00 - 无数据`}
                      />
                    );
                  })}
                </div>
              );
            })()}

            {/* Stats Row */}
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div>
                <p className="text-[10px] text-muted-foreground">距离</p>
                <p className="font-medium tabular-nums">{formatDistance(footprint.summary.totalDistance)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">速度</p>
                <p className="font-medium tabular-nums">{(footprint.summary.avgSpeed * 3.6).toFixed(1)} km/h</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">轨迹点</p>
                <p className="font-medium tabular-nums">{footprint.summary.pointCount.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Transactions Card */}
      {pixiu.transactions.length > 0 && (
        <Card className="min-w-0 overflow-hidden">
          <CardHeader className="py-2 px-3">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Wallet className="h-4 w-4 text-green-500" aria-hidden="true" />
              交易
              <span className="ml-auto text-base font-semibold text-green-500 tabular-nums">
                ¥{pixiu.summary?.expense.toFixed(0) ?? 0}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 px-3 pb-3 pt-0">
            {/* Bar Chart - Category breakdown as horizontal segments */}
            {(() => {
              const categories = pixiu.expenseByCategory.slice(0, 6);
              const totalExpense = pixiu.summary?.expense ?? 0;
              
              if (categories.length === 0 || totalExpense === 0) {
                return (
                  <div className="flex h-5 w-full items-end gap-px">
                    <div className="flex-1 rounded-sm bg-muted h-full" />
                  </div>
                );
              }

              // Color palette for expense categories (green spectrum)
              const colors = [
                "bg-green-600",
                "bg-green-500",
                "bg-green-400",
                "bg-emerald-500",
                "bg-emerald-400",
                "bg-teal-500",
              ];

              return (
                <div className="flex h-5 w-full gap-px rounded-sm overflow-hidden">
                  {categories.map((cat, i) => {
                    const width = (cat.amount / totalExpense) * 100;
                    return (
                      <div
                        key={cat.category}
                        className={`${colors[i % colors.length]} rounded-sm`}
                        style={{ width: `${width}%`, minWidth: width > 0 ? "4px" : "0" }}
                        title={`${cat.category}: ¥${cat.amount.toFixed(2)} (${cat.percentage.toFixed(0)}%)`}
                      />
                    );
                  })}
                </div>
              );
            })()}

            {/* Stats Row */}
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div>
                <p className="text-[10px] text-muted-foreground">支出</p>
                <p className="font-medium text-green-500 tabular-nums">
                  ¥{pixiu.summary?.expense.toFixed(0) ?? 0}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">收入</p>
                <p className="font-medium text-red-500 tabular-nums">
                  ¥{pixiu.summary?.income.toFixed(0) ?? 0}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">笔数</p>
                <p className="font-medium tabular-nums">{pixiu.transactions.length}</p>
              </div>
            </div>

            {/* Transaction List */}
            <Separator />
            <div className="space-y-1">
              {pixiu.transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between text-xs gap-2"
                >
                  <div className="flex-1 min-w-0">
                    <span className="truncate">{tx.categoryL2}</span>
                    {tx.note && (
                      <p className="text-[10px] text-muted-foreground truncate">
                        {tx.note}
                      </p>
                    )}
                  </div>
                  <span
                    className={`whitespace-nowrap flex-shrink-0 font-medium tabular-nums ${
                      tx.isIncome ? "text-red-500" : "text-green-500"
                    }`}
                  >
                    {tx.isIncome ? "+" : "-"}¥{tx.amount.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
