"use client";

import { StatCard, StatGrid } from "@/components/charts/stat-card";
import { LineChart } from "@/components/charts/line-chart";
import { BarChart } from "@/components/charts/bar-chart";
import { DonutChart } from "@/components/charts/pie-chart";
import { HeatmapCalendar, heatmapColorScales } from "@/components/charts/heatmap-calendar";
import type { YearPixiuData } from "@/models/year-view";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Receipt,
  PiggyBank,
  ArrowUpCircle,
  ArrowDownCircle,
  Calendar,
} from "lucide-react";

export interface YearPixiuPanelProps {
  data: YearPixiuData;
  year: number;
}

const formatCurrency = (value: number): string => {
  const absValue = Math.abs(value);
  const prefix = value < 0 ? "-" : "";
  if (absValue >= 10000) {
    return `${prefix}¥${(absValue / 10000).toFixed(2)}万`;
  }
  return `${prefix}¥${absValue.toFixed(2)}`;
};

const formatCurrencyCompact = (value: number): string => {
  const absValue = Math.abs(value);
  const prefix = value < 0 ? "-" : "";
  if (absValue >= 10000) {
    return `${prefix}¥${(absValue / 10000).toFixed(1)}万`;
  }
  return `${prefix}¥${absValue.toFixed(0)}`;
};

const toMonthlyChartData = (
  data: { month: string; value: number }[]
): { label: string; value: number }[] => {
  return data.map((d) => ({
    label: d.month.split("-")[1],
    value: d.value,
  }));
};

const toHeatmapData = (
  data: { date: string; value: number }[]
): { date: string; value: number }[] => {
  return data.map((d) => ({
    date: d.date,
    value: d.value,
  }));
};

const aggregateCategoryData = (
  data: { category: string; amount: number }[],
  topN: number = 4
): { label: string; value: number }[] => {
  if (data.length <= topN) {
    return data
      .slice()
      .sort((a, b) => b.amount - a.amount)
      .map((c) => ({ label: c.category, value: c.amount }));
  }

  const sorted = data.slice().sort((a, b) => b.amount - a.amount);
  const top = sorted.slice(0, topN);
  const rest = sorted.slice(topN);
  const othersTotal = rest.reduce((sum, c) => sum + c.amount, 0);

  return [
    ...top.map((c) => ({ label: c.category, value: c.amount })),
    { label: "其他", value: othersTotal },
  ];
};

const COLORS = {
  income: "hsl(var(--chart-5))",
  expense: "hsl(var(--destructive))",
  net: "hsl(var(--chart-1))",
};

