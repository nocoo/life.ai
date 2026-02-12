"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard, StatGrid } from "@/components/charts/stat-card";
import { LineChart } from "@/components/charts/line-chart";
import { BarChart } from "@/components/charts/bar-chart";
import { DonutChart } from "@/components/charts/pie-chart";
import type { MonthPixiuData } from "@/models/month-view";
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

export interface MonthPixiuPanelProps {
  data: MonthPixiuData;
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

const toDailyChartData = (
  data: { date: string; value: number }[]
): { label: string; value: number }[] => {
  return data.map((d) => ({
    label: d.date.split("-")[2],
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
    dailyNet,
    topExpenses,
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
          title="总收入"
          value={formatCurrency(totalIncome)}
          icon={TrendingUp}
          iconColor="text-green-500"
        />
        <StatCard
          title="总支出"
          value={formatCurrency(totalExpense)}
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
          icon={Receipt}
          iconColor="text-blue-500"
        />
      </StatGrid>

      {/* A. Summary - Daily Averages (symmetric) */}
      <StatGrid columns={2}>
        <StatCard
          title="日均收入"
          value={formatCurrency(avgDailyIncome)}
          icon={ArrowUpCircle}
          iconColor="text-green-500"
        />
        <StatCard
          title="日均支出"
          value={formatCurrency(avgDailyExpense)}
          icon={ArrowDownCircle}
          iconColor="text-red-500"
        />
      </StatGrid>

      {/* B. Trends - Daily Income/Expense/Net */}
      {(dailyIncome.length > 0 || dailyExpense.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4 text-blue-500" aria-hidden="true" />
              每日收支趋势
            </CardTitle>
          </CardHeader>
          <CardContent>
            <LineChart
              series={[
                ...(dailyIncome.length > 0
                  ? [{ data: toDailyChartData(dailyIncome), color: COLORS.income, name: "收入" }]
                  : []),
                ...(dailyExpense.length > 0
                  ? [{ data: toDailyChartData(dailyExpense), color: COLORS.expense, name: "支出" }]
                  : []),
                ...(dailyNet.length > 0
                  ? [{ data: toDailyChartData(dailyNet), color: COLORS.net, name: "净收支" }]
                  : []),
              ]}
              height={200}
              valueFormatter={formatCurrencyCompact}
            />
          </CardContent>
        </Card>
      )}

      {/* C. Breakdown - Category Distribution (symmetric: left=income, right=expense) */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ArrowUpCircle className="h-4 w-4 text-green-500" aria-hidden="true" />
              收入 | 分类占比
            </CardTitle>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ArrowDownCircle className="h-4 w-4 text-red-500" aria-hidden="true" />
              支出 | 分类占比
            </CardTitle>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
      </div>

      {/* C. Breakdown - Account Distribution (symmetric: left=income, right=expense) */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ArrowUpCircle className="h-4 w-4 text-green-500" aria-hidden="true" />
              收入 | 按账户
            </CardTitle>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ArrowDownCircle className="h-4 w-4 text-red-500" aria-hidden="true" />
              支出 | 按账户
            </CardTitle>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
      </div>

      {/* D. Details - Top Expenses */}
      {topExpenses.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-500" aria-hidden="true" />
              大额支出
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
