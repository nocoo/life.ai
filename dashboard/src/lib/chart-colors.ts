/**
 * Chart color definitions for Recharts.
 *
 * Recharts uses SVG which doesn't support CSS custom properties in stroke/fill attributes.
 * These are fixed oklch color values that work well in both light and dark modes.
 *
 * Colors are chosen to be vibrant and distinguishable in both themes.
 */

/** Primary chart colors - work well in both light and dark modes */
export const chartColors = {
  /** Orange - primary accent */
  chart1: "oklch(0.7 0.18 50)",
  /** Teal/Cyan */
  chart2: "oklch(0.7 0.14 180)",
  /** Purple */
  chart3: "oklch(0.65 0.18 300)",
  /** Yellow/Gold */
  chart4: "oklch(0.8 0.16 85)",
  /** Pink/Magenta */
  chart5: "oklch(0.7 0.2 350)",
  /** Green */
  chart6: "oklch(0.7 0.16 145)",
  /** Blue */
  chart7: "oklch(0.65 0.18 250)",
  /** Red */
  chart8: "oklch(0.65 0.2 25)",
} as const;

/** Array of chart colors for easy iteration */
export const chartColorArray = [
  chartColors.chart1,
  chartColors.chart2,
  chartColors.chart3,
  chartColors.chart4,
  chartColors.chart5,
  chartColors.chart6,
  chartColors.chart7,
  chartColors.chart8,
] as const;

/** Get a chart color by index (wraps around) */
export function getChartColor(index: number): string {
  return chartColorArray[index % chartColorArray.length];
}
