import { Button, DescriptionList, LayerCard, Text } from "@nocoo/basalt";
import { useState } from "react";
import {
	type BloodPressureReading,
	type EcgRecording,
	ecgWaveformWindow,
	type HealthMoment,
	type HealthStory,
	resolveEcgHertz,
	type SleepNight,
	type WorkoutGroup,
} from "../models/health-insights";
import { formatDurationMinutes, formatLocalClock } from "../viewmodels/format";
import { healthDimensionLabel } from "../viewmodels/health-format";
import "./health-story.css";

function clock(iso: string): string {
	return formatLocalClock(iso, "minute") ?? iso.slice(11, 16);
}

export function SleepStoryCard({ night }: { night: SleepNight | null }) {
	if (!night) return null;
	return (
		<LayerCard className="health-story-card">
			<LayerCard.Header>
				<Text as="h2" variant="heading" size="md">
					睡眠
				</Text>
				<Text as="p" size="sm" tone="muted" className="health-story-lede">
					这一夜，醒来后回看
				</Text>
			</LayerCard.Header>
			<LayerCard.Body>
				<dl className="health-story-times">
					<div>
						<dt>入睡</dt>
						<dd>
							<time dateTime={night.fellAsleepAt}>{clock(night.fellAsleepAt)}</time>
						</dd>
					</div>
					<div>
						<dt>起床</dt>
						<dd>
							<time dateTime={night.wokeAt}>{clock(night.wokeAt)}</time>
						</dd>
					</div>
				</dl>
				<DescriptionList columns={2}>
					<DescriptionList.Item term="实际睡眠">
						{formatDurationMinutes(night.asleepMinutes)}
					</DescriptionList.Item>
					<DescriptionList.Item term="在床">
						{night.inBedMinutes === null ? "未记录" : formatDurationMinutes(night.inBedMinutes)}
					</DescriptionList.Item>
					<DescriptionList.Item term="清醒">
						{night.awakeMinutes === null ? "未记录" : formatDurationMinutes(night.awakeMinutes)}
					</DescriptionList.Item>
				</DescriptionList>
				{night.timeline.length > 0 ? (
					<div className="health-story-hypnogram" role="img" aria-label="睡眠阶段">
						{night.timeline.map((segment) => {
							const origin = Date.parse(night.fellAsleepAt);
							const span = Math.max(Date.parse(night.wokeAt) - origin, 1);
							const start = Date.parse(segment.startAt) - origin;
							const width = Date.parse(segment.endAt) - Date.parse(segment.startAt);
							return (
								<span
									key={`${segment.eventId}:${segment.startAt}:${segment.kind}`}
									className={`health-story-stage-${segment.kind}`}
									style={{
										left: `${(start / span) * 100}%`,
										width: `${Math.max((width / span) * 100, 0)}%`,
									}}
									title={`${clock(segment.startAt)}–${clock(segment.endAt)} ${segment.label}`}
								/>
							);
						})}
					</div>
				) : null}
				<div className="health-sleep-legend">
					{night.stages.map((stage) => (
						<span key={stage.kind}>
							<i className={`health-story-stage-${stage.kind}`} />
							{stage.label} {formatDurationMinutes(stage.minutes)}
						</span>
					))}
				</div>
				<ul className="health-story-evidence">
					{night.evidence.map((item) => (
						<li key={item}>{item}</li>
					))}
				</ul>
			</LayerCard.Body>
		</LayerCard>
	);
}

export function HealthDayCard({ story }: { story: HealthStory }) {
	const { day } = story;
	if (!day.oxygen && !day.respiratory && !day.hrv && day.restingHeartRate === null) return null;
	return (
		<LayerCard className="health-story-card">
			<LayerCard.Header>
				<Text as="h2" variant="heading" size="md">
					身体信号
				</Text>
			</LayerCard.Header>
			<LayerCard.Body>
				<DescriptionList columns={2}>
					{day.oxygen ? (
						<DescriptionList.Item term="平均血氧">
							{day.oxygen.mean.toFixed(1)}%
							<Text as="span" size="xs" tone="muted">
								{" "}
								· {day.oxygen.samples} 次
							</Text>
						</DescriptionList.Item>
					) : null}
					{day.respiratory ? (
						<DescriptionList.Item term="呼吸频率">
							{day.respiratory.mean.toFixed(1)} 次/分
						</DescriptionList.Item>
					) : null}
					{day.hrv ? (
						<DescriptionList.Item term="心率变异性">
							{Math.round(day.hrv.mean)} ms
						</DescriptionList.Item>
					) : null}
					{day.restingHeartRate !== null ? (
						<DescriptionList.Item term="静息心率">
							{Math.round(day.restingHeartRate)} bpm
						</DescriptionList.Item>
					) : null}
				</DescriptionList>
			</LayerCard.Body>
		</LayerCard>
	);
}

