"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard, StatGrid } from "@/components/charts/stat-card";
import { LineChart } from "@/components/charts/line-chart";
import { BarChart } from "@/components/charts/bar-chart";
import { DonutChart } from "@/components/charts/pie-chart";
import type { MonthFootprintData } from "@/models/month-view";
import {
  MapPin,
  Route,
  Gauge,
  Calendar,
  Car,
  Bike,
  PersonStanding,
  CircleDot,
  BarChart3,
} from "lucide-react";

export interface MonthFootprintPanelProps {
  data: MonthFootprintData;
}

/** Format distance in meters */
const formatDistance = (meters: number): string => {
  if (meters < 1000) {
    return `${Math.round(meters)} 米`;
  }
  return `${(meters / 1000).toFixed(1)} 公里`;
};

/** Format speed in m/s to km/h */
const formatSpeed = (mps: number): string => {
  const kmh = mps * 3.6;
  return `${kmh.toFixed(1)} km/h`;
};

/** Get icon for transport mode */
const getTransportIcon = (mode: string) => {
  switch (mode) {
    case "driving":
      return Car;
    case "cycling":
      return Bike;
    case "walking":
      return PersonStanding;
    default:
      return CircleDot;
  }
};

/** Convert DailyDataPoint to chart format */
const toChartData = (
  data: { date: string; value: number }[]
): { label: string; value: number }[] => {
  return data.map((d) => ({
    label: d.date.split("-")[2], // Extract day from YYYY-MM-DD
    value: d.value,
  }));
};

export function MonthFootprintPanel({ data }: MonthFootprintPanelProps) {
  const {
    totalDistance,
    totalTrackPoints,
    avgSpeed,
    daysWithData,
    daysInMonth,
    byTransportMode,
    dailyDistance,
  } = data;

  const avgDailyDistance = daysWithData > 0 ? totalDistance / daysWithData : 0;

  return (
    <div className="space-y-6">
      {/* Summary Stats Grid */}
      <StatGrid columns={4}>
        <StatCard
          title="总距离"
          value={formatDistance(totalDistance)}
          subtitle={`日均 ${formatDistance(avgDailyDistance)}`}
          icon={Route}
          iconColor="text-blue-500"
        />
        <StatCard
          title="轨迹点数"
          value={totalTrackPoints.toLocaleString()}
          subtitle="GPS 记录点"
          icon={MapPin}
          iconColor="text-green-500"
        />
        <StatCard
          title="平均速度"
          value={formatSpeed(avgSpeed)}
          icon={Gauge}
          iconColor="text-orange-500"
        />
        <StatCard
          title="记录天数"
          value={`${daysWithData} / ${daysInMonth}`}
          subtitle={`${((daysWithData / daysInMonth) * 100).toFixed(0)}% 覆盖率`}
          icon={Calendar}
          iconColor="text-purple-500"
        />
      </StatGrid>

      {/* Charts Row */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Daily Distance Chart */}
        {dailyDistance.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Route className="h-4 w-4 text-blue-500" />
                每日距离
              </CardTitle>
            </CardHeader>
            <CardContent>
              <LineChart
                data={toChartData(dailyDistance)}
                height={200}
                color="hsl(var(--chart-1))"
                valueFormatter={(v) => formatDistance(v)}
                referenceLine={avgDailyDistance}
                referenceLineLabel="平均"
              />
            </CardContent>
          </Card>
        )}

        {/* Transport Mode Breakdown */}
        {byTransportMode.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Car className="h-4 w-4 text-cyan-500" />
                出行方式分布
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DonutChart
                data={byTransportMode.map((m) => ({
                  label: m.modeName,
                  value: m.totalDistance,
                }))}
                height={200}
                showLegend
                valueFormatter={(v) => formatDistance(v)}
              />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Transport Mode Details */}
      {byTransportMode.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">出行方式详情</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {byTransportMode.map((mode) => {
                const Icon = getTransportIcon(mode.mode);
                return (
                  <div
                    key={mode.mode}
                    className="flex items-center gap-3 rounded-lg border p-3"
                  >
                    <div className="rounded-md bg-muted p-2">
                      <Icon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {mode.modeName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistance(mode.totalDistance)} · {mode.percentage.toFixed(0)}%
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Distance by Transport Mode Bar Chart */}
      {byTransportMode.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-indigo-500" />
              各出行方式距离
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart
              data={byTransportMode.map((m) => ({
                label: m.modeName,
                value: m.totalDistance,
              }))}
              height={200}
              horizontal
              color="hsl(var(--chart-2))"
              valueFormatter={(v) => formatDistance(v)}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
