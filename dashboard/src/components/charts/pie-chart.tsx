import type { ReactNode } from "react";
import {
  Cell,
  Legend,
  Pie,
  PieChart as RechartsPieChart,
  Tooltip,
} from "recharts";
import { ChartFrame } from "@nocoo/basalt/charts/frame";
import { CHART_COLORS } from "@/lib/palette";

export interface DonutChartDataPoint {
  label: string;
  value: number;
  color?: string;
}

export interface DonutChartProps {
  ariaLabel: string;
  data: DonutChartDataPoint[];
  height?: number;
  outerRadius?: number;
  showLegend?: boolean;
  showLabels?: boolean;
  valueFormatter?: (value: number) => string;
  className?: string;
  summary?: ReactNode;
  dataAlternative?: ReactNode;
}

export function DonutChart({
  ariaLabel,
  data,
  height = 200,
  outerRadius = 80,
  showLegend = false,
  showLabels = false,
  valueFormatter = (value) => value.toLocaleString(),
  className,
  summary,
  dataAlternative,
}: DonutChartProps) {
  const chartData = data.map((item, index) => ({
    name: item.label,
    value: item.value,
    fill: item.color ?? CHART_COLORS[index % CHART_COLORS.length],
  }));
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const resolvedDataAlternative = dataAlternative ?? (
    <span className="sr-only">
      {data.map((item) => `${item.label}: ${valueFormatter(item.value)}`).join("; ")}
    </span>
  );

  return (
    <div className={className} style={{ height }}>
      <ChartFrame
        ariaLabel={ariaLabel}
        className="h-full w-full"
        summary={summary}
        dataAlternative={resolvedDataAlternative}
      >
        <RechartsPieChart>
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="name"
            innerRadius={60}
            outerRadius={outerRadius}
            paddingAngle={2}
            stroke="none"
            label={
              showLabels
                ? ({ name, percent }) =>
                    `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`
                : false
            }
            labelLine={showLabels}
          >
            {chartData.map((item) => (
              <Cell key={item.name} fill={item.fill} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const item = payload[0];
              const value = Number(item.value ?? 0);
              const percent = total > 0 ? (value / total) * 100 : 0;
              return (
                <div className="rounded-basalt-lg border border-basalt-border bg-basalt-popover p-2 text-basalt-popover-foreground shadow-sm">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: item.payload.fill }}
                    />
                    {item.name}
                  </div>
                  <div className="text-sm text-basalt-muted-foreground">
                    {valueFormatter(value)} ({percent.toFixed(1)}%)
                  </div>
                </div>
              );
            }}
          />
          {showLegend && (
            <Legend
              formatter={(value) => (
                <span className="text-sm text-basalt-muted-foreground">{value}</span>
              )}
            />
          )}
        </RechartsPieChart>
      </ChartFrame>
    </div>
  );
}
