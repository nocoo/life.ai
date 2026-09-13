import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

const chartMocks = vi.hoisted(() => ({
  basaltLine: vi.fn(),
  basaltBar: vi.fn(),
  legacyLine: vi.fn(),
  legacyXAxis: vi.fn(),
  legacyYAxis: vi.fn(),
  pie: vi.fn(),
  referenceLine: vi.fn(),
  legend: vi.fn(),
  tooltipActive: true,
  tooltipPayload: [{ name: "Walking", value: 25, payload: { fill: "blue" } }] as Array<{
    name: string;
    value?: number;
    payload: { fill: string };
  }>,
}));

vi.mock("@nocoo/basalt/charts/line", () => ({
  LineChart: (props: { dataAlternative?: React.ReactNode }) => {
    chartMocks.basaltLine(props);
    return (
      <div data-testid="basalt-line">
        {props.dataAlternative}
      </div>
    );
  },
}));

vi.mock("@nocoo/basalt/charts/bar", () => ({
  BarChart: (props: unknown) => {
    chartMocks.basaltBar(props);
    return <div data-testid="basalt-bar" />;
  },
}));

vi.mock("@nocoo/basalt/charts/frame", () => ({
  ChartFrame: ({
    children,
    dataAlternative,
  }: {
    children: React.ReactNode;
    dataAlternative?: React.ReactNode;
  }) => (
    <>
      {children}
      {dataAlternative}
    </>
  ),
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
  Bar: ({ shape }: { shape?: (props: { index: number }) => React.ReactNode }) => (
    <>
      {shape?.({ index: 0 })}
      {shape?.({ index: 99 })}
    </>
  ),
  Rectangle: () => null,
  CartesianGrid: () => null,
  ReferenceLine: (props: unknown) => {
    chartMocks.referenceLine(props);
    return null;
  },
  XAxis: (props: unknown) => {
    chartMocks.legacyXAxis(props);
    return null;
  },
  YAxis: (props: unknown) => {
    chartMocks.legacyYAxis(props);
    return null;
  },
  Pie: ({
    children,
    label,
    ...props
  }: {
    children: React.ReactNode;
    label?: false | ((props: { name: string; percent?: number }) => React.ReactNode);
  }) => {
    chartMocks.pie({ ...props, label });
    return (
      <>
        {children}
        {typeof label === "function" ? label({ name: "Walking" }) : null}
      </>
    );
  },
  Cell: () => null,
  Legend: (props: unknown) => {
    chartMocks.legend(props);
    return null;
  },
  Tooltip: ({ content }: { content?: React.ReactNode | ((props: unknown) => React.ReactNode) }) =>
    typeof content === "function"
      ? content({
          active: chartMocks.tooltipActive,
          payload: chartMocks.tooltipPayload,
        })
      : content,
}));

import { BarChart } from "@/components/charts/bar-chart";
import { LineChart } from "@/components/charts/line-chart";
import { DonutChart } from "@/components/charts/pie-chart";

afterEach(() => {
  cleanup();
  Object.values(chartMocks).forEach((mock) => {
    if (typeof mock === "function" && "mockClear" in mock) mock.mockClear();
  });
  chartMocks.tooltipActive = true;
  chartMocks.tooltipPayload = [
    { name: "Walking", value: 25, payload: { fill: "blue" } },
  ];
});

