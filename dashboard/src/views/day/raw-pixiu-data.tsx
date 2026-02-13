"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DayPixiuData } from "@/models/pixiu";

export interface RawPixiuDataProps {
  data: DayPixiuData;
}

/** Format amount to currency string */
const formatAmount = (amount: number, isIncome: boolean): string => {
  const sign = isIncome ? "+" : "-";
  return `${sign}¥${amount.toFixed(2)}`;
};

export function RawPixiuData({ data }: RawPixiuDataProps) {
  return (
    <div className="rounded-card bg-secondary p-4">
      <div className="text-sm font-normal text-muted-foreground mb-3">
        貔貅记账原始数据
      </div>
      <ScrollArea className="h-[calc(100vh-200px)]">
        <div className="space-y-6">
            {/* Summary Section */}
            {data.summary && (
              <div>
                <h3 className="text-sm font-normal text-muted-foreground mb-2">日收支概览</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-widget bg-card p-3">
                    <div className="text-xs text-muted-foreground">收入</div>
                    <div className="text-xl font-semibold font-display tracking-tight text-green-600">
                      +¥{data.summary.income.toFixed(2)}
                    </div>
                  </div>
                  <div className="rounded-widget bg-card p-3">
                    <div className="text-xs text-muted-foreground">支出</div>
                    <div className="text-xl font-semibold font-display tracking-tight text-red-500">
                      -¥{data.summary.expense.toFixed(2)}
                    </div>
                  </div>
                  <div className="rounded-widget bg-card p-3">
                    <div className="text-xs text-muted-foreground">净收入</div>
                    <div
                      className={`text-xl font-semibold font-display tracking-tight ${
                        data.summary.net >= 0 ? "text-green-600" : "text-red-500"
                      }`}
                    >
                      {data.summary.net >= 0 ? "+" : ""}¥
                      {data.summary.net.toFixed(2)}
                    </div>
                  </div>
                  <div className="rounded-widget bg-card p-3">
                    <div className="text-xs text-muted-foreground">交易笔数</div>
                    <div className="text-xl font-semibold font-display tracking-tight">
                      {data.summary.transactionCount}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Category Breakdown - Expense */}
            {data.expenseByCategory.length > 0 && (
              <div>
                <h3 className="text-sm font-normal text-muted-foreground mb-2">支出分类</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>分类</TableHead>
                      <TableHead className="text-right">金额</TableHead>
                      <TableHead className="text-right">笔数</TableHead>
                      <TableHead className="text-right">占比</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.expenseByCategory.map((cat) => (
                      <TableRow key={cat.category}>
                        <TableCell>
                          <Badge variant="secondary">{cat.category}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium text-red-500">
                          -¥{cat.amount.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {cat.count}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {cat.percentage.toFixed(1)}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Category Breakdown - Income */}
            {data.incomeByCategory.length > 0 && (
              <div>
                <h3 className="text-sm font-normal text-muted-foreground mb-2">收入分类</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>分类</TableHead>
                      <TableHead className="text-right">金额</TableHead>
                      <TableHead className="text-right">笔数</TableHead>
                      <TableHead className="text-right">占比</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.incomeByCategory.map((cat) => (
                      <TableRow key={cat.category}>
                        <TableCell>
                          <Badge variant="outline">{cat.category}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium text-green-600">
                          +¥{cat.amount.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {cat.count}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {cat.percentage.toFixed(1)}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Transactions Section */}
            {data.transactions.length > 0 && (
              <div>
                <h3 className="text-sm font-normal text-muted-foreground mb-2">
                  交易明细 ({data.transactions.length})
                </h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>时间</TableHead>
                      <TableHead>分类</TableHead>
                      <TableHead>账户</TableHead>
                      <TableHead className="text-right">金额</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.transactions.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell className="text-muted-foreground">
                          {tx.time}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-sm">{tx.categoryL2}</span>
                            <span className="text-xs text-muted-foreground">
                              {tx.categoryL1}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{tx.account}</Badge>
                        </TableCell>
                        <TableCell
                          className={`text-right font-medium ${
                            tx.isIncome ? "text-green-600" : "text-red-500"
                          }`}
                        >
                          {formatAmount(tx.amount, tx.isIncome)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Empty State */}
            {!data.summary && data.transactions.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                当天没有交易记录
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
  );
}
