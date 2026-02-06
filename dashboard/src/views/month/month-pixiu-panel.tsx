"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard, StatGrid } from "@/components/charts/stat-card";
import { LineChart } from "@/components/charts/line-chart";
import { BarChart } from "@/components/charts/bar-chart";
import { DonutChart } from "@/components/charts/pie-chart";
import { chartColors } from "@/lib/chart-colors";
import type { MonthPixiuData } from "@/models/month-view";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Receipt,
  CreditCard,
  PiggyBank,
  ArrowUpCircle,
  ArrowDownCircle,
} from "lucide-react";

export interface MonthPixiuPanelProps {
  data: MonthPixiuData;
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

/** Convert DailyDataPoint to chart format */
const toChartData = (
  data: { date: string; value: number }[]
): { label: string; value: number }[] => {
  return data.map((d) => ({
    label: d.date.split("-")[2], // Extract day from YYYY-MM-DD
    value: d.value,
  }));
};

export function MonthPixiuPanel({ data }: MonthPixiuPanelProps) {
  const {
    totalIncome,
    totalExpense,
    totalNet,
    transactionCount,
    avgDailyExpense,
    avgDailyIncome,
    expenseByCategory,
    incomeByCategory,
    byAccount,
    dailyIncome,
    dailyExpense,
    topExpenses,
  } = data;

  const isPositiveNet = totalNet >= 0;

  return (
    <div className="space-y-4">
      {/* Summary Stats Grid */}
      <StatGrid columns={4}>
        <StatCard
          title="总收入"
          value={formatCurrency(totalIncome)}
          subtitle={`日均 ${formatCurrencyCompact(avgDailyIncome)}`}
          icon={TrendingUp}
          iconColor="text-green-500"
        />
        <StatCard
          title="总支出"
          value={formatCurrency(totalExpense)}
          subtitle={`日均 ${formatCurrencyCompact(avgDailyExpense)}`}
          icon={TrendingDown}
          iconColor="text-red-500"
        />
        <StatCard
          title="净收支"
          value={formatCurrency(totalNet)}
          icon={isPositiveNet ? PiggyBank : Wallet}
          iconColor={isPositiveNet ? "text-emerald-500" : "text-orange-500"}
        />
        <StatCard
          title="交易笔数"
          value={transactionCount}
          subtitle="本月交易"
          icon={Receipt}
          iconColor="text-blue-500"
        />
      </StatGrid>

      {/* Charts Row */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Daily Income/Expense Trend */}
        {(dailyIncome.length > 0 || dailyExpense.length > 0) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-blue-500" aria-hidden="true" />
                每日收支趋势
              </CardTitle>
            </CardHeader>
            <CardContent>
              <LineChart
                series={[
                  ...(dailyIncome.length > 0
                    ? [
                        {
                          data: toChartData(dailyIncome),
                          color: chartColors.chart1,
                          name: "收入",
                        },
                      ]
                    : []),
                  ...(dailyExpense.length > 0
                    ? [
                        {
                          data: toChartData(dailyExpense),
                          color: chartColors.chart2,
                          name: "支出",
                        },
                      ]
                    : []),
                ]}
                height={180}
                valueFormatter={formatCurrencyCompact}
              />
            </CardContent>
          </Card>
        )}

        {/* Expense by Category */}
        {expenseByCategory.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <ArrowDownCircle className="h-4 w-4 text-red-500" aria-hidden="true" />
                支出分类
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DonutChart
                data={expenseByCategory.map((c) => ({
                  label: c.category,
                  value: c.amount,
                }))}
                height={180}
                showLegend
                valueFormatter={formatCurrencyCompact}
              />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Second Row Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Income by Category */}
        {incomeByCategory.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <ArrowUpCircle className="h-4 w-4 text-green-500" aria-hidden="true" />
                收入分类
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DonutChart
                data={incomeByCategory.map((c) => ({
                  label: c.category,
                  value: c.amount,
                }))}
                height={180}
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
                <Receipt className="h-4 w-4 text-purple-500" aria-hidden="true" />
                分类支出明细
              </CardTitle>
            </CardHeader>
            <CardContent>
              <BarChart
                data={expenseByCategory.slice(0, 8).map((c) => ({
                  label: c.category,
                  value: c.amount,
                }))}
                height={180}
                horizontal
                color={chartColors.chart3}
                valueFormatter={formatCurrencyCompact}
              />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Account Breakdown */}
      {byAccount.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-cyan-500" aria-hidden="true" />
              账户收支
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {byAccount.map((account) => (
                <div
                  key={account.account}
                  className="rounded-lg border p-3 space-y-1.5"
                >
                  <p className="text-sm font-medium truncate">{account.account}</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">收入</p>
                      <p className="text-green-600 font-medium tabular-nums">
                        {formatCurrencyCompact(account.income)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">支出</p>
                      <p className="text-red-600 font-medium tabular-nums">
                        {formatCurrencyCompact(account.expense)}
                      </p>
                    </div>
                  </div>
                  <div className="pt-1.5 border-t">
                    <p className="text-muted-foreground text-[10px]">净额</p>
                    <p
                      className={`text-sm font-medium tabular-nums ${
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

      {/* Top Expenses */}
      {topExpenses.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-500" aria-hidden="true" />
              最大支出
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {topExpenses.slice(0, 5).map((expense, index) => (
                <div
                  key={`${expense.date}-${index}`}
                  className="flex items-center justify-between py-1.5 border-b last:border-0"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {expense.note || expense.category}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {expense.date} · {expense.category}
                    </p>
                  </div>
                  <p className="text-red-600 font-medium tabular-nums ml-4">
                    {formatCurrency(expense.amount)}
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
