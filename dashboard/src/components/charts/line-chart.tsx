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
import {
  LineChart as BasaltLineChart,
  type LineChartNumericKeys,
} from "@nocoo/basalt/charts/line";
import type { ChartSeriesDescriptor } from "@nocoo/basalt/charts/series";
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
type BasaltPoint = {
  x: string;
  series0?: number;
  series1?: number;
  series2?: number;
  series3?: number;
  series4?: number;
  series5?: number;
  series6?: number;
  series7?: number;
};
type BasaltSeriesKey = LineChartNumericKeys<BasaltPoint> & string;
const BASALT_SERIES_KEYS = [
  "series0",
  "series1",
  "series2",
  "series3",
  "series4",
  "series5",
  "series6",
  "series7",
] as const satisfies readonly BasaltSeriesKey[];

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
  const labels = Array.from(
    new Set(normalizedSeries.flatMap((item) => item.data.map((point) => point.label))),
  );
  const insertionOrder = new Map(labels.map((label, index) => [label, index]));
  labels.sort((left, right) => {
    const directLeftDate = Date.parse(left);
    const directRightDate = Date.parse(right);
    const leftDate = Number.isFinite(directLeftDate)
      ? directLeftDate
      : Date.parse(`1 ${left} 2000`);
    const rightDate = Number.isFinite(directRightDate)
      ? directRightDate
      : Date.parse(`1 ${right} 2000`);
    if (Number.isFinite(leftDate) && Number.isFinite(rightDate)) return leftDate - rightDate;
    const numericOrder = left.localeCompare(right, undefined, { numeric: true });
    if (/\d/.test(left) && /\d/.test(right)) return numericOrder;
    return (insertionOrder.get(left) ?? 0) - (insertionOrder.get(right) ?? 0);
  });
  const valuesBySeries = normalizedSeries.map(
    (item) => new Map(item.data.map((point) => [point.label, point.value])),
  );
  const chartData = labels.map((label) => {
    const point: Record<string, string | number> = { name: label };
    normalizedSeries.forEach((s, si) => {
      const key = s.name || `series${si}`;
      const value = valuesBySeries[si].get(label);
      if (value !== undefined) point[key] = value;
    });
    return point;
  });
  const resolvedDataAlternative = dataAlternative ?? (
    <span className="sr-only">
      {labels
        .map((label) =>
          [
            label,
            ...normalizedSeries.map(
              (item, seriesIndex) =>
                `${item.name ?? `Series ${seriesIndex + 1}`}: ${
                  valuesBySeries[seriesIndex].has(label)
                    ? valueFormatter(valuesBySeries[seriesIndex].get(label)!)
                    : "—"
                }`,
            ),
          ].join(", "),
        )
        .join("; ")}
    </span>
  );

  if (
    normalizedSeries.length <= BASALT_SERIES_KEYS.length &&
    referenceLine === undefined &&
    !showArea &&
    !showDots &&
    curved &&
    showGrid &&
    showXAxis &&
    showYAxis
  ) {
    const valueAt = (seriesIndex: number, label: string) =>
      valuesBySeries[seriesIndex]?.get(label);
    const basaltData: BasaltPoint[] = labels.map((label) => ({
      x: label,
      ...(valueAt(0, label) === undefined ? {} : { series0: valueAt(0, label) }),
      ...(valueAt(1, label) === undefined ? {} : { series1: valueAt(1, label) }),
      ...(valueAt(2, label) === undefined ? {} : { series2: valueAt(2, label) }),
      ...(valueAt(3, label) === undefined ? {} : { series3: valueAt(3, label) }),
      ...(valueAt(4, label) === undefined ? {} : { series4: valueAt(4, label) }),
      ...(valueAt(5, label) === undefined ? {} : { series5: valueAt(5, label) }),
      ...(valueAt(6, label) === undefined ? {} : { series6: valueAt(6, label) }),
      ...(valueAt(7, label) === undefined ? {} : { series7: valueAt(7, label) }),
    }));
    const basaltSeries: Array<ChartSeriesDescriptor<BasaltSeriesKey>> =
      BASALT_SERIES_KEYS.slice(0, normalizedSeries.length).map((key, index) => ({
        key,
        label: normalizedSeries[index].name,
        color: normalizedSeries[index].color,
      }));

    return (
      <div className={cn("w-full", className)} style={{ height }}>
        <BasaltLineChart<BasaltPoint, BasaltSeriesKey>
          data={basaltData}
          series={basaltSeries}
          ariaLabel={ariaLabel}
          className="h-full w-full"
          showAxes
          showLegend={normalizedSeries.length > 1}
          valueFormatter={valueFormatter}
          summary={summary}
          dataAlternative={resolvedDataAlternative}
        />
      </div>
    );
  }

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
