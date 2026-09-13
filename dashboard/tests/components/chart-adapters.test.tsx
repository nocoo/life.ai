import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

const chartMocks = vi.hoisted(() => ({
  basaltLine: vi.fn(),
  basaltBar: vi.fn(),
  legacyLine: vi.fn(),
  legacyXAxis: vi.fn(),
  legacyYAxis: vi.fn(),
  pie: vi.fn(),
}));

vi.mock("@nocoo/basalt/charts/line", () => ({
  LineChart: (props: unknown) => {
    chartMocks.basaltLine(props);
    return <div data-testid="basalt-line" />;
  },
}));

vi.mock("@nocoo/basalt/charts/bar", () => ({
  BarChart: (props: unknown) => {
    chartMocks.basaltBar(props);
    return <div data-testid="basalt-bar" />;
  },
}));

vi.mock("@nocoo/basalt/charts/frame", () => ({
  ChartFrame: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => children,
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="legacy-line-chart">{children}</div>
  ),
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="legacy-bar-chart">{children}</div>
  ),
  PieChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Line: (props: unknown) => {
    chartMocks.legacyLine(props);
    return null;
  },
  Bar: () => null,
  Rectangle: () => null,
  CartesianGrid: () => null,
  ReferenceLine: () => null,
  XAxis: (props: unknown) => {
    chartMocks.legacyXAxis(props);
    return null;
  },
  YAxis: (props: unknown) => {
    chartMocks.legacyYAxis(props);
    return null;
  },
  Pie: ({ children, ...props }: { children: React.ReactNode }) => {
    chartMocks.pie(props);
    return <>{children}</>;
  },
  Cell: () => null,
  Legend: () => null,
  Tooltip: ({ content }: { content?: React.ReactNode | ((props: unknown) => React.ReactNode) }) =>
    typeof content === "function"
      ? content({
          active: true,
          payload: [{ name: "Walking", value: 25, payload: { fill: "blue" } }],
        })
      : content,
}));

import { BarChart } from "@/components/charts/bar-chart";
import { LineChart } from "@/components/charts/line-chart";
import { DonutChart } from "@/components/charts/pie-chart";

afterEach(() => {
  cleanup();
  Object.values(chartMocks).forEach((mock) => mock.mockClear());
});

describe("chart adapters", () => {
  test("passes every dynamic line series to Basalt", () => {
    const series = ["one", "two", "three", "four"].map((name, index) => ({
      name,
      data: [{ label: "Jan", value: index + 1 }],
    }));
    render(<LineChart ariaLabel="Four metrics" series={series} />);

    const props = chartMocks.basaltLine.mock.calls[0][0] as {
      data: Array<Record<string, number | string>>;
      series: Array<{ key: string }>;
      ariaLabel: string;
    };
    expect(props.series.map((item) => item.key)).toEqual([
      "series0",
      "series1",
      "series2",
      "series3",
    ]);
    expect(props.data[0].series3).toBe(4);
    expect(props.ariaLabel).toBe("Four metrics");
  });

  test("keeps the legacy line path when dots are requested", () => {
    render(
      <LineChart
        ariaLabel="Monthly workouts"
        data={[{ label: "Jan", value: 3 }]}
        showDots
      />,
    );
    expect(screen.getByTestId("legacy-line-chart")).toBeTruthy();
    expect(chartMocks.basaltLine).not.toHaveBeenCalled();
    expect(chartMocks.legacyLine.mock.calls[0][0]).toMatchObject({ dot: true });
  });

  test("keeps independent axis controls on the legacy bar path", () => {
    render(
      <BarChart
        ariaLabel="Records by table"
        data={[{ label: "workouts", value: 10 }]}
        showXAxis={false}
      />,
    );
    expect(screen.getByTestId("legacy-bar-chart")).toBeTruthy();
    expect(chartMocks.basaltBar).not.toHaveBeenCalled();
    expect(chartMocks.legacyXAxis).not.toHaveBeenCalled();
    expect(chartMocks.legacyYAxis).toHaveBeenCalledOnce();
  });

  test("preserves donut radius, labels, and percentage tooltip", () => {
    render(
      <DonutChart
        ariaLabel="Transport split"
        data={[
          { label: "Walking", value: 25 },
          { label: "Driving", value: 75 },
        ]}
        outerRadius={72}
        showLabels
      />,
    );
    const props = chartMocks.pie.mock.calls[0][0] as {
      outerRadius: number;
      label: unknown;
    };
    expect(props.outerRadius).toBe(72);
    expect(typeof props.label).toBe("function");
    expect(screen.getByText(/25\.0%/)).toBeTruthy();
  });
});
