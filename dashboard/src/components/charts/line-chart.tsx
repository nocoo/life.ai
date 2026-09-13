import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { cn } from "@/lib/utils";
import { CHART_COLORS, chartAxis } from "@/lib/palette";
import { ChartFrame } from "@nocoo/basalt/charts/frame";
import { ChartTooltipContent } from "@nocoo/basalt/charts/tooltip";
import type { ReactNode } from "react";

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
  ariaLabel: string;
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
  summary?: ReactNode;
  dataAlternative?: ReactNode;
}

const defaultColors = CHART_COLORS;

export function LineChart({
  ariaLabel,
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
  summary,
  dataAlternative,
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
  const resolvedDataAlternative = dataAlternative ?? (
    <span className="sr-only">
      {labels
        .map((label, index) =>
          [
            label,
            ...normalizedSeries.map(
              (item, seriesIndex) =>
                `${item.name ?? `Series ${seriesIndex + 1}`}: ${valueFormatter(item.data[index]?.value ?? 0)}`,
            ),
          ].join(", "),
        )
        .join("; ")}
    </span>
  );

  return (
    <div className={cn("w-full", className)} style={{ height }}>
      <ChartFrame
        ariaLabel={ariaLabel}
        className="h-full w-full"
        summary={summary}
        dataAlternative={resolvedDataAlternative}
      >
        <RechartsLineChart
          data={chartData}
          margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
        >
          {showGrid && (
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={chartAxis}
              strokeOpacity={0.15}
              vertical={false}
            />
          )}
          {showXAxis && (
            <XAxis
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={{ fill: chartAxis, fontSize: 11 }}
            />
          )}
          {showYAxis && (
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: chartAxis, fontSize: 11 }}
              tickFormatter={valueFormatter}
            />
          )}
          <Tooltip content={<ChartTooltipContent formatter={valueFormatter} />} />
          {referenceLine !== undefined && (
            <ReferenceLine
              y={referenceLine}
              stroke={chartAxis}
              strokeDasharray="3 3"
              label={
                referenceLineLabel
                  ? {
                      value: referenceLineLabel,
                      position: "insideTopRight",
                      className: "fill-basalt-muted-foreground text-xs",
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
      </ChartFrame>
    </div>
  );
}