export function HealthMomentCard({ moment }: { moment: HealthMoment }) {
	return (
		<article className="health-story-moment">
			<time dateTime={moment.occurredAt}>
				{clock(moment.occurredAt)}
				{moment.kind === "heartPeak" ? " · 测量时刻" : " · 这一小时"}
			</time>
			<Text as="h3" variant="heading" size="sm">
				{moment.title}
			</Text>
			<Text as="p" size="sm">
				{moment.detail}
			</Text>
			<ul className="health-story-evidence">
				{moment.evidence
					.filter((item) => item !== moment.detail)
					.map((item) => (
						<li key={item}>{item}</li>
					))}
			</ul>
		</article>
	);
}

export function WorkoutStoryCard({ group }: { group: WorkoutGroup }) {
	const { canonical, duplicates } = group;
	return (
		<article className="health-story-workout">
			<Text as="h3" variant="heading" size="sm">
				{canonical.title}
			</Text>
			<Text as="p" size="sm" tone="muted">
				{clock(canonical.startAt)}
				{canonical.endAt ? `–${clock(canonical.endAt)}` : ""} · {canonical.sourceName}
			</Text>
			<DescriptionList columns={2}>
				<DescriptionList.Item term="时长">
					{formatDurationMinutes(canonical.durationMinutes)}
				</DescriptionList.Item>
				<DescriptionList.Item term="距离">
					{canonical.distanceMeters === null ? "—" : `${Math.round(canonical.distanceMeters)} m`}
				</DescriptionList.Item>
				<DescriptionList.Item term="能量">
					{canonical.energyKcal === null ? "—" : `${Math.round(canonical.energyKcal)} kcal`}
				</DescriptionList.Item>
			</DescriptionList>
			{canonical.statistics.filter((item) => !/Distance|ActiveEnergyBurned/.test(item.type))
				.length > 0 ? (
				<ul className="health-story-evidence">
					{canonical.statistics
						.filter((item) => !/Distance|ActiveEnergyBurned/.test(item.type))
						.map((item) => (
							<li key={`${item.type}:${item.unit}`}>
								{healthDimensionLabel(item.type)} {Number(item.value.toFixed(1))}{" "}
								{item.unit === "count/min" && /HeartRate/.test(item.type) ? "bpm" : item.unit}
							</li>
						))}
				</ul>
			) : null}
			{duplicates.length > 0 ? (
				<p className="health-story-duplicates">
					同时保留 {duplicates.map((item) => item.sourceName).join("、")}{" "}
					的原始记录，未把重叠运动相加
				</p>
			) : null}
		</article>
	);
}

function pressureText(value: number | null): string {
	return value === null ? "未知" : String(Math.round(value));
}

export function BloodPressureCard({ reading }: { reading: BloodPressureReading }) {
	return (
		<article className="health-story-moment">
			<time dateTime={reading.occurredAt}>{clock(reading.occurredAt)}</time>
			<Text as="h3" variant="heading" size="sm">
				血压
			</Text>
			<dl className="health-pressure-reading">
				<div>
					<dt>收缩压</dt>
					<dd>{pressureText(reading.systolic)}</dd>
				</div>

				<div>
					<dt>舒张压</dt>
					<dd>
						{pressureText(reading.diastolic)} <span className="health-pressure-unit">mmHg</span>
					</dd>
				</div>
			</dl>
			<Text as="p" size="sm" tone="muted">
				{reading.sourceName}
			</Text>
			{reading.systolic === null || reading.diastolic === null ? (
				<Text as="p" size="sm" tone="muted">
					此次只有单侧读数
				</Text>
			) : null}
		</article>
	);
}

