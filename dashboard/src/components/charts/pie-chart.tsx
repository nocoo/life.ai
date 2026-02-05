import {
  PieChart as RechartsPieChart,
  Pie,
  Sector,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { PieSectorShapeProps } from "recharts";
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

const createPieSectorShape = (chartData: Array<{ fill: string }>) => {
  const PieSectorShape = (props: PieSectorShapeProps) => {
    const fill = chartData[props.index]?.fill ?? defaultColors[props.index % defaultColors.length];
    return <Sector {...props} fill={fill} />;
  };
  PieSectorShape.displayName = "PieSectorShape";
  return PieSectorShape;
};

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
  const sectorShape = createPieSectorShape(chartData);

  return (
    <div className={cn("w-full", className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
        <RechartsPieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={2}
            dataKey="value"
            shape={sectorShape}
            label={
              showLabels
                ? ({ name, percent }) =>
                    `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`
                : false
            }
            labelLine={showLabels}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const item = payload[0];
              const percent = total > 0 ? ((item.value as number) / total) * 100 : 0;
              return (
                <div className="rounded-lg border bg-background px-2 py-1.5 shadow-sm">
                  <div className="flex items-center gap-1.5">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: item.payload.fill }}
                      aria-hidden="true"
                    />
                    <span className="text-xs font-medium">{item.name}</span>
                  </div>
                  <div className="text-xs text-muted-foreground tabular-nums">
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
                <span className="text-xs text-muted-foreground">{value}</span>
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