describe("chart adapters", () => {
  test("renders every dynamic line series with labeled alternatives", () => {
    const series = ["one", "two", "three", "four"].map((name, index) => ({
      name,
      data: [{ label: "Jan", value: index + 1 }],
    }));
    render(<LineChart ariaLabel="Four metrics" series={series} />);

    const props = chartMocks.basaltLine.mock.calls[0][0] as {
      data: Array<Record<string, number | string>>;
      series: Array<{ key: string }>;
    };
    expect(props.series.map((item) => item.key)).toEqual([
      "series0",
      "series1",
      "series2",
      "series3",
    ]);
    expect(props.data[0].series3).toBe(4);
    expect(screen.getByText(/Jan, one: 1, two: 2, three: 3, four: 4/)).toBeTruthy();
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

  test("uses Basalt for a standard bar chart", () => {
    render(
      <BarChart
        ariaLabel="Daily steps"
        data={[{ label: "Mon", value: 1000 }]}
      />,
    );
    expect(screen.getByTestId("basalt-bar")).toBeTruthy();
    expect(chartMocks.basaltBar.mock.calls[0][0]).toMatchObject({
      ariaLabel: "Daily steps",
      showAxes: true,
    });
  });

  test("renders no line chart without data", () => {
    const { container } = render(<LineChart ariaLabel="Empty trend" />);
    expect(container.firstChild).toBeNull();
  });

  test("uses Basalt for a standard single-series line", () => {
    render(
      <LineChart
        ariaLabel="Daily distance"
        data={[{ label: "Mon", value: 12 }]}
      />,
    );
    const props = chartMocks.basaltLine.mock.calls[0][0] as {
      data: Array<Record<string, number | string>>;
      series: Array<{ key: string }>;
    };
    expect(props.series).toHaveLength(1);
    expect(props.data[0]).toEqual({ x: "Mon", series0: 12 });
  });

  test("preserves custom line presentation and reference lines", () => {
    render(
      <LineChart
        ariaLabel="Custom trend"
        data={[{ label: "Jan", value: 5 }]}
        color="purple"
        curved={false}
        showArea
        showDots
        showGrid={false}
        showXAxis={false}
        showYAxis={false}
        referenceLine={4}
        dataAlternative={<span>Custom data</span>}
      />,
    );
    expect(chartMocks.legacyXAxis).not.toHaveBeenCalled();
    expect(chartMocks.legacyYAxis).not.toHaveBeenCalled();
    expect(chartMocks.legacyLine.mock.calls[0][0]).toMatchObject({
      type: "linear",
      fill: "purple",
      dot: true,
    });
    expect(chartMocks.referenceLine.mock.calls[0][0]).toMatchObject({ label: undefined });
    expect(screen.getByText("Custom data")).toBeTruthy();
  });

  test("labels a line reference and missing series names", () => {
    render(
      <LineChart
        ariaLabel="Average trend"
        series={[
          { data: [{ label: "Jan", value: 5 }] },
          { name: "Target", color: "orange", data: [] },
        ]}
        referenceLine={4}
        referenceLineLabel="Average"
      />,
    );
    expect(chartMocks.referenceLine.mock.calls[0][0]).toMatchObject({
      label: expect.objectContaining({ value: "Average" }),
    });
    expect(screen.getByText(/Series 1: 5, Target: 0/)).toBeTruthy();
  });

  test("falls back safely when a line has more than eight series", () => {
    const series = Array.from({ length: 9 }, (_, index) => ({
      name: `Metric ${index}`,
      data: [{ label: "Jan", value: index }],
    }));
    render(<LineChart ariaLabel="Nine metrics" series={series} />);
    expect(chartMocks.basaltLine).not.toHaveBeenCalled();
    expect(chartMocks.legacyLine).toHaveBeenCalledTimes(9);
  });

  test("preserves horizontal bars and per-point colors", () => {
    render(
      <BarChart
        ariaLabel="Accounts"
        data={[{ label: "Cash", value: 10, color: "red" }]}
        horizontal
        showGrid={false}
      />,
    );
    expect(screen.getByTestId("legacy-bar-chart")).toBeTruthy();
    expect(chartMocks.legacyXAxis).toHaveBeenCalledOnce();
    expect(chartMocks.legacyYAxis).toHaveBeenCalledOnce();
  });

  test("supports a zero-total donut and inactive tooltip", () => {
    chartMocks.tooltipPayload = [
      { name: "None", value: undefined, payload: { fill: "gray" } },
    ];
    render(
      <DonutChart
        ariaLabel="Empty split"
        data={[{ label: "None", value: 0, color: "gray" }]}
        showLegend
        dataAlternative={<span>No distribution</span>}
      />,
    );
    expect(chartMocks.legend).toHaveBeenCalledOnce();
    expect(screen.getByText("No distribution")).toBeTruthy();
    expect(screen.getByText(/0\.0%/)).toBeTruthy();
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
