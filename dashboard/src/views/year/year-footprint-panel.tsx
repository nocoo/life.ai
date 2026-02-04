"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard, StatGrid } from "@/components/charts/stat-card";
import { BarChart } from "@/components/charts/bar-chart";
import { DonutChart } from "@/components/charts/pie-chart";
import { HeatmapCalendar } from "@/components/charts/heatmap-calendar";
import type { YearFootprintData } from "@/models/year-view";
import {
  MapPin,
  Route,
  Gauge,
  Calendar,
  Car,
  Bike,
  PersonStanding,
  CircleDot,
} from "lucide-react";

export interface YearFootprintPanelProps {
  data: YearFootprintData;
  year: number;
}

/** Format distance in meters */
const formatDistance = (meters: number): string => {
  if (meters < 1000) {
    return `${Math.round(meters)} 米`;
  }
  if (meters >= 1000000) {
    return `${(meters / 1000).toFixed(0)} 公里`;
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

/** Convert MonthlyDataPoint to chart format */
const toMonthlyChartData = (
  data: { month: string; value: number }[]
): { label: string; value: number }[] => {
  return data.map((d) => ({
    label: d.month.split("-")[1], // Extract month number MM from YYYY-MM
    value: d.value,
  }));
};

/** Convert DailyDataPoint to heatmap format */
const toHeatmapData = (
  data: { date: string; value: number }[]
): { date: string; value: number }[] => {
  return data.map((d) => ({
    date: d.date,
    value: d.value,
  }));
};

export function YearFootprintPanel({ data, year }: YearFootprintPanelProps) {
  const {
    totalDistance,
    totalTrackPoints,
    avgSpeed,
    daysWithData,
    daysInYear,
    byTransportMode,
    monthlyDistance,
    dailyDistance,
  } = data;

  const avgDailyDistance = daysWithData > 0 ? totalDistance / daysWithData : 0;

  return (
    <div className="space-y-6">
      {/* Summary Stats Grid */}
      <StatGrid columns={4}>
        <StatCard
          title="年度总距离"
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
          value={`${daysWithData} / ${daysInYear}`}
          subtitle={`${((daysWithData / daysInYear) * 100).toFixed(0)}% 覆盖率`}
          icon={Calendar}
          iconColor="text-purple-500"
        />
      </StatGrid>

      {/* Distance Heatmap */}
      {dailyDistance.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Route className="h-4 w-4 text-blue-500" />
              年度距离分布
            </CardTitle>
          </CardHeader>
          <CardContent>
            <HeatmapCalendar
              data={toHeatmapData(dailyDistance)}
              year={year}
              metricLabel="距离"
              valueFormatter={formatDistance}
              colorScale={[
                "hsl(var(--muted))",
                "hsl(210, 80%, 80%)",
                "hsl(210, 80%, 60%)",
                "hsl(210, 80%, 40%)",
                "hsl(210, 80%, 25%)",
              ]}
            />
          </CardContent>
        </Card>
      )}

      {/* Charts Row */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Monthly Distance Chart */}
        {monthlyDistance.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Route className="h-4 w-4 text-blue-500" />
                月度距离趋势
              </CardTitle>
            </CardHeader>
            <CardContent>
              <BarChart
                data={toMonthlyChartData(monthlyDistance)}
                height={200}
                color="hsl(var(--chart-1))"
                valueFormatter={formatDistance}
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
                年度出行方式分布
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
                valueFormatter={formatDistance}
              />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Transport Mode Details */}
      {byTransportMode.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">年度出行方式详情</CardTitle>
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
              <Route className="h-4 w-4 text-indigo-500" />
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
              valueFormatter={formatDistance}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
