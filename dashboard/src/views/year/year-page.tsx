"use client";

import { useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useYearStore } from "@/viewmodels/year-store";
import { YearNavigation } from "./year-navigation";
import { StatCard, StatGrid } from "@/components/charts/stat-card";
import { LineChart } from "@/components/charts/line-chart";
import { BarChart } from "@/components/charts/bar-chart";
import { DonutChart } from "@/components/charts/pie-chart";
import { HeatmapCalendar, heatmapColorScales } from "@/components/charts/heatmap-calendar";
import { chartColors } from "@/lib/chart-colors";
import {
  Footprints,
  Heart,
  Route,
  Wallet,
  Moon,
  Flame,
  Activity,
  Dumbbell,
  Car,
  CreditCard,
  ArrowDownCircle,
  ArrowUpCircle,
  TrendingDown,
  Calendar,
} from "lucide-react";

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {/* Stats skeleton */}
      <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-4 px-3 pb-3">
              <Skeleton className="h-3 w-20 mb-1.5" />
              <Skeleton className="h-6 w-28" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Heatmap skeleton */}
      <Card>
        <CardHeader className="py-2 px-3">
          <Skeleton className="h-4 w-28" />
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <Skeleton className="h-28 w-full" />
        </CardContent>
      </Card>

      {/* Charts skeleton */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="py-2 px-3">
              <Skeleton className="h-4 w-28" />
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <Skeleton className="h-40 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ErrorDisplay({ message }: { message: string }) {
  return (
    <div className="flex h-[400px] items-center justify-center">
      <div className="text-center">
        <p className="text-lg font-medium text-destructive">错误</p>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

/** Format number with K/M suffix */
const formatNumber = (value: number): string => {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 10000) {
    return `${(value / 1000).toFixed(1)}k`;
  }
  return value.toLocaleString();
};

/** Format currency compact */
const formatCurrency = (value: number): string => {
  const absValue = Math.abs(value);
  const prefix = value < 0 ? "-" : "";
  if (absValue >= 10000) {
    return `${prefix}¥${(absValue / 10000).toFixed(1)}万`;
  }
  return `${prefix}¥${absValue.toFixed(0)}`;
};

/** Format distance */
const formatDistance = (meters: number): string => {
  if (meters < 1000) {
    return `${Math.round(meters)} 米`;
  }
  if (meters >= 1000000) {
    return `${(meters / 1000).toFixed(0)} 公里`;
  }
  return `${(meters / 1000).toFixed(1)} 公里`;
};

/** Format duration in minutes */
const formatDuration = (minutes: number): string => {
  if (minutes < 60) {
    return `${Math.round(minutes)}分钟`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}小时`;
  }
  const days = Math.floor(hours / 24);
  return `${days}天`;
};

/** Convert MonthlyDataPoint to chart format */
const toMonthlyChartData = (
  data: { month: string; value: number }[]
): { label: string; value: number }[] => {
  return data.map((d) => ({
    label: d.month.split("-")[1],
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

function YearContent() {
  const { data, selectedYear } = useYearStore();

  if (!data) return null;

  const { summary, health, footprint, pixiu } = data;
  const { steps, heartRate, activity, workouts } = health;

  return (
    <div className="space-y-6">
      {/* ===== Section 1: Overview Stats ===== */}
      <section>
        <h2 className="text-sm font-medium text-muted-foreground mb-2">年度总览</h2>
        <StatGrid columns={4}>
          <StatCard
            title="总步数"
            value={formatNumber(summary.totalSteps)}
            subtitle={steps ? `日均 ${formatNumber(steps.avgSteps)}` : undefined}
            icon={Footprints}
            iconColor="text-green-500"
          />
          <StatCard
            title="平均心率"
            value={summary.avgHeartRate ? `${Math.round(summary.avgHeartRate)} bpm` : "-"}
            subtitle={heartRate ? `静息 ${Math.round(heartRate.avgRestingHeartRate)}` : undefined}
            icon={Heart}
            iconColor="text-red-500"
          />
          <StatCard
            title="移动距离"
            value={summary.totalDistance ? formatDistance(summary.totalDistance) : "-"}
            subtitle={`${summary.daysWithTracking} 天记录`}
            icon={Route}
            iconColor="text-blue-500"
          />
          <StatCard
            title="净收支"
            value={formatCurrency(summary.totalNet)}
            subtitle={`${summary.transactionCount} 笔交易`}
            icon={Wallet}
            iconColor={summary.totalNet >= 0 ? "text-emerald-500" : "text-orange-500"}
          />
        </StatGrid>

        <div className="mt-2">
          <StatGrid columns={4}>
            <StatCard
              title="平均睡眠"
              value={summary.avgSleepHours ? `${summary.avgSleepHours.toFixed(1)} 小时` : "-"}
              icon={Moon}
              iconColor="text-indigo-500"
            />
            <StatCard
              title="活动能量"
              value={activity ? formatNumber(Math.round(activity.totalActiveEnergy)) : "-"}
              subtitle={activity ? `日均 ${Math.round(activity.avgActiveEnergy)} kcal` : undefined}
              icon={Flame}
              iconColor="text-orange-500"
            />
            <StatCard
              title="锻炼次数"
              value={summary.totalWorkouts}
              subtitle={workouts ? formatDuration(workouts.totalDuration) : undefined}
              icon={Activity}
              iconColor="text-purple-500"
            />
            <StatCard
              title="三圈达成"
              value={activity?.ringCloseCount?.all ?? 0}
              subtitle={`运动${activity?.ringCloseCount?.move ?? 0}/锻炼${activity?.ringCloseCount?.exercise ?? 0}/站立${activity?.ringCloseCount?.stand ?? 0}`}
              icon={Dumbbell}
              iconColor="text-cyan-500"
            />
          </StatGrid>
        </div>
      </section>

      {/* ===== Section 2: Steps Heatmap ===== */}
      {steps && steps.dailySteps.length > 0 && (
        <section>
          <Card>
            <CardHeader className="py-2 px-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Footprints className="h-4 w-4 text-green-500" aria-hidden="true" />
                年度步数分布
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0">
              <HeatmapCalendar
                data={toHeatmapData(steps.dailySteps)}
                year={selectedYear}
                metricLabel="步数"
                valueFormatter={formatNumber}
              />
            </CardContent>
          </Card>
        </section>
      )}

      {/* ===== Section 3: Health Charts ===== */}
      <section>
        <h2 className="text-sm font-medium text-muted-foreground mb-2">健康数据</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* Monthly Steps */}
          {steps && steps.monthlySteps.length > 0 && (
            <Card>
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Footprints className="h-4 w-4 text-green-500" aria-hidden="true" />
                  月度步数
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 pt-0">
                <BarChart
                  data={toMonthlyChartData(steps.monthlySteps)}
                  height={160}
                  color={chartColors.chart1}
                  valueFormatter={formatNumber}
                />
              </CardContent>
            </Card>
          )}

          {/* Monthly Heart Rate */}
          {heartRate && heartRate.monthlyAvg.length > 0 && (
            <Card>
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Heart className="h-4 w-4 text-red-500" aria-hidden="true" />
                  月度心率
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 pt-0">
                <LineChart
                  series={[
                    { data: toMonthlyChartData(heartRate.monthlyAvg), color: chartColors.chart1, name: "平均" },
                    { data: toMonthlyChartData(heartRate.monthlyResting), color: chartColors.chart2, name: "静息" },
                  ]}
                  height={160}
                  valueFormatter={(v) => `${Math.round(v)} bpm`}
                />
              </CardContent>
            </Card>
          )}

          {/* Monthly Active Energy */}
          {activity && activity.monthlyActiveEnergy.length > 0 && (
            <Card>
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Flame className="h-4 w-4 text-orange-500" aria-hidden="true" />
                  月度活动能量
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 pt-0">
                <BarChart
                  data={toMonthlyChartData(activity.monthlyActiveEnergy)}
                  height={160}
                  color={chartColors.chart4}
                  valueFormatter={(v) => `${formatNumber(Math.round(v))} kcal`}
                />
              </CardContent>
            </Card>
          )}

          {/* Monthly Exercise */}
          {activity && activity.monthlyExerciseMinutes.length > 0 && (
            <Card>
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Activity className="h-4 w-4 text-blue-500" aria-hidden="true" />
                  月度运动时长
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 pt-0">
                <BarChart
                  data={toMonthlyChartData(activity.monthlyExerciseMinutes)}
                  height={160}
                  color={chartColors.chart2}
                  valueFormatter={formatDuration}
                />
              </CardContent>
            </Card>
          )}

          {/* Workout Types */}
          {workouts && workouts.byType.length > 0 && (
            <Card>
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Dumbbell className="h-4 w-4 text-purple-500" aria-hidden="true" />
                  锻炼类型
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 pt-0">
                <BarChart
                  data={workouts.byType.slice(0, 6).map((w) => ({
                    label: w.typeName,
                    value: w.count,
                  }))}
                  height={160}
                  horizontal
                  color={chartColors.chart5}
                  valueFormatter={(v) => `${v}次`}
                />
              </CardContent>
            </Card>
          )}

          {/* Monthly Workouts */}
          {workouts && workouts.monthlyWorkouts.length > 0 && (
            <Card>
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Dumbbell className="h-4 w-4 text-purple-500" aria-hidden="true" />
                  月度锻炼次数
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 pt-0">
                <LineChart
                  data={toMonthlyChartData(workouts.monthlyWorkouts)}
                  height={160}
                  color={chartColors.chart3}
                  valueFormatter={(v) => `${v}次`}
                  showDots
                />
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      {/* ===== Section 4: Distance Heatmap ===== */}
      {footprint.dailyDistance.length > 0 && (
        <section>
          <Card>
            <CardHeader className="py-2 px-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Route className="h-4 w-4 text-blue-500" aria-hidden="true" />
                年度距离分布
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0">
              <HeatmapCalendar
                data={toHeatmapData(footprint.dailyDistance)}
                year={selectedYear}
                metricLabel="距离"
                valueFormatter={formatDistance}
                colorScale={heatmapColorScales.blue}
              />
            </CardContent>
          </Card>
        </section>
      )}

      {/* ===== Section 5: Footprint Charts ===== */}
      {(footprint.monthlyDistance.length > 0 || footprint.byTransportMode.length > 0) && (
        <section>
          <h2 className="text-sm font-medium text-muted-foreground mb-2">轨迹数据</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {/* Monthly Distance */}
            {footprint.monthlyDistance.length > 0 && (
              <Card>
                <CardHeader className="py-2 px-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Route className="h-4 w-4 text-blue-500" aria-hidden="true" />
                    月度距离
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3 pt-0">
                  <BarChart
                    data={toMonthlyChartData(footprint.monthlyDistance)}
                    height={160}
                    color={chartColors.chart1}
                    valueFormatter={formatDistance}
                  />
                </CardContent>
              </Card>
            )}

            {/* Transport Mode Distribution */}
            {footprint.byTransportMode.length > 0 && (
              <Card>
                <CardHeader className="py-2 px-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Car className="h-4 w-4 text-cyan-500" aria-hidden="true" />
                    出行方式
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3 pt-0">
                  <DonutChart
                    data={footprint.byTransportMode.map((m) => ({
                      label: m.modeName,
                      value: m.totalDistance,
                    }))}
                    height={160}
                    showLegend
                    valueFormatter={formatDistance}
                  />
                </CardContent>
              </Card>
            )}

            {/* Transport Mode Bar */}
            {footprint.byTransportMode.length > 0 && (
              <Card>
                <CardHeader className="py-2 px-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Route className="h-4 w-4 text-indigo-500" aria-hidden="true" />
                    各方式距离
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3 pt-0">
                  <BarChart
                    data={footprint.byTransportMode.map((m) => ({
                      label: m.modeName,
                      value: m.totalDistance,
                    }))}
                    height={160}
                    horizontal
                    color={chartColors.chart2}
                    valueFormatter={formatDistance}
                  />
                </CardContent>
              </Card>
            )}
          </div>
        </section>
      )}

      {/* ===== Section 6: Expense Heatmap ===== */}
      {pixiu.dailyExpense.length > 0 && (
        <section>
          <Card>
            <CardHeader className="py-2 px-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-red-500" aria-hidden="true" />
                年度支出分布
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0">
              <HeatmapCalendar
                data={toHeatmapData(pixiu.dailyExpense)}
                year={selectedYear}
                metricLabel="支出"
                valueFormatter={formatCurrency}
                colorScale={heatmapColorScales.red}
              />
            </CardContent>
          </Card>
        </section>
      )}

      {/* ===== Section 7: Finance Charts ===== */}
      <section>
        <h2 className="text-sm font-medium text-muted-foreground mb-2">财务数据</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* Monthly Income/Expense Trend */}
          {(pixiu.monthlyIncome.length > 0 || pixiu.monthlyExpense.length > 0) && (
            <Card>
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-blue-500" aria-hidden="true" />
                  月度收支
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 pt-0">
                <LineChart
                  series={[
                    ...(pixiu.monthlyIncome.length > 0
                      ? [{ data: toMonthlyChartData(pixiu.monthlyIncome), color: chartColors.chart1, name: "收入" }]
                      : []),
                    ...(pixiu.monthlyExpense.length > 0
                      ? [{ data: toMonthlyChartData(pixiu.monthlyExpense), color: chartColors.chart2, name: "支出" }]
                      : []),
                  ]}
                  height={160}
                  valueFormatter={formatCurrency}
                  showDots
                />
              </CardContent>
            </Card>
          )}

          {/* Monthly Expense Bar */}
          {pixiu.monthlyExpense.length > 0 && (
            <Card>
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-indigo-500" aria-hidden="true" />
                  月度支出
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 pt-0">
                <BarChart
                  data={toMonthlyChartData(pixiu.monthlyExpense)}
                  height={160}
                  color={chartColors.chart2}
                  valueFormatter={formatCurrency}
                />
              </CardContent>
            </Card>
          )}

          {/* Expense by Category */}
          {pixiu.expenseByCategory.length > 0 && (
            <Card>
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <ArrowDownCircle className="h-4 w-4 text-red-500" aria-hidden="true" />
                  支出分类
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 pt-0">
                <DonutChart
                  data={pixiu.expenseByCategory.slice(0, 8).map((c) => ({
                    label: c.category,
                    value: c.amount,
                  }))}
                  height={160}
                  showLegend
                  valueFormatter={formatCurrency}
                />
              </CardContent>
            </Card>
          )}

          {/* Income by Category */}
          {pixiu.incomeByCategory.length > 0 && (
            <Card>
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <ArrowUpCircle className="h-4 w-4 text-green-500" aria-hidden="true" />
                  收入分类
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 pt-0">
                <DonutChart
                  data={pixiu.incomeByCategory.map((c) => ({
                    label: c.category,
                    value: c.amount,
                  }))}
                  height={160}
                  showLegend
                  valueFormatter={formatCurrency}
                />
              </CardContent>
            </Card>
          )}

          {/* Expense Category Bar */}
          {pixiu.expenseByCategory.length > 0 && (
            <Card>
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-red-500" aria-hidden="true" />
                  分类支出明细
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 pt-0">
                <BarChart
                  data={pixiu.expenseByCategory.slice(0, 8).map((c) => ({
                    label: c.category,
                    value: c.amount,
                  }))}
                  height={160}
                  horizontal
                  color={chartColors.chart3}
                  valueFormatter={formatCurrency}
                />
              </CardContent>
            </Card>
          )}

          {/* Top Expense Months */}
          {pixiu.topExpenseMonths.length > 0 && (
            <Card>
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-red-500" aria-hidden="true" />
                  支出最高月份
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 pt-0">
                <div className="space-y-1.5">
                  {pixiu.topExpenseMonths.slice(0, 5).map((month, index) => (
                    <div
                      key={month.month}
                      className="flex items-center justify-between py-1.5 px-2 rounded-md bg-muted/50"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-muted-foreground w-4 tabular-nums">
                          {index + 1}
                        </span>
                        <span className="text-sm font-medium">{month.month}</span>
                      </div>
                      <p className="text-red-600 font-medium tabular-nums text-sm">
                        {formatCurrency(month.amount)}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </section>
    </div>
  );
}

export function YearPage() {
  const {
    selectedYear,
    loading,
    error,
    data,
    goCurrentYear,
    goPrevYear,
    goNextYear,
    toggleCalendar,
    loadData,
  } = useYearStore();

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <ScrollArea className="h-[calc(100vh-57px)]">
      <div className="p-4 space-y-4">
        {/* Year Navigation */}
        <YearNavigation
          selectedYear={selectedYear}
          onPrevYear={goPrevYear}
          onNextYear={goNextYear}
          onCurrentYear={goCurrentYear}
          onToggleCalendar={toggleCalendar}
        />

        {/* Loading state */}
        {loading && <LoadingSkeleton />}

        {/* Error state */}
        {error && <ErrorDisplay message={error} />}

        {/* Main content */}
        {!loading && !error && data && <YearContent />}
      </div>
    </ScrollArea>
  );
}
