import { Button, DescriptionList, LayerCard, Text } from "@nocoo/basalt";
import {
	Activity,
	ArrowDown,
	ArrowUp,
	BedDouble,
	Bike,
	ChevronLeft,
	ChevronRight,
	Droplets,
	Dumbbell,
	Eye,
	Flame,
	Footprints,
	Gauge,
	Heart,
	HeartPulse,
	type LucideIcon,
	Moon,
	MoonStar,
	Mountain,
	MoveUpRight,
	PersonStanding,
	Route,
	SquareActivity,
	Sunrise,
	Timer,
	Watch,
	Waves,
	Wind,
} from "lucide-react";
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
import { StoryCardHeading, StoryMetricLabel } from "./story-card-heading";
import { StoryCardInfo } from "./story-card-info";
import "./health-story.css";

const MOMENT_ICONS = { heartPeak: HeartPulse, walk: Footprints, climb: MoveUpRight };
const WORKOUT_ICONS: Record<string, LucideIcon> = {
	Walking: Footprints,
	Running: Footprints,
	Cycling: Bike,
	Swimming: Waves,
	TraditionalStrengthTraining: Dumbbell,
	FunctionalStrengthTraining: Dumbbell,
	Yoga: PersonStanding,
	Hiking: Mountain,
};

function clock(iso: string): string {
	return formatLocalClock(iso, "minute") ?? iso.slice(11, 16);
}

export function SleepStoryCard({ night }: { night: SleepNight | null }) {
	if (!night) return null;
	return (
		<LayerCard className="health-story-card story-card story-sleep">
			<StoryCardInfo label="睡眠" notes={night.evidence} />
			<LayerCard.Header>
				<StoryCardHeading icon={MoonStar} title="睡眠" subtitle="这一夜，醒来后回看" />
			</LayerCard.Header>
			<LayerCard.Body>
				<dl className="health-story-times">
					<div>
						<dt>
							<StoryMetricLabel icon={Moon}>入睡</StoryMetricLabel>
						</dt>
						<dd>
							<time dateTime={night.fellAsleepAt}>{clock(night.fellAsleepAt)}</time>
						</dd>
					</div>
					<div>
						<dt>
							<StoryMetricLabel icon={Sunrise}>起床</StoryMetricLabel>
						</dt>
						<dd>
							<time dateTime={night.wokeAt}>{clock(night.wokeAt)}</time>
						</dd>
					</div>
				</dl>
				<DescriptionList columns={2}>
					<DescriptionList.Item
						term={<StoryMetricLabel icon={MoonStar}>实际睡眠</StoryMetricLabel>}
					>
						{formatDurationMinutes(night.asleepMinutes)}
					</DescriptionList.Item>
					<DescriptionList.Item term={<StoryMetricLabel icon={BedDouble}>在床</StoryMetricLabel>}>
						{night.inBedMinutes === null ? "未记录" : formatDurationMinutes(night.inBedMinutes)}
					</DescriptionList.Item>
					<DescriptionList.Item term={<StoryMetricLabel icon={Eye}>清醒</StoryMetricLabel>}>
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
			</LayerCard.Body>
		</LayerCard>
	);
}

