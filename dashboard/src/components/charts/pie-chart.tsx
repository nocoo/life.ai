"use client";

import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { cn } from "@/lib/utils";
import { chartColorArray } from "@/lib/chart-colors";

export interface PieChartDataPoint {
  label: string;
  value: number;
  color?: string;
}

export interface PieChartProps {
  /** Chart data */
  data: PieChartDataPoint[];
  /** Chart height in pixels */
  height?: number;
  /** Inner radius for donut chart (0 = pie, >0 = donut) */
  innerRadius?: number;
  /** Outer radius */
  outerRadius?: number;
  /** Show legend */
  showLegend?: boolean;
  /** Show labels on slices */
  showLabels?: boolean;
  /** Value formatter for tooltip */
  valueFormatter?: (value: number) => string;
  /** Additional class name */
  className?: string;
}

const defaultColors = chartColorArray;

export function PieChart({
  data,
  height = 200,
  innerRadius = 0,
  outerRadius = 80,
  showLegend = false,
  showLabels = false,
  valueFormatter = (v) => v.toLocaleString(),
  className,
}: PieChartProps) {
  const chartData = data.map((d, i) => ({
    name: d.label,
    value: d.value,
    fill: d.color || defaultColors[i % defaultColors.length],
  }));

  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className={cn("w-full", className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsPieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={2}
            dataKey="value"
            label={
              showLabels
                ? ({ name, percent }) =>
                    `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`
                : false
            }
            labelLine={showLabels}
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const item = payload[0];
              const percent = total > 0 ? ((item.value as number) / total) * 100 : 0;
              return (
                <div className="rounded-lg border bg-background p-2 shadow-sm">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: item.payload.fill }}
                    />
                    <span className="text-sm font-medium">{item.name}</span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {valueFormatter(item.value as number)} ({percent.toFixed(1)}%)
                  </div>
                </div>
              );
            }}
          />
          {showLegend && (
            <Legend
              layout="horizontal"
              verticalAlign="bottom"
              align="center"
              formatter={(value) => (
                <span className="text-sm text-muted-foreground">{value}</span>
              )}
            />
          )}
        </RechartsPieChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Donut chart is just a PieChart with innerRadius */
export function DonutChart(props: Omit<PieChartProps, "innerRadius">) {
  return <PieChart {...props} innerRadius={60} />;
}