export function YearPixiuPanel({ data, year }: YearPixiuPanelProps) {
  const {
    totalIncome,
    totalExpense,
    totalNet,
    transactionCount,
    avgMonthlyExpense,
    avgMonthlyIncome,
    expenseByCategory,
    incomeByCategory,
    byAccount,
    monthlyIncome,
    monthlyExpense,
    monthlyNet,
    dailyExpense,
    topExpenseMonths,
  } = data;

  const isPositiveNet = totalNet >= 0;

  const incomeByAccountData = byAccount
    .filter((a) => a.income > 0)
    .sort((a, b) => b.income - a.income)
    .slice(0, 6)
    .map((a) => ({ label: a.account, value: a.income }));

  const expenseByAccountData = byAccount
    .filter((a) => a.expense > 0)
    .sort((a, b) => b.expense - a.expense)
    .slice(0, 6)
    .map((a) => ({ label: a.account, value: a.expense }));

  return (
    <div className="space-y-4">
      {/* A. Summary - Core Metrics */}
      <StatGrid columns={4}>
        <StatCard
          title="年度总收入"
          value={formatCurrency(totalIncome)}
          icon={TrendingUp}
        />
        <StatCard
          title="年度总支出"
          value={formatCurrency(totalExpense)}
          icon={TrendingDown}
        />
        <StatCard
          title="年度净收支"
          value={formatCurrency(totalNet)}
          icon={isPositiveNet ? PiggyBank : Wallet}
        />
        <StatCard
          title="交易笔数"
          value={transactionCount}
          icon={Receipt}
        />
      </StatGrid>

      {/* A. Summary - Monthly Averages (symmetric) */}
      <StatGrid columns={2}>
        <StatCard
          title="月均收入"
          value={formatCurrency(avgMonthlyIncome)}
          icon={ArrowUpCircle}
        />
        <StatCard
          title="月均支出"
          value={formatCurrency(avgMonthlyExpense)}
          icon={ArrowDownCircle}
        />
      </StatGrid>

      {/* B. Trends - Monthly Income/Expense/Net */}
      {(monthlyIncome.length > 0 || monthlyExpense.length > 0) && (
        <div className="rounded-card bg-secondary p-4">
          <div className="flex items-center gap-2 text-sm font-normal text-muted-foreground mb-3">
            <Calendar className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
            月度收支趋势
          </div>
            <LineChart
              series={[
                ...(monthlyIncome.length > 0
                  ? [{ data: toMonthlyChartData(monthlyIncome), color: COLORS.income, name: "收入" }]
                  : []),
                ...(monthlyExpense.length > 0
                  ? [{ data: toMonthlyChartData(monthlyExpense), color: COLORS.expense, name: "支出" }]
                  : []),
                ...(monthlyNet.length > 0
                  ? [{ data: toMonthlyChartData(monthlyNet), color: COLORS.net, name: "净收支" }]
                  : []),
              ]}
              height={200}
              valueFormatter={formatCurrencyCompact}
              showDots
            />
        </div>
      )}

      {/* C. Breakdown - Category Distribution (symmetric: left=income, right=expense) */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-card bg-secondary p-4">
          <div className="flex items-center gap-2 text-sm font-normal text-muted-foreground mb-3">
            <ArrowUpCircle className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
            收入 | 分类占比
          </div>
            {incomeByCategory.length > 0 ? (
              <DonutChart
                data={aggregateCategoryData(incomeByCategory)}
                height={180}
                showLegend
                valueFormatter={formatCurrencyCompact}
              />
            ) : (
              <div className="h-[180px] flex items-center justify-center text-sm text-muted-foreground">
                暂无收入数据
              </div>
            )}
        </div>
        <div className="rounded-card bg-secondary p-4">
          <div className="flex items-center gap-2 text-sm font-normal text-muted-foreground mb-3">
            <ArrowDownCircle className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
            支出 | 分类占比
          </div>
            {expenseByCategory.length > 0 ? (
              <DonutChart
                data={aggregateCategoryData(expenseByCategory)}
                height={180}
                showLegend
                valueFormatter={formatCurrencyCompact}
              />
            ) : (
              <div className="h-[180px] flex items-center justify-center text-sm text-muted-foreground">
                暂无支出数据
              </div>
            )}
        </div>
      </div>

      {/* C. Breakdown - Account Distribution (symmetric: left=income, right=expense) */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-card bg-secondary p-4">
          <div className="flex items-center gap-2 text-sm font-normal text-muted-foreground mb-3">
            <ArrowUpCircle className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
            收入 | 按账户
          </div>
            {incomeByAccountData.length > 0 ? (
              <BarChart
                data={incomeByAccountData}
                height={180}
                horizontal
                color={COLORS.income}
                valueFormatter={formatCurrencyCompact}
              />
            ) : (
              <div className="h-[180px] flex items-center justify-center text-sm text-muted-foreground">
                暂无收入数据
              </div>
            )}
        </div>
        <div className="rounded-card bg-secondary p-4">
          <div className="flex items-center gap-2 text-sm font-normal text-muted-foreground mb-3">
            <ArrowDownCircle className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
            支出 | 按账户
          </div>
            {expenseByAccountData.length > 0 ? (
              <BarChart
                data={expenseByAccountData}
                height={180}
                horizontal
                color={COLORS.expense}
                valueFormatter={formatCurrencyCompact}
              />
            ) : (
              <div className="h-[180px] flex items-center justify-center text-sm text-muted-foreground">
                暂无支出数据
              </div>
            )}
        </div>
      </div>

      {/* D. Details - Expense Heatmap */}
      {dailyExpense.length > 0 && (
        <div className="rounded-card bg-secondary p-4">
          <div className="flex items-center gap-2 text-sm font-normal text-muted-foreground mb-3">
            <TrendingDown className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
            支出日历
          </div>
            <HeatmapCalendar
              data={toHeatmapData(dailyExpense)}
              year={year}
              metricLabel="支出"
              valueFormatter={formatCurrencyCompact}
              colorScale={heatmapColorScales.red}
            />
        </div>
      )}

      {/* D. Details - Top Expense Months */}
      {topExpenseMonths.length > 0 && (
        <div className="rounded-card bg-secondary p-4">
          <div className="flex items-center gap-2 text-sm font-normal text-muted-foreground mb-3">
            <TrendingDown className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
            支出最高月份
          </div>
            <BarChart
              data={topExpenseMonths.slice(0, 5).map((m) => ({
                label: m.month,
                value: m.amount,
              }))}
              height={160}
              horizontal
              color={COLORS.expense}
              valueFormatter={formatCurrencyCompact}
            />
        </div>
      )}
    </div>
  );
}
