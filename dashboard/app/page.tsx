"use client";

import { useMemo, useState } from "react";
import {
  buildMockDay,
  getDashboardData,
  getDayById
} from "@/features/dashboard/service";
import { createDashboardViewModel } from "@/features/dashboard/view-model";
import {
  formatDelta,
  formatKm,
  formatKmh,
  formatMinutes,
  formatMoney,
  formatNumber
} from "@/features/dashboard/model";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import {
  CalendarDays,
  CloudSnow,
  Compass,
  Footprints,
  HeartPulse,
  MapPinned,
  MessageCircle,
  PiggyBank,
  Snowflake,
  Timer,
  Wallet
} from "lucide-react";

export default function Home() {
  const data = useMemo(() => getDashboardData(), []);
  const [selectedDayId, setSelectedDayId] = useState(data.selectedDayId);
  const [customDate, setCustomDate] = useState(data.selectedDayId);
  const [customDay, setCustomDay] = useState(() =>
    buildMockDay(new Date(customDate))
  );
  const [calendarMonth, setCalendarMonth] = useState(
    new Date(customDate)
  );
  const selectedDay =
    getDayById(data.days, selectedDayId) ?? data.days[0];
  const viewModel = createDashboardViewModel(data.days, selectedDayId);

  if (!selectedDay) {
    return null;
  }

  const customSelected =
    selectedDayId === "custom" ? customDay : selectedDay;

  const spendingBalance =
    customSelected.spending.incomeTotal -
    customSelected.spending.expenseTotal;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_oklch(0.98_0.05_80),_oklch(1_0_0)_45%,_oklch(0.96_0.01_60)_100%)]">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="relative overflow-hidden rounded-[32px] border border-white/60 bg-white/70 p-8 shadow-sm backdrop-blur surface-glow">
          <div className="absolute inset-0 grid-fade opacity-50" />
          <div className="absolute -right-16 top-[-120px] h-64 w-64 rounded-full bg-[radial-gradient(circle,_rgba(15,23,42,0.18),_rgba(15,23,42,0))]" />
          <div className="relative flex flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-6">
              <div>
                <p className="text-xs uppercase tracking-[0.4em] text-zinc-500">
                  {viewModel.subtitle}
                </p>
                <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
                  {viewModel.title}
                </h1>
                <p className="mt-3 max-w-xl text-sm text-zinc-600">
                  {customSelected.story}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white/80 px-4 py-2 text-sm text-zinc-700 shadow-sm">
                  <CalendarDays className="h-4 w-4" />
                  <span>{customSelected.timeline.monthDay}</span>
                  <Input
                    type="date"
                    value={customDate}
                    min="2021-01-01"
                    max="2026-12-31"
                    onChange={(event) => {
                      const value = event.target.value;
                      setCustomDate(value);
                      setCustomDay(buildMockDay(new Date(value)));
                      setCalendarMonth(new Date(value));
                      setSelectedDayId("custom");
                    }}
                    className="h-6 w-[120px] border-none bg-transparent px-2 py-0 text-xs shadow-none focus-visible:ring-0"
                  />
                </div>
                <Button variant="secondary" className="bg-white/70">
                  <Compass className="h-4 w-4" />
                  Daily Replay
                </Button>
                <Button>
                  <MessageCircle className="h-4 w-4" />
                  Share Story
                </Button>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="bg-white/80">
                <CardHeader className="pb-3">
                  <CardDescription className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em]">
                    <Footprints className="h-3 w-3" />
                    Footprint
                  </CardDescription>
                  <CardTitle>
                    {formatKm(customSelected.footprint.totalDistanceKm)}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-zinc-500">
                  {customSelected.timeline.placeCount} places ·{" "}
                  {formatMinutes(customSelected.footprint.activeMinutes)} active
                </CardContent>
              </Card>
              <Card className="bg-white/80">
                <CardHeader className="pb-3">
                  <CardDescription className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em]">
                    <HeartPulse className="h-3 w-3" />
                    Health
                  </CardDescription>
                  <CardTitle>{formatNumber(customSelected.timeline.steps)} steps</CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-zinc-500">
                  Active energy {customSelected.timeline.energyKcal} kcal
                </CardContent>
              </Card>
              <Card className="bg-white/80">
                <CardHeader className="pb-3">
                  <CardDescription className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em]">
                    <Wallet className="h-3 w-3" />
                    Spending
                  </CardDescription>
                  <CardTitle>{formatMoney(customSelected.spending.expenseTotal)} spent</CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-zinc-500">
                  {customSelected.spending.items.length} transactions
                </CardContent>
              </Card>
              <Card className="bg-white/80">
                <CardHeader className="pb-3">
                  <CardDescription className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em]">
                    <CloudSnow className="h-3 w-3" />
                    Weather
                  </CardDescription>
                  <CardTitle>{customSelected.timeline.weather}</CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-zinc-500">
                  {customSelected.timeline.headline}
                </CardContent>
              </Card>
            </div>
          </div>
        </header>

        <section className="mt-10">
          <Card>
            <CardHeader className="pb-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <CardDescription className="text-[10px] uppercase tracking-[0.3em]">
                    Timeline
                  </CardDescription>
                  <CardTitle>Choose a day</CardTitle>
                </div>
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <Snowflake className="h-4 w-4" />
                  {customSelected.timeline.weather}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-2xl border border-zinc-200/70 bg-white p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">
                    Calendar
                  </p>
                  <Badge variant="muted">2021-2026</Badge>
                </div>
                <Calendar
                  mode="single"
                  selected={new Date(customDate)}
                  month={calendarMonth}
                  onMonthChange={setCalendarMonth}
                  captionLayout="label"
                  fromYear={2021}
                  toYear={2026}
                  onSelect={(value: Date | undefined) => {
                    if (!value) {
                      return;
                    }
                    const iso = value.toISOString().slice(0, 10);
                    setCustomDate(iso);
                    setCustomDay(buildMockDay(value));
                    setSelectedDayId("custom");
                  }}
                  className="mt-4"
                />
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="mt-10 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Card className="relative overflow-hidden">
            <div className="absolute inset-0 soft-noise opacity-60" />
            <CardHeader className="relative">
              <CardDescription className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em]">
                <MapPinned className="h-3 w-3" />
                Footprint
              </CardDescription>
              <CardTitle>一天的足迹与停留</CardTitle>
            </CardHeader>
            <CardContent className="relative grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-2xl border border-zinc-200/70 bg-[radial-gradient(circle_at_top,_rgba(15,23,42,0.08),_rgba(255,255,255,0))] p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-zinc-500">Distance</p>
                    <p className="text-lg font-semibold text-zinc-900">
                      {formatKm(customSelected.footprint.totalDistanceKm)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-zinc-500">Max speed</p>
                    <p className="text-lg font-semibold text-zinc-900">
                      {formatKmh(customSelected.footprint.maxSpeedKmh)}
                    </p>
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-24 items-end gap-1">
                  {customSelected.footprint.track.map((value, index) => (
                    <div
                      key={`${value}-${index}`}
                      className="rounded-full bg-zinc-900/20"
                      style={{ height: `${8 + value}px` }}
                    />
                  ))}
                </div>
                <div className="mt-6 relative h-40 overflow-hidden rounded-2xl bg-[conic-gradient(from_210deg,_rgba(15,23,42,0.1),_rgba(15,23,42,0.02),_rgba(15,23,42,0.14))]">
                  {customSelected.footprint.heatmap.map((point, index) => (
                    <span
                      key={`${point.x}-${point.y}-${index}`}
                      className="absolute h-10 w-10 rounded-full bg-amber-500/30 blur-2xl"
                      style={{
                        left: `${point.x}%`,
                        top: `${point.y}%`,
                        opacity: point.intensity
                      }}
                    />
                  ))}
                  <div className="absolute bottom-3 left-4 rounded-full bg-white/70 px-3 py-1 text-xs text-zinc-600">
                    Hot zones · {customSelected.footprint.cities} city
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-zinc-200/70 bg-white/80 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">
                      Stops
                    </p>
                    <p className="text-lg font-semibold text-zinc-900">
                      {customSelected.footprint.stops.length} moments
                    </p>
                  </div>
                  <Badge variant="muted">
                    {formatMinutes(customSelected.footprint.activeMinutes)} moving
                  </Badge>
                </div>
                <div className="mt-4 space-y-4">
                  {customSelected.footprint.stops.map((stop) => (
                    <div
                      key={`${stop.time}-${stop.place}`}
                      className="rounded-2xl border border-zinc-200/70 bg-white p-4"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-zinc-900">
                          {stop.place}
                        </p>
                        <Badge variant="outline" className="text-[10px] uppercase">
                          {stop.mode}
                        </Badge>
                      </div>
                      <p className="mt-2 text-xs text-zinc-500">{stop.note}</p>
                      <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
                        <span>{stop.time}</span>
                        <span>{formatKm(stop.distanceKm)}</span>
                        <span>{formatMinutes(stop.durationMin)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden">
            <div className="absolute inset-0 soft-noise opacity-50" />
            <CardHeader className="relative">
              <CardDescription className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em]">
                <HeartPulse className="h-3 w-3" />
                Apple Health
              </CardDescription>
              <CardTitle>健康节奏与恢复</CardTitle>
            </CardHeader>
            <CardContent className="relative space-y-6">
              <div className="grid gap-3">
                {customSelected.health.metrics.map((metric) => (
                  <div
                    key={metric.label}
                    className="flex items-center justify-between rounded-2xl border border-zinc-200/70 bg-white p-4"
                  >
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">
                        {metric.label}
                      </p>
                      <p className="mt-2 text-lg font-semibold text-zinc-900">
                        {formatNumber(metric.value)} {metric.unit}
                      </p>
                    </div>
                    <span
                      className={`text-xs font-medium ${
                        metric.trend === "down"
                          ? "text-rose-500"
                          : metric.trend === "flat"
                          ? "text-zinc-500"
                          : "text-emerald-600"
                      }`}
                    >
                      {formatDelta(metric.delta, metric.unit === "steps" ? "%" : "%")}
                    </span>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-zinc-200/70 bg-white p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">
                    Activity Rings
                  </p>
                  <Timer className="h-4 w-4 text-zinc-500" />
                </div>
                <div className="mt-4 space-y-3">
                  {customSelected.health.activity.map((ring) => {
                    const progress = Math.min(
                      100,
                      (ring.value / ring.goal) * 100
                    );
                    return (
                      <div key={ring.label}>
                        <div className="flex items-center justify-between text-xs text-zinc-500">
                          <span>{ring.label}</span>
                          <span>
                            {ring.value}/{ring.goal}
                          </span>
                        </div>
                        <Progress
                          value={progress}
                          className="mt-2 h-2 ring-track"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-200/70 bg-white p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">
                    Heart Rate
                  </p>
                  <Badge variant="muted">
                    {customSelected.health.heartRate.length} samples
                  </Badge>
                </div>
                <div className="mt-4 grid grid-cols-6 items-end gap-2">
                  {customSelected.health.heartRate.map((sample) => (
                    <div key={sample.time} className="text-center">
                      <div
                        className="mx-auto w-5 rounded-full bg-rose-400/50"
                        style={{ height: `${sample.bpm - 40}px` }}
                      />
                      <p className="mt-2 text-[10px] text-zinc-500">
                        {sample.time}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-zinc-200/70 bg-white p-4">
                  <p className="text-xs text-zinc-500">Sleep</p>
                  <p className="mt-2 text-lg font-semibold text-zinc-900">
                    {customSelected.health.sleepHours}h
                  </p>
                </div>
                <div className="rounded-2xl border border-zinc-200/70 bg-white p-4">
                  <p className="text-xs text-zinc-500">Mindfulness</p>
                  <p className="mt-2 text-lg font-semibold text-zinc-900">
                    {customSelected.health.mindfulnessMin} min
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="mt-10 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
          <Card>
            <CardHeader>
              <CardDescription className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em]">
                <PiggyBank className="h-3 w-3" />
                Spending
              </CardDescription>
              <CardTitle>收入与支出明细</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-zinc-200/70 bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">
                    Income
                  </p>
                  <p className="mt-2 text-xl font-semibold text-emerald-600">
                    {formatMoney(customSelected.spending.incomeTotal)}
                  </p>
                  <p className="mt-2 text-xs text-zinc-500">Transfers + salary</p>
                </div>
                <div className="rounded-2xl border border-zinc-200/70 bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">
                    Expense
                  </p>
                  <p className="mt-2 text-xl font-semibold text-rose-500">
                    {formatMoney(customSelected.spending.expenseTotal)}
                  </p>
                  <p className="mt-2 text-xs text-zinc-500">
                    Top category: {customSelected.spending.topCategory}
                  </p>
                </div>
              </div>
              <div className="mt-6 flex items-center justify-between rounded-2xl border border-zinc-200/70 bg-zinc-900 px-4 py-3 text-white">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-white/60">
                    Balance
                  </p>
                  <p className="text-lg font-semibold">
                    {spendingBalance >= 0 ? "+" : "-"}
                    {formatMoney(spendingBalance)}
                  </p>
                </div>
                <Badge variant="accent">Net</Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardDescription className="text-[10px] uppercase tracking-[0.3em]">
                Transactions
              </CardDescription>
              <CardTitle>今日消费流水</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="all">
                <TabsList>
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="expense">Expense</TabsTrigger>
                  <TabsTrigger value="income">Income</TabsTrigger>
                </TabsList>
                {(["all", "expense", "income"] as const).map((type) => {
                  const items = customSelected.spending.items.filter((item) =>
                    type === "all" ? true : item.type === type
                  );
                  return (
                    <TabsContent key={type} value={type}>
                      <div className="space-y-3">
                        {items.map((item) => (
                          <div
                            key={`${item.time}-${item.title}`}
                            className="flex items-center justify-between rounded-2xl border border-zinc-200/70 bg-white p-4"
                          >
                            <div>
                              <p className="text-sm font-semibold text-zinc-900">
                                {item.title}
                              </p>
                              <p className="mt-1 text-xs text-zinc-500">
                                {item.time} · {item.category} · {item.method}
                              </p>
                            </div>
                            <span
                              className={`text-sm font-semibold ${
                                item.type === "income"
                                  ? "text-emerald-600"
                                  : "text-rose-500"
                              }`}
                            >
                              {item.type === "income" ? "+" : "-"}
                              {formatMoney(item.amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </TabsContent>
                  );
                })}
              </Tabs>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
