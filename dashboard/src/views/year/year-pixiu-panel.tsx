"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard, StatGrid } from "@/components/charts/stat-card";
import { LineChart } from "@/components/charts/line-chart";
import { BarChart } from "@/components/charts/bar-chart";
import { DonutChart } from "@/components/charts/pie-chart";
import { HeatmapCalendar, heatmapColorScales } from "@/components/charts/heatmap-calendar";
import { chartColors } from "@/lib/chart-colors";
import type { YearPixiuData } from "@/models/year-view";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Receipt,
  CreditCard,
  PiggyBank,
  ArrowUpCircle,
  ArrowDownCircle,
  Calendar,
} from "lucide-react";

export interface YearPixiuPanelProps {
  data: YearPixiuData;
  year: number;
}

/** Format currency */
const formatCurrency = (value: number): string => {
  const absValue = Math.abs(value);
  const prefix = value < 0 ? "-" : "";
  if (absValue >= 10000) {
    return `${prefix}¥${(absValue / 10000).toFixed(2)}万`;
  }
  return `${prefix}¥${absValue.toFixed(2)}`;
};

/** Format currency compact */
const formatCurrencyCompact = (value: number): string => {
  const absValue = Math.abs(value);
  const prefix = value < 0 ? "-" : "";
  if (absValue >= 10000) {
    return `${prefix}¥${(absValue / 10000).toFixed(1)}万`;
  }
  return `${prefix}¥${absValue.toFixed(0)}`;
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
    dailyExpense,
    topExpenseMonths,
  } = data;

  const isPositiveNet = totalNet >= 0;

  return (
    <div className="space-y-6">
      {/* Summary Stats Grid */}
      <StatGrid columns={4}>
        <StatCard
          title="年度总收入"
          value={formatCurrency(totalIncome)}
          subtitle={`月均 ${formatCurrencyCompact(avgMonthlyIncome)}`}
          icon={TrendingUp}
          iconColor="text-green-500"
        />
        <StatCard
          title="年度总支出"
          value={formatCurrency(totalExpense)}
          subtitle={`月均 ${formatCurrencyCompact(avgMonthlyExpense)}`}
          icon={TrendingDown}
          iconColor="text-red-500"
        />
        <StatCard
          title="年度净收支"
          value={formatCurrency(totalNet)}
          icon={isPositiveNet ? PiggyBank : Wallet}
          iconColor={isPositiveNet ? "text-emerald-500" : "text-orange-500"}
        />
        <StatCard
          title="交易笔数"
          value={transactionCount}
          subtitle="全年交易"
          icon={Receipt}
          iconColor="text-blue-500"
        />
      </StatGrid>

      {/* Expense Heatmap */}
      {dailyExpense.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-500" />
              年度支出分布
            </CardTitle>
          </CardHeader>
          <CardContent>
            <HeatmapCalendar
              data={toHeatmapData(dailyExpense)}
              year={year}
              metricLabel="支出"
              valueFormatter={formatCurrencyCompact}
              colorScale={heatmapColorScales.red}
            />
          </CardContent>
        </Card>
      )}

      {/* Monthly Trend Charts */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Monthly Income/Expense Trend */}
        {(monthlyIncome.length > 0 || monthlyExpense.length > 0) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-blue-500" />
                月度收支趋势
              </CardTitle>
            </CardHeader>
            <CardContent>
              <LineChart
                series={[
                  ...(monthlyIncome.length > 0
                    ? [
                        {
                          data: toMonthlyChartData(monthlyIncome),
                          color: "chartColors.chart1",
                          name: "收入",
                        },
                      ]
                    : []),
                  ...(monthlyExpense.length > 0
                    ? [
                        {
                          data: toMonthlyChartData(monthlyExpense),
                          color: "chartColors.chart2",
                          name: "支出",
                        },
                      ]
                    : []),
                ]}
                height={200}
                valueFormatter={formatCurrencyCompact}
                showDots
              />
            </CardContent>
          </Card>
        )}

        {/* Expense by Category */}
        {expenseByCategory.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <ArrowDownCircle className="h-4 w-4 text-red-500" />
                年度支出分类
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DonutChart
                data={expenseByCategory.map((c) => ({
                  label: c.category,
                  value: c.amount,
                }))}
                height={200}
                showLegend
                valueFormatter={formatCurrencyCompact}
              />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Second Row Charts */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Income by Category */}
        {incomeByCategory.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <ArrowUpCircle className="h-4 w-4 text-green-500" />
                年度收入分类
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DonutChart
                data={incomeByCategory.map((c) => ({
                  label: c.category,
                  value: c.amount,
                }))}
                height={200}
                showLegend
                valueFormatter={formatCurrencyCompact}
              />
            </CardContent>
          </Card>
        )}

        {/* Expense by Category Bar Chart */}
        {expenseByCategory.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Receipt className="h-4 w-4 text-purple-500" />
                分类支出明细
              </CardTitle>
            </CardHeader>
            <CardContent>
              <BarChart
                data={expenseByCategory.slice(0, 10).map((c) => ({
                  label: c.category,
                  value: c.amount,
                }))}
                height={250}
                horizontal
                color={chartColors.chart3}
                valueFormatter={formatCurrencyCompact}
              />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Monthly Expense Bar Chart */}
      {monthlyExpense.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4 text-indigo-500" />
              月度支出
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart
              data={toMonthlyChartData(monthlyExpense)}
              height={200}
              color={chartColors.chart2}
              valueFormatter={formatCurrencyCompact}
            />
          </CardContent>
        </Card>
      )}

      {/* Account Breakdown */}
      {byAccount.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-cyan-500" />
              账户年度收支
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {byAccount.map((account) => (
                <div
                  key={account.account}
                  className="rounded-lg border p-4 space-y-2"
                >
                  <p className="font-medium truncate">{account.account}</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-muted-foreground">收入</p>
                      <p className="text-green-600 font-medium">
                        {formatCurrencyCompact(account.income)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">支出</p>
                      <p className="text-red-600 font-medium">
                        {formatCurrencyCompact(account.expense)}
                      </p>
                    </div>
                  </div>
                  <div className="pt-2 border-t">
                    <p className="text-muted-foreground text-xs">净额</p>
                    <p
                      className={`font-medium ${
                        account.net >= 0 ? "text-emerald-600" : "text-orange-600"
                      }`}
                    >
                      {formatCurrencyCompact(account.net)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top Expense Months */}
      {topExpenseMonths.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-500" />
              支出最高月份
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topExpenseMonths.slice(0, 5).map((month, index) => (
                <div
                  key={month.month}
                  className="flex items-center justify-between py-2 border-b last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold text-muted-foreground w-6">
                      {index + 1}
                    </span>
                    <span className="font-medium">{month.month}</span>
                  </div>
                  <p className="text-red-600 font-medium">
                    {formatCurrency(month.amount)}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
