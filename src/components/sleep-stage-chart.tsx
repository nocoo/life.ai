import { useId, useMemo, useState } from "react";
import type { SleepNight } from "../models/health-insights";
import { formatDurationMinutes, formatLocalClock } from "../viewmodels/format";
import { buildSleepStageChart } from "../viewmodels/sleep-stage-chart";

const ROW_HEIGHT = 72;
const dateClock = new Intl.DateTimeFormat("zh-CN", {
	month: "numeric",
	day: "numeric",
	hour: "2-digit",
	minute: "2-digit",
	hourCycle: "h23",
});

export function SleepStageChart({ night }: { night: SleepNight }) {
	const chart = useMemo(() => buildSleepStageChart(night.timeline), [night.timeline]);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const descriptionId = useId();
	if (!chart) return null;
	const selected = chart.segments.find((segment) => segment.id === selectedId);
	const describe = (segment: (typeof chart.segments)[number]) =>
		`${segment.label} · ${dateClock.format(segment.start)} — ${dateClock.format(segment.end)} · ${segment.minutes < 1 ? `${Math.max(1, Math.round(segment.minutes * 60))} 秒` : formatDurationMinutes(segment.minutes)}`;
	return (
		<figure className="health-sleep-chart">
			<div className="health-sleep-plot" style={{ height: chart.rows.length * ROW_HEIGHT }}>
				<svg
					className="health-sleep-grid"
					viewBox={`0 0 1000 ${chart.rows.length * ROW_HEIGHT}`}
					preserveAspectRatio="none"
					role="img"
					aria-label="睡眠阶段"
					aria-describedby={descriptionId}
				>
					<title>睡眠阶段</title>
					{chart.ticks.map((tick) => (
						<line
							key={tick.at}
							x1={tick.left * 10}
							x2={tick.left * 10}
							y1={0}
							y2={chart.rows.length * ROW_HEIGHT}
							className="health-sleep-gridline"
							vectorEffect="non-scaling-stroke"
						/>
					))}
					{chart.connections.map((connection) => (
						<line
							key={connection.id}
							x1={connection.left * 10}
							x2={connection.left * 10}
							y1={connection.from * ROW_HEIGHT + 46}
							y2={connection.to * ROW_HEIGHT + 46}
							className={`health-sleep-connection health-story-stage-${connection.kind}`}
							vectorEffect="non-scaling-stroke"
						/>
					))}
				</svg>
				{chart.rows.map((row) => (
					<div
						key={row.kind}
						className="health-sleep-row"
						style={{ height: ROW_HEIGHT }}
						aria-hidden="true"
					>
						<span>{row.label}</span>
					</div>
				))}
				{chart.segments.map((segment) => (
					<button
						key={segment.id}
						type="button"
						className={`health-sleep-segment health-story-stage-${segment.kind}`}
						data-sleep-stage={segment.kind}
						style={{
							left: `${segment.left}%`,
							width: `${segment.width}%`,
							top: segment.row * ROW_HEIGHT + 28,
						}}
						aria-label={describe(segment)}
						aria-pressed={selectedId === segment.id}
						onMouseEnter={() => setSelectedId(segment.id)}
						onFocus={() => setSelectedId(segment.id)}
						onClick={() => setSelectedId(segment.id)}
					/>
				))}
			</div>
			<div className="health-sleep-axis" aria-hidden="true">
				{chart.ticks.map((tick) => (
					<span key={tick.at} style={{ left: `${tick.left}%` }}>
						{formatLocalClock(tick.at, "hour")}
					</span>
				))}
			</div>
			<figcaption id={descriptionId} className="health-sleep-detail">
				{selected ? describe(selected) : "点选色块查看起止时间与时长；空白处没有睡眠阶段记录。"}
			</figcaption>
		</figure>
	);
}
