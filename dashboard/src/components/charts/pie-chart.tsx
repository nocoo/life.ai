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
import { CHART_COLORS } from "@/lib/palette";

export interface PieChartDataPoint {
  label: string;
  value: number;
  color?: string;
}

export interface PieChartProps {
  data: PieChartDataPoint[];
  height?: number;
  innerRadius?: number;
  outerRadius?: number;
  showLegend?: boolean;
  showLabels?: boolean;
  valueFormatter?: (value: number) => string;
  className?: string;
}

const defaultColors = CHART_COLORS;

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

export function DonutChart(props: Omit<PieChartProps, "innerRadius">) {
  return <PieChart {...props} innerRadius={60} />;
}