function EcgWaveform({
	window,
	hz,
	unit,
}: {
	window: NonNullable<ReturnType<typeof ecgWaveformWindow>>;
	hz: number;
	unit: string;
}) {
	const width = 360;
	const height = 148;
	const left = 52;
	const right = 12;
	const top = 10;
	const bottom = 28;
	const innerW = width - left - right;
	const innerH = height - top - bottom;
	const span = window.max - window.min || 1;
	const duration = Math.max(window.endSecond - window.startSecond, 1 / hz);
	const xAt = (second: number) => left + ((second - window.startSecond) / duration) * innerW;
	const yAt = (value: number) => top + innerH - ((value - window.min) / span) * innerH;
	const path = window.samples
		.map((value, index) => {
			const second = window.startSecond + index / hz;
			return `${index === 0 ? "M" : "L"}${xAt(second).toFixed(2)} ${yAt(value).toFixed(2)}`;
		})
		.join(" ");
	const ticks = [window.startSecond, (window.startSecond + window.endSecond) / 2, window.endSecond];
	const volts = [window.max, window.min];
	if (window.min < 0 && window.max > 0) volts.splice(1, 0, 0);
	return (
		<svg
			className="health-story-ecg"
			viewBox={`0 0 ${width} ${height}`}
			role="img"
			aria-label={`心电图 ${window.startSecond.toFixed(0)} 到 ${window.endSecond.toFixed(0)} 秒，纵轴 ${unit}，原始采样`}
		>
			{volts.map((value) => (
				<g key={`v-${value}`}>
					<line
						className="health-story-ecg-grid"
						x1={left}
						x2={left + innerW}
						y1={yAt(value)}
						y2={yAt(value)}
					/>
					<text className="health-story-ecg-axis" x={left - 6} y={yAt(value) + 3} textAnchor="end">
						{value.toFixed(0)}
					</text>
				</g>
			))}
			{ticks.map((second) => (
				<text
					key={`t-${second}`}
					className="health-story-ecg-axis"
					x={xAt(second)}
					y={height - 8}
					textAnchor="middle"
				>
					{second.toFixed(0)} s
				</text>
			))}
			<text className="health-story-ecg-axis" x={14} y={14}>
				{unit}
			</text>
			<path d={path} fill="none" stroke="currentColor" strokeWidth="1.1" />
		</svg>
	);
}

export function EcgStoryCard({
	ecg,
	waveform,
	samplingHz,
}: {
	ecg: EcgRecording;
	waveform?: number[];
	samplingHz?: number;
}) {
	const [page, setPage] = useState(0);
	const hz = resolveEcgHertz(
		samplingHz ?? ecg.samplingHz,
		waveform?.length ?? Number(ecg.sampleCount ?? 0),
		ecg.durationSeconds,
	);
	const slice = waveform && hz ? ecgWaveformWindow(waveform, hz, page) : null;
	const unit = ecg.unit?.trim() || "µV";
	return (
		<article className="health-story-moment">
			<time dateTime={ecg.occurredAt}>{clock(ecg.occurredAt)}</time>
			<Text as="h3" variant="heading" size="sm">
				心电图
			</Text>
			<DescriptionList columns={2}>
				<DescriptionList.Item term="设备分类">{ecg.classificationLabel}</DescriptionList.Item>
				<DescriptionList.Item term="平均心率">
					{ecg.averageHeartRate ? `${ecg.averageHeartRate} bpm` : "未知"}
				</DescriptionList.Item>
				<DescriptionList.Item term="时长">
					{ecg.durationSeconds ? `${ecg.durationSeconds} 秒` : "未知"}
				</DescriptionList.Item>
				<DescriptionList.Item term="采样">
					{hz ? `${hz} Hz` : "未知"}
					{ecg.sampleCount ? ` · ${ecg.sampleCount} 点` : ""}
				</DescriptionList.Item>
			</DescriptionList>
			{slice ? (
				<div className="health-story-ecg-wrap">
					<EcgWaveform
						window={slice}
						hz={slice.samples.length / Math.max(slice.endSecond - slice.startSecond, 1e-6)}
						unit={unit}
					/>
					<div className="health-story-ecg-nav">
						<Button
							variant="ghost"
							size="sm"
							disabled={slice.page <= 0}
							onClick={() => setPage((current) => current - 1)}
						>
							上一段
						</Button>
						<Text as="p" size="sm" tone="muted">
							{slice.startSecond.toFixed(0)}–{slice.endSecond.toFixed(0)} 秒 · 第 {slice.page + 1}/
							{slice.pages} 段
						</Text>
						<Button
							variant="ghost"
							size="sm"
							disabled={slice.page >= slice.pages - 1}
							onClick={() => setPage((current) => current + 1)}
						>
							下一段
						</Button>
					</div>
				</div>
			) : (
				<Text as="p" size="sm" tone="muted">
					{ecg.filePath ? "正在准备波形" : "没有波形附件"}
				</Text>
			)}
			<ul className="health-story-evidence">
				{ecg.evidence.map((item) => (
					<li key={item}>{item}</li>
				))}
			</ul>
		</article>
	);
}
