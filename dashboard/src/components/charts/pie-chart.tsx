import { DonutChart as BasaltDonutChart } from "@nocoo/basalt/charts/donut";
import type { ChartSeriesDescriptor } from "@nocoo/basalt/charts/series";
import { CHART_COLORS } from "@/lib/palette";

export interface DonutChartDataPoint {
  label: string;
  value: number;
  color?: string;
}

export interface DonutChartProps {
  data: DonutChartDataPoint[];
  height?: number;
  outerRadius?: number;
  showLegend?: boolean;
  showLabels?: boolean;
  valueFormatter?: (value: number) => string;
  className?: string;
}

export function DonutChart({
  data,
  height = 200,
  showLegend = false,
  valueFormatter = (value) => value.toLocaleString(),
  className,
}: DonutChartProps) {
  const series: ChartSeriesDescriptor[] = data.map((item, index) => ({
    key: item.label,
    label: item.label,
    color: item.color ?? CHART_COLORS[index % CHART_COLORS.length],
  }));

  return (
    <div className={className} style={{ height }}>
      <BasaltDonutChart
        data={data.map((item) => ({ name: item.label, value: item.value }))}
        series={series}
        ariaLabel="Distribution chart"
        className="h-full w-full"
        showLegend={showLegend}
        valueFormatter={valueFormatter}
      />
    </div>
  );
}
