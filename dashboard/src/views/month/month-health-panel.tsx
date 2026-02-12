"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard, StatGrid } from "@/components/charts/stat-card";
import { LineChart } from "@/components/charts/line-chart";
import { BarChart } from "@/components/charts/bar-chart";
import { chart } from "@/lib/palette";
import type { MonthHealthData } from "@/models/month-view";
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

export interface MonthHealthPanelProps {
  data: MonthHealthData;
}

/** Format number with K suffix for thousands */
const formatNumber = (value: number): string => {
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
  const mins = Math.round(minutes % 60);
  return mins > 0 ? `${hours}小时${mins}分` : `${hours}小时`;
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

export function MonthHealthPanel({ data }: MonthHealthPanelProps) {
  const { steps, heartRate, sleep, activity, workouts } = data;

  return (
    <div className="space-y-4">
      {/* Summary Stats Grid */}
      <StatGrid columns={4}>
        <StatCard
          title="总步数"
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
          subtitle={sleep ? `共 ${sleep.totalHours.toFixed(0)} 小时` : undefined}
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
          value={activity ? `${activity.totalStandHours}` : "-"}
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

      {/* Charts Row */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Daily Steps Chart */}
        {steps && steps.dailySteps.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Footprints className="h-4 w-4 text-green-500" aria-hidden="true" />
                每日步数
              </CardTitle>
            </CardHeader>
            <CardContent>
              <LineChart
                data={toChartData(steps.dailySteps)}
                height={180}
                color={chart.primary}
                valueFormatter={formatNumber}
                referenceLine={steps.avgSteps}
                referenceLineLabel="平均"
              />
            </CardContent>
          </Card>
        )}

        {/* Daily Heart Rate Chart */}
        {heartRate && heartRate.dailyAvg.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Heart className="h-4 w-4 text-red-500" aria-hidden="true" />
                每日心率
              </CardTitle>
            </CardHeader>
            <CardContent>
              <LineChart
                series={[
                  {
                    data: toChartData(heartRate.dailyAvg),
                    color: chart.primary,
                    name: "平均心率",
                  },
                  {
                    data: toChartData(heartRate.dailyResting),
                    color: chart.sky,
                    name: "静息心率",
                  },
                ]}
                height={180}
                valueFormatter={(v) => `${Math.round(v)} bpm`}
              />
            </CardContent>
          </Card>
        )}

        {/* Daily Sleep Chart */}
        {sleep && sleep.dailyDuration.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Moon className="h-4 w-4 text-indigo-500" aria-hidden="true" />
                每日睡眠
              </CardTitle>
            </CardHeader>
            <CardContent>
              <BarChart
                data={toChartData(sleep.dailyDuration)}
                height={180}
                color={chart.teal}
                valueFormatter={(v) => `${v.toFixed(1)}小时`}
              />
            </CardContent>
          </Card>
        )}

        {/* Daily Active Energy Chart */}
        {activity && activity.dailyActiveEnergy.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Flame className="h-4 w-4 text-orange-500" aria-hidden="true" />
                每日活动能量
              </CardTitle>
            </CardHeader>
            <CardContent>
              <LineChart
                data={toChartData(activity.dailyActiveEnergy)}
                height={180}
                color={chart.jade}
                valueFormatter={(v) => `${Math.round(v)} kcal`}
                referenceLine={activity.avgActiveEnergy}
                referenceLineLabel="平均"
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
              <Dumbbell className="h-4 w-4 text-purple-500" aria-hidden="true" />
              锻炼类型分布
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart
              data={workouts.byType.map((w) => ({
                label: w.typeName,
                value: w.count,
              }))}
              height={180}
              horizontal
              color={chart.green}
              valueFormatter={(v) => `${v}次`}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
