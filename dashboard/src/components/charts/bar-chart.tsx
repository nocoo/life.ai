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
import { chartColors } from "@/lib/chart-colors";

export interface BarChartDataPoint {
  label: string;
  value: number;
  color?: string;
}

export interface BarChartProps {
  /** Chart data */
  data: BarChartDataPoint[];
  /** Chart height in pixels */
  height?: number;
  /** Bar color (can be overridden per data point) */
  color?: string;
  /** Show grid lines */
  showGrid?: boolean;
  /** Show X axis */
  showXAxis?: boolean;
  /** Show Y axis */
  showYAxis?: boolean;
  /** Horizontal layout */
  horizontal?: boolean;
  /** Value formatter for tooltip */
  valueFormatter?: (value: number) => string;
  /** Additional class name */
  className?: string;
}

const defaultColor = chartColors.chart1;

const createBarShape = (chartData: Array<{ fill: string }>) => {
  const BarShape = (props: BarShapeProps) => {
    const fill = chartData[props.index]?.fill ?? defaultColor;
    return <Rectangle {...props} fill={fill} radius={[4, 4, 0, 0]} />;
  };
  BarShape.displayName = "BarShape";
  return BarShape;
};

export function BarChart({
  data,
  height = 200,
  color = defaultColor,
  showGrid = true,
  showXAxis = true,
  showYAxis = true,
  horizontal = false,
  valueFormatter = (v) => v.toLocaleString(),
  className,
}: BarChartProps) {
  const chartData = data.map((d) => ({
    name: d.label,
    value: d.value,
    fill: d.color || color,
  }));

  const barShape = createBarShape(chartData);

  return (
    <div className={cn("w-full", className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
        <RechartsBarChart
          data={chartData}
          layout={horizontal ? "vertical" : "horizontal"}
          margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
        >
          {showGrid && (
            <CartesianGrid
              strokeDasharray="3 3"
              className="stroke-muted"
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
                  tick={{ fontSize: 10 }}
                  className="fill-muted-foreground"
                  width={80}
                />
              )}
              {showXAxis && (
                <XAxis
                  type="number"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10 }}
                  className="fill-muted-foreground"
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
                  tick={{ fontSize: 10 }}
                  className="fill-muted-foreground"
                />
              )}
              {showYAxis && (
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10 }}
                  className="fill-muted-foreground"
                  tickFormatter={valueFormatter}
                />
              )}
            </>
          )}
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const item = payload[0];
              return (
                <div className="rounded-lg border bg-background px-2 py-1.5 shadow-sm">
                  <div className="text-xs font-medium">{item.payload.name}</div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {valueFormatter(item.value as number)}
                  </div>
                </div>
              );
            }}
          />
          <Bar dataKey="value" shape={barShape} />
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  );
}
