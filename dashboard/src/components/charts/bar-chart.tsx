import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Rectangle,
} from "recharts";
import type { BarShapeProps } from "recharts";
import { cn } from "@/lib/utils";
import { chart, chartAxis } from "@/lib/palette";
import { BarChart as BasaltBarChart } from "@nocoo/basalt/charts/bar";
import { ChartTooltipContent } from "@nocoo/basalt/charts/tooltip";
import type { ReactNode } from "react";

export interface BarChartDataPoint {
  label: string;
  value: number;
  color?: string;
}

export interface BarChartProps {
  ariaLabel: string;
  data: BarChartDataPoint[];
  height?: number;
  color?: string;
  showGrid?: boolean;
  showXAxis?: boolean;
  showYAxis?: boolean;
  horizontal?: boolean;
  valueFormatter?: (value: number) => string;
  className?: string;
  summary?: ReactNode;
  dataAlternative?: ReactNode;
}

const defaultColor = chart.primary;

const createBarShape = (chartData: Array<{ fill: string }>) => {
  const BarShape = (props: BarShapeProps) => {
    const fill = chartData[props.index]?.fill ?? defaultColor;
    return <Rectangle {...props} fill={fill} radius={[4, 4, 0, 0]} />;
  };
  BarShape.displayName = "BarShape";
  return BarShape;
};

export function BarChart({
  ariaLabel,
  data,
  height = 200,
  color = defaultColor,
  showGrid = true,
  showXAxis = true,
  showYAxis = true,
  horizontal = false,
  valueFormatter = (v) => v.toLocaleString(),
  className,
  summary,
  dataAlternative,
}: BarChartProps) {
  const chartData = data.map((d) => ({
    name: d.label,
    value: d.value,
    fill: d.color || color,
  }));
  const resolvedDataAlternative = dataAlternative ?? (
    <span className="sr-only">
      {data.map((item) => `${item.label}: ${valueFormatter(item.value)}`).join("; ")}
    </span>
  );

  if (
    !horizontal &&
    !data.some((item) => item.color) &&
    showGrid &&
    showXAxis &&
    showYAxis
  ) {
    return (
      <div className={cn("w-full", className)} style={{ height }}>
        <BasaltBarChart
          data={data.map((item) => ({ x: item.label, y: item.value }))}
          ariaLabel={ariaLabel}
          className="h-full w-full"
          color={color}
          showAxes
          valueFormatter={valueFormatter}
          summary={summary}
          dataAlternative={resolvedDataAlternative}
        />
      </div>
    );
  }

  const barShape = createBarShape(chartData);

  return (
    <figure className={cn("m-0 w-full", className)} aria-label={ariaLabel}>
      {summary && <figcaption className="mb-2 text-xs text-basalt-muted-foreground">{summary}</figcaption>}
      <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
        <RechartsBarChart
          data={chartData}
          layout={horizontal ? "vertical" : "horizontal"}
          margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
          accessibilityLayer
          aria-label={ariaLabel}
        >
          {showGrid && (
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={chartAxis}
              strokeOpacity={0.15}
              vertical={!horizontal}
              horizontal={horizontal}
            />
          )}
          {horizontal ? (
            <>
              {showYAxis && (
                <YAxis
                  dataKey="name"
                  type="category"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: chartAxis, fontSize: 11 }}
                  width={80}
                />
              )}
              {showXAxis && (
                <XAxis
                  type="number"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: chartAxis, fontSize: 11 }}
                  tickFormatter={valueFormatter}
                />
              )}
            </>
          ) : (
            <>
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
            </>
          )}
          <Tooltip content={<ChartTooltipContent formatter={valueFormatter} />} />
          <Bar dataKey="value" shape={barShape} />
        </RechartsBarChart>
      </ResponsiveContainer>
      </div>
      <div className="mt-2 text-xs text-basalt-muted-foreground">{resolvedDataAlternative}</div>
    </figure>
  );
}
