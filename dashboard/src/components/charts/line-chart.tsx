"use client";

import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { cn } from "@/lib/utils";

export interface LineChartDataPoint {
  label: string;
  value: number;
}

export interface LineChartSeries {
  data: LineChartDataPoint[];
  color?: string;
  name?: string;
}

export interface LineChartProps {
  /** Single series data (use this or series, not both) */
  data?: LineChartDataPoint[];
  /** Multiple series (use this or data, not both) */
  series?: LineChartSeries[];
  /** Chart height in pixels */
  height?: number;
  /** Line color (for single series) */
  color?: string;
  /** Show grid lines */
  showGrid?: boolean;
  /** Show X axis */
  showXAxis?: boolean;
  /** Show Y axis */
  showYAxis?: boolean;
  /** Show dots on line */
  showDots?: boolean;
  /** Curved line */
  curved?: boolean;
  /** Show area fill under line */
  showArea?: boolean;
  /** Reference line value (horizontal) */
  referenceLine?: number;
  /** Reference line label */
  referenceLineLabel?: string;
  /** Value formatter for tooltip */
  valueFormatter?: (value: number) => string;
  /** Additional class name */
  className?: string;
}

const defaultColors = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export function LineChart({
  data,
  series,
  height = 200,
  color = defaultColors[0],
  showGrid = true,
  showXAxis = true,
  showYAxis = true,
  showDots = false,
  curved = true,
  showArea = false,
  referenceLine,
  referenceLineLabel,
  valueFormatter = (v) => v.toLocaleString(),
  className,
}: LineChartProps) {
  // Normalize data to multi-series format
  const normalizedSeries: LineChartSeries[] = series
    ? series
    : data
      ? [{ data, color, name: "value" }]
      : [];

  if (normalizedSeries.length === 0) {
    return null;
  }

  // Build unified data array for recharts
  const labels = normalizedSeries[0].data.map((d) => d.label);
  const chartData = labels.map((label, i) => {
    const point: Record<string, string | number> = { name: label };
    normalizedSeries.forEach((s, si) => {
      const key = s.name || `series${si}`;
      point[key] = s.data[i]?.value ?? 0;
    });
    return point;
  });

  return (
    <div className={cn("w-full", className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsLineChart
          data={chartData}
          margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
        >
          {showGrid && (
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          )}
          {showXAxis && (
            <XAxis
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12 }}
              className="fill-muted-foreground"
            />
          )}
          {showYAxis && (
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12 }}
              className="fill-muted-foreground"
              tickFormatter={valueFormatter}
            />
          )}
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="rounded-lg border bg-background p-2 shadow-sm">
                  <div className="text-sm font-medium">{label}</div>
                  {payload.map((item, i) => (
                    <div
                      key={i}
                      className="text-sm text-muted-foreground flex items-center gap-2"
                    >
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span>{valueFormatter(item.value as number)}</span>
                    </div>
                  ))}
                </div>
              );
            }}
          />
          {referenceLine !== undefined && (
            <ReferenceLine
              y={referenceLine}
              stroke="hsl(var(--muted-foreground))"
              strokeDasharray="3 3"
              label={
                referenceLineLabel
                  ? {
                      value: referenceLineLabel,
                      position: "insideTopRight",
                      className: "fill-muted-foreground text-xs",
                    }
                  : undefined
              }
            />
          )}
          {normalizedSeries.map((s, i) => {
            const key = s.name || `series${i}`;
            const lineColor = s.color || defaultColors[i % defaultColors.length];
            return (
              <Line
                key={key}
                type={curved ? "monotone" : "linear"}
                dataKey={key}
                stroke={lineColor}
                fill={showArea ? lineColor : "none"}
                fillOpacity={showArea ? 0.1 : 0}
                strokeWidth={2}
                dot={showDots}
                activeDot={{ r: 4 }}
              />
            );
          })}
        </RechartsLineChart>
      </ResponsiveContainer>
    </div>
  );
}
