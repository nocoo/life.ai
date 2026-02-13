"use client";

import { StatCard, StatGrid } from "@/components/charts/stat-card";
import { BarChart } from "@/components/charts/bar-chart";
import { DonutChart } from "@/components/charts/pie-chart";
import { HeatmapCalendar, heatmapColorScales } from "@/components/charts/heatmap-calendar";
import { chart } from "@/lib/palette";
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
    <div className="space-y-4">
      {/* Summary Stats Grid */}
      <StatGrid columns={4}>
        <StatCard
          title="年度总距离"
          value={formatDistance(totalDistance)}
          subtitle={`日均 ${formatDistance(avgDailyDistance)}`}
          icon={Route}
        />
        <StatCard
          title="轨迹点数"
          value={totalTrackPoints.toLocaleString()}
          subtitle="GPS 记录点"
          icon={MapPin}
        />
        <StatCard
          title="平均速度"
          value={formatSpeed(avgSpeed)}
          icon={Gauge}
        />
        <StatCard
          title="记录天数"
          value={`${daysWithData} / ${daysInYear}`}
          subtitle={`${((daysWithData / daysInYear) * 100).toFixed(0)}% 覆盖率`}
          icon={Calendar}
        />
      </StatGrid>

      {/* Distance Heatmap */}
      {dailyDistance.length > 0 && (
        <div className="rounded-card bg-secondary p-4">
          <div className="flex items-center gap-2 text-sm font-normal text-muted-foreground mb-3">
            <Route className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
            年度距离分布
          </div>
            <HeatmapCalendar
              data={toHeatmapData(dailyDistance)}
              year={year}
              metricLabel="距离"
              valueFormatter={formatDistance}
              colorScale={heatmapColorScales.blue}
            />
        </div>
      )}

      {/* Charts Row */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Monthly Distance Chart */}
        {monthlyDistance.length > 0 && (
          <div className="rounded-card bg-secondary p-4">
            <div className="flex items-center gap-2 text-sm font-normal text-muted-foreground mb-3">
              <Route className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
              月度距离趋势
            </div>
              <BarChart
                data={toMonthlyChartData(monthlyDistance)}
                height={180}
                color={chart.primary}
                valueFormatter={formatDistance}
              />
          </div>
        )}

        {/* Transport Mode Breakdown */}
        {byTransportMode.length > 0 && (
          <div className="rounded-card bg-secondary p-4">
            <div className="flex items-center gap-2 text-sm font-normal text-muted-foreground mb-3">
              <Car className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
              年度出行方式分布
            </div>
              <DonutChart
                data={byTransportMode.map((m) => ({
                  label: m.modeName,
                  value: m.totalDistance,
                }))}
                height={180}
                showLegend
                valueFormatter={formatDistance}
              />
          </div>
        )}
      </div>

      {/* Transport Mode Details */}
      {byTransportMode.length > 0 && (
        <div className="rounded-card bg-secondary p-4">
          <div className="text-sm font-normal text-muted-foreground mb-3">年度出行方式详情</div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {byTransportMode.map((mode) => {
                const Icon = getTransportIcon(mode.mode);
                return (
                  <div
                    key={mode.mode}
                    className="flex items-center gap-2.5 rounded-widget bg-card p-2.5"
                  >
                    <div className="rounded-md bg-muted p-1.5">
                      <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">
                        {mode.modeName}
                      </p>
                      <p className="text-[10px] text-muted-foreground tabular-nums">
                        {formatDistance(mode.totalDistance)} · {mode.percentage.toFixed(0)}%
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
        </div>
      )}

      {/* Distance by Transport Mode Bar Chart */}
      {byTransportMode.length > 0 && (
        <div className="rounded-card bg-secondary p-4">
          <div className="flex items-center gap-2 text-sm font-normal text-muted-foreground mb-3">
            <Route className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
            各出行方式距离
          </div>
            <BarChart
              data={byTransportMode.map((m) => ({
                label: m.modeName,
                value: m.totalDistance,
              }))}
              height={180}
              horizontal
              color={chart.sky}
              valueFormatter={formatDistance}
            />
        </div>
      )}
    </div>
  );
}