export function HealthDayCard({ story }: { story: HealthStory }) {
	const { day } = story;
	if (!day.oxygen && !day.respiratory && !day.hrv && day.restingHeartRate === null) return null;
	return (
		<LayerCard className="health-story-card story-card story-vitals">
			<StoryCardInfo
				label="身体信号"
				notes={[
					"来自 Apple 健康；同一时段的重叠设备采样不会重复累计。",
					...[day.oxygen, day.respiratory, day.hrv].flatMap((metric) =>
						metric ? [`${metric.label}：${metric.samples} 次测量`] : [],
					),
				]}
			/>
			<LayerCard.Header>
				<StoryCardHeading icon={Activity} title="身体信号" subtitle="这一天的生理测量" />
			</LayerCard.Header>
			<LayerCard.Body>
				<DescriptionList columns={2}>
					{day.oxygen ? (
						<DescriptionList.Item
							term={<StoryMetricLabel icon={Droplets}>平均血氧</StoryMetricLabel>}
						>
							{day.oxygen.mean.toFixed(1)}%
						</DescriptionList.Item>
					) : null}
					{day.respiratory ? (
						<DescriptionList.Item term={<StoryMetricLabel icon={Wind}>呼吸频率</StoryMetricLabel>}>
							{day.respiratory.mean.toFixed(1)} 次/分
						</DescriptionList.Item>
					) : null}
					{day.hrv ? (
						<DescriptionList.Item
							term={<StoryMetricLabel icon={Activity}>心率变异性</StoryMetricLabel>}
						>
							{Math.round(day.hrv.mean)} ms
						</DescriptionList.Item>
					) : null}
					{day.restingHeartRate !== null ? (
						<DescriptionList.Item term={<StoryMetricLabel icon={Heart}>静息心率</StoryMetricLabel>}>
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
			<StoryCardInfo
				label={moment.title}
				notes={moment.evidence.filter((item) => item !== moment.detail)}
			/>
			<StoryCardHeading icon={MOMENT_ICONS[moment.kind]} title={moment.title} as="h3" />
			<time dateTime={moment.occurredAt}>
				{clock(moment.occurredAt)}
				{moment.kind === "heartPeak" ? " · 测量时刻" : " · 这一小时"}
			</time>
			<Text as="p" size="sm">
				{moment.detail}
			</Text>
		</article>
	);
}

export function WorkoutStoryCard({ group }: { group: WorkoutGroup }) {
	const { canonical, duplicates } = group;
	return (
		<article className="health-story-workout">
			<StoryCardInfo
				label={canonical.title}
				notes={[
					`来源：${canonical.sourceName}`,
					...(duplicates.length
						? [
								`同时保留 ${duplicates.map((item) => item.sourceName).join("、")} 的原始记录，未把重叠运动相加`,
							]
						: []),
				]}
			/>
			<StoryCardHeading
				icon={WORKOUT_ICONS[canonical.activity.replace(/^HKWorkoutActivityType/, "")] ?? Dumbbell}
				title={canonical.title}
				as="h3"
				subtitle={
					<>
						{clock(canonical.startAt)}
						{canonical.endAt ? `–${clock(canonical.endAt)}` : ""}
					</>
				}
			/>
			<DescriptionList columns={2}>
				<DescriptionList.Item term={<StoryMetricLabel icon={Timer}>时长</StoryMetricLabel>}>
					{formatDurationMinutes(canonical.durationMinutes)}
				</DescriptionList.Item>
				<DescriptionList.Item term={<StoryMetricLabel icon={Route}>距离</StoryMetricLabel>}>
					{canonical.distanceMeters === null ? "—" : `${Math.round(canonical.distanceMeters)} m`}
				</DescriptionList.Item>
				<DescriptionList.Item term={<StoryMetricLabel icon={Flame}>能量</StoryMetricLabel>}>
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
								<StoryMetricLabel icon={/HeartRate/.test(item.type) ? HeartPulse : Activity}>
									{healthDimensionLabel(item.type)}
								</StoryMetricLabel>{" "}
								{Number(item.value.toFixed(1))}{" "}
								{item.unit === "count/min" && /HeartRate/.test(item.type) ? "bpm" : item.unit}
							</li>
						))}
				</ul>
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
			<StoryCardInfo label="血压" notes={[`来源：${reading.sourceName}`, ...reading.evidence]} />
			<StoryCardHeading icon={Gauge} title="血压" subtitle="一次血压测量" as="h3" />
			<time dateTime={reading.occurredAt}>{clock(reading.occurredAt)}</time>
			<dl className="health-pressure-reading">
				<div>
					<dt>
						<StoryMetricLabel icon={ArrowUp}>收缩压</StoryMetricLabel>
					</dt>
					<dd>{pressureText(reading.systolic)}</dd>
				</div>

				<div>
					<dt>
						<StoryMetricLabel icon={ArrowDown}>舒张压</StoryMetricLabel>
					</dt>
					<dd>
						{pressureText(reading.diastolic)} <span className="health-pressure-unit">mmHg</span>
					</dd>
				</div>
			</dl>
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
			<StoryCardInfo label="心电图" notes={ecg.evidence} />
			<StoryCardHeading
				icon={SquareActivity}
				title="心电图"
				subtitle="一次心电测量 · 原始波形"
				as="h3"
			/>
			<time dateTime={ecg.occurredAt}>{clock(ecg.occurredAt)}</time>
			<DescriptionList columns={2}>
				<DescriptionList.Item term={<StoryMetricLabel icon={Watch}>设备分类</StoryMetricLabel>}>
					{ecg.classificationLabel}
				</DescriptionList.Item>
				<DescriptionList.Item
					term={<StoryMetricLabel icon={HeartPulse}>平均心率</StoryMetricLabel>}
				>
					{ecg.averageHeartRate ? `${ecg.averageHeartRate} bpm` : "未知"}
				</DescriptionList.Item>
				<DescriptionList.Item term={<StoryMetricLabel icon={Timer}>时长</StoryMetricLabel>}>
					{ecg.durationSeconds ? `${ecg.durationSeconds} 秒` : "未知"}
				</DescriptionList.Item>
				<DescriptionList.Item term={<StoryMetricLabel icon={Activity}>采样</StoryMetricLabel>}>
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
							<ChevronLeft size={14} aria-hidden="true" />
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
							<ChevronRight size={14} aria-hidden="true" />
						</Button>
					</div>
				</div>
			) : (
				<Text as="p" size="sm" tone="muted">
					{ecg.filePath ? "正在准备波形" : "没有波形附件"}
				</Text>
			)}
		</article>
	);
}
