"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard, StatGrid } from "@/components/charts/stat-card";
import { LineChart } from "@/components/charts/line-chart";
import { BarChart } from "@/components/charts/bar-chart";
import { HeatmapCalendar, heatmapColorScales } from "@/components/charts/heatmap-calendar";
import type { YearHealthData } from "@/models/year-view";
import {
  Footprints,
  Heart,
  Moon,
  Flame,
  Timer,
  Activity,
  TrendingUp,
  Dumbbell,
} from "lucide-react";

export interface YearHealthPanelProps {
  data: YearHealthData;
  year: number;
}

/** Format number with K suffix for thousands */
const formatNumber = (value: number): string => {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 10000) {
    return `${(value / 1000).toFixed(1)}k`;
  }
  return value.toLocaleString();
};

/** Format duration in minutes to human readable */
const formatDuration = (minutes: number): string => {
  if (minutes < 60) {
    return `${Math.round(minutes)}分钟`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const mins = Math.round(minutes % 60);
    return mins > 0 ? `${hours}小时${mins}分` : `${hours}小时`;
  }
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days}天${remainingHours}小时` : `${days}天`;
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

export function YearHealthPanel({ data, year }: YearHealthPanelProps) {
  const { steps, heartRate, sleep, activity, workouts } = data;

  return (
    <div className="space-y-6">
      {/* Summary Stats Grid */}
      <StatGrid columns={4}>
        <StatCard
          title="年度总步数"
          value={formatNumber(steps?.totalSteps ?? 0)}
          subtitle={steps ? `日均 ${formatNumber(steps.avgSteps)} 步` : undefined}
          icon={Footprints}
          iconColor="text-green-500"
        />
        <StatCard
          title="平均心率"
          value={heartRate ? `${Math.round(heartRate.avgHeartRate)}` : "-"}
          subtitle={heartRate ? `静息 ${Math.round(heartRate.avgRestingHeartRate)} bpm` : undefined}
          icon={Heart}
          iconColor="text-red-500"
        />
        <StatCard
          title="平均睡眠"
          value={sleep ? `${sleep.avgDuration.toFixed(1)}小时` : "-"}
          subtitle={sleep ? `共 ${Math.round(sleep.totalHours)} 小时` : undefined}
          icon={Moon}
          iconColor="text-indigo-500"
        />
        <StatCard
          title="活动能量"
          value={activity ? formatNumber(Math.round(activity.totalActiveEnergy)) : "-"}
          subtitle={activity ? `日均 ${Math.round(activity.avgActiveEnergy)} 千卡` : undefined}
          icon={Flame}
          iconColor="text-orange-500"
        />
      </StatGrid>

      {/* Second row stats */}
      <StatGrid columns={4}>
        <StatCard
          title="运动时长"
          value={activity ? formatDuration(activity.totalExerciseMinutes) : "-"}
          subtitle={activity ? `日均 ${Math.round(activity.avgExerciseMinutes)} 分钟` : undefined}
          icon={Timer}
          iconColor="text-blue-500"
        />
        <StatCard
          title="站立小时"
          value={activity ? formatNumber(activity.totalStandHours) : "-"}
          subtitle={activity ? `日均 ${activity.avgStandHours.toFixed(1)} 小时` : undefined}
          icon={Activity}
          iconColor="text-cyan-500"
        />
        <StatCard
          title="三圈达成"
          value={activity?.ringCloseCount?.all ?? 0}
          subtitle={`运动${activity?.ringCloseCount?.move ?? 0} / 锻炼${activity?.ringCloseCount?.exercise ?? 0} / 站立${activity?.ringCloseCount?.stand ?? 0}`}
          icon={TrendingUp}
          iconColor="text-emerald-500"
        />
        <StatCard
          title="锻炼次数"
          value={workouts?.totalWorkouts ?? 0}
          subtitle={workouts ? formatDuration(workouts.totalDuration) : undefined}
          icon={Dumbbell}
          iconColor="text-purple-500"
        />
      </StatGrid>

      {/* Steps Heatmap */}
      {steps && steps.dailySteps.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Footprints className="h-4 w-4 text-green-500" />
              年度步数分布
            </CardTitle>
          </CardHeader>
          <CardContent>
            <HeatmapCalendar
              data={toHeatmapData(steps.dailySteps)}
              year={year}
              metricLabel="步数"
              valueFormatter={formatNumber}
            />
          </CardContent>
        </Card>
      )}

      {/* Monthly Trends Row */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Monthly Steps Chart */}
        {steps && steps.monthlySteps.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Footprints className="h-4 w-4 text-green-500" />
                月度步数趋势
              </CardTitle>
            </CardHeader>
            <CardContent>
              <BarChart
                data={toMonthlyChartData(steps.monthlySteps)}
                height={200}
                color="hsl(var(--chart-1))"
                valueFormatter={formatNumber}
              />
            </CardContent>
          </Card>
        )}

        {/* Monthly Heart Rate Chart */}
        {heartRate && heartRate.monthlyAvg.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Heart className="h-4 w-4 text-red-500" />
                月度心率趋势
              </CardTitle>
            </CardHeader>
            <CardContent>
              <LineChart
                series={[
                  {
                    data: toMonthlyChartData(heartRate.monthlyAvg),
                    color: "hsl(var(--chart-1))",
                    name: "平均心率",
                  },
                  {
                    data: toMonthlyChartData(heartRate.monthlyResting),
                    color: "hsl(var(--chart-2))",
                    name: "静息心率",
                  },
                ]}
                height={200}
                valueFormatter={(v) => `${Math.round(v)} bpm`}
              />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Activity Heatmap */}
      {activity && activity.dailyActiveEnergy.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Flame className="h-4 w-4 text-orange-500" />
              年度活动能量分布
            </CardTitle>
          </CardHeader>
          <CardContent>
            <HeatmapCalendar
              data={toHeatmapData(activity.dailyActiveEnergy)}
              year={year}
              metricLabel="活动能量"
              valueFormatter={(v) => `${Math.round(v)} kcal`}
              colorScale={heatmapColorScales.orange}
            />
          </CardContent>
        </Card>
      )}

      {/* Monthly Activity Charts */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Monthly Active Energy Chart */}
        {activity && activity.monthlyActiveEnergy.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Flame className="h-4 w-4 text-orange-500" />
                月度活动能量
              </CardTitle>
            </CardHeader>
            <CardContent>
              <BarChart
                data={toMonthlyChartData(activity.monthlyActiveEnergy)}
                height={200}
                color="hsl(var(--chart-4))"
                valueFormatter={(v) => `${formatNumber(Math.round(v))} kcal`}
              />
            </CardContent>
          </Card>
        )}

        {/* Monthly Exercise Minutes Chart */}
        {activity && activity.monthlyExerciseMinutes.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Timer className="h-4 w-4 text-blue-500" />
                月度运动时长
              </CardTitle>
            </CardHeader>
            <CardContent>
              <BarChart
                data={toMonthlyChartData(activity.monthlyExerciseMinutes)}
                height={200}
                color="hsl(var(--chart-2))"
                valueFormatter={(v) => formatDuration(v)}
              />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Workout Breakdown */}
      {workouts && workouts.byType.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Dumbbell className="h-4 w-4 text-purple-500" />
              年度锻炼类型分布
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart
              data={workouts.byType.map((w) => ({
                label: w.typeName,
                value: w.count,
              }))}
              height={250}
              horizontal
              color="hsl(var(--chart-5))"
              valueFormatter={(v) => `${v}次`}
            />
          </CardContent>
        </Card>
      )}

      {/* Monthly Workout Trends */}
      {workouts && workouts.monthlyWorkouts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Dumbbell className="h-4 w-4 text-purple-500" />
              月度锻炼次数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <LineChart
              data={toMonthlyChartData(workouts.monthlyWorkouts)}
              height={200}
              color="hsl(var(--chart-3))"
              valueFormatter={(v) => `${v}次`}
              showDots
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
