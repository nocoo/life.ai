import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
	DescriptionList,
	LayerCard,
	Text,
} from "@nocoo/basalt";
import { Banner } from "@nocoo/basalt/components/banner";
import {
	BellRing,
	ClipboardList,
	HeartPulse,
	type LucideIcon,
	MapPin,
	MoonStar,
	Ruler,
	Scale,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "zustand";
import { formatLocalClock } from "../viewmodels/format";
import { createHealthEvidenceStore } from "../viewmodels/health-evidence-view-model";
import { type HealthTimelineItem, routeMapInsights } from "../viewmodels/health-timeline";
import type { TimelineMapMode } from "../viewmodels/timeline-view-model";
import { DayMap } from "./day-map";
import {
	BloodPressureCard,
	EcgStoryCard,
	HealthMomentCard,
	SleepStoryCard,
	WorkoutStoryCard,
} from "./health-story";
import { StoryCardHeading } from "./story-card-heading";
import { StoryCardInfo } from "./story-card-info";

const OBSERVATION_ICONS: Record<string, LucideIcon> = {
	体重: Scale,
	身体质量指数: Scale,
	去脂体重: Scale,
	身高: Ruler,
	高心率提醒: HeartPulse,
	低心率提醒: HeartPulse,
	心律不齐提醒: HeartPulse,
	心肺适能提醒: HeartPulse,
	环境声音提醒: BellRing,
	耳机声音提醒: BellRing,
};

function WorkoutEntry({
	item,
	mode,
}: {
	item: Extract<HealthTimelineItem, { kind: "workout" }>;
	mode: TimelineMapMode;
}) {
	const [store] = useState(createHealthEvidenceStore);
	const state = useStore(store);
	const [open, setOpen] = useState(mode !== "none");
	const paths = item.routePaths;
	useEffect(() => {
		if (open && paths.length) void store.getState().load("route", paths);
		return () => store.getState().abort();
	}, [store, paths, open]);
	const map = useMemo(
		() =>
			state.points.length
				? routeMapInsights(item.map, [state.points], item.start, item.end)
				: item.map,
		[state.points, item],
	);
	const hasMap = map.gps.pointCount > 0 || paths.length > 0;
	return (
		<Collapsible
			open={open}
			onOpenChange={setOpen}
			className="story-hour-block health-workout-entry"
			data-health-kind="workout"
		>
			<div className="story-lane story-lane-right">
				<LayerCard className="story-branch story-workout">
					<WorkoutStoryCard group={item.group} />
					{hasMap ? (
						<CollapsibleTrigger className="mt-4">
							{open ? "收起运动路线" : "展开运动路线"}
						</CollapsibleTrigger>
					) : null}
				</LayerCard>
			</div>
			{hasMap ? (
				<div className="story-lane story-lane-left">
					<CollapsibleContent unstyled>
						{map.gps.pointCount > 0 ? (
							<DayMap
								insights={map}
								compact
								showPoints
								title={`${item.group.canonical.title} · 这一次的路线`}
								label="锻炼与足迹合并地图"
							/>
						) : state.status === "loading" ? (
							<LayerCard>
								<LayerCard.Loading label="正在读取运动路线" />
							</LayerCard>
						) : null}
						{state.status === "error" ? (
							<Banner
								variant="error"
								title="运动路线暂时不可用"
								description={state.error ?? undefined}
								action={
									<Banner.Action onClick={() => void store.getState().load("route", paths)}>
										重试
									</Banner.Action>
								}
							/>
						) : null}
						{state.status === "ready" && map.gps.pointCount === 0 ? (
							<Text as="p" size="sm" tone="muted">
								这段锻炼在当天没有路线采样。
							</Text>
						) : null}
					</CollapsibleContent>
				</div>
			) : null}
		</Collapsible>
	);
}

function EcgEntry({ item }: { item: Extract<HealthTimelineItem, { kind: "ecg" }> }) {
	const [store] = useState(createHealthEvidenceStore);
	const state = useStore(store);
	const path = item.ecg.filePath;
	useEffect(() => {
		if (path) void store.getState().load("ecg", [path]);
		return () => store.getState().abort();
	}, [path, store]);
	return (
		<LayerCard className="story-branch health-special-card story-ecg">
			<EcgStoryCard
				ecg={item.ecg}
				waveform={state.waveform}
				samplingHz={state.samplingHz ?? undefined}
			/>
			{state.status === "loading" ? (
				<Text as="p" size="xs" tone="muted">
					正在读取波形…
				</Text>
			) : null}
			{state.error ? (
				<Banner
					variant="error"
					title="波形暂时不可用"
					description={state.error}
					action={
						path ? (
							<Banner.Action onClick={() => void store.getState().load("ecg", [path])}>
								重试
							</Banner.Action>
						) : undefined
					}
				/>
			) : null}
		</LayerCard>
	);
}

function SleepEntry({
	item,
	mode,
}: {
	item: Extract<HealthTimelineItem, { kind: "sleep" }>;
	mode: TimelineMapMode;
}) {
	const [open, setOpen] = useState(mode !== "none");
	return (
		<Collapsible
			open={open}
			onOpenChange={setOpen}
			className="story-hour-block"
			data-health-kind="sleep"
		>
			<div className="story-lane story-lane-left">
				<SleepStoryCard night={item.night} />
				{item.location ? (
					<LayerCard className="health-sleep-place story-card story-sleep">
						<StoryCardHeading icon={MapPin} title={item.location.label} as="h3" />
						<Text as="p" size="sm" tone="muted">
							{item.location.detail}
						</Text>
					</LayerCard>
				) : null}
			</div>
			{item.map && item.map.gps.pointCount > 0 ? (
				<div className="story-lane story-lane-right">
					<CollapsibleContent unstyled>
						<DayMap
							insights={item.map}
							compact
							showPoints
							title="这一夜，停留在这里"
							label="睡眠附近的位置采样"
						/>
					</CollapsibleContent>
					<CollapsibleTrigger className="mt-2">
						{open ? "收起睡眠位置" : "展开睡眠位置"}
					</CollapsibleTrigger>
				</div>
			) : null}
		</Collapsible>
	);
}

export function HealthTimelineEntry({
	item,
	mode,
}: {
	item: HealthTimelineItem;
	mode: TimelineMapMode;
}) {
	if (item.kind === "workout") return <WorkoutEntry item={item} mode={mode} />;
	if (item.kind === "sleep") return <SleepEntry item={item} mode={mode} />;
	return (
		<div className="story-hour-block" data-health-kind={item.kind}>
			<div className="story-lane story-lane-left">
				{item.kind === "ecg" ? (
					<EcgEntry item={item} />
				) : item.kind === "pressure" ? (
					<LayerCard className="story-branch health-special-card story-pressure">
						<BloodPressureCard reading={item.reading} />
					</LayerCard>
				) : item.kind === "moment" ? (
					<LayerCard
						className={`story-branch story-${item.moment.kind === "heartPeak" ? "heart" : item.moment.kind}`}
					>
						<HealthMomentCard moment={item.moment} />
					</LayerCard>
				) : item.kind === "observation" ? (
					<LayerCard className="story-branch story-observation">
						<StoryCardInfo label={item.title} notes={item.notes} />
						<StoryCardHeading
							icon={OBSERVATION_ICONS[item.title] ?? ClipboardList}
							title={item.title}
							as="h3"
							subtitle={
								<time dateTime={item.occurredAt}>
									{formatLocalClock(item.occurredAt, item.event.precision)}
								</time>
							}
						/>
						{item.details.length ? (
							<DescriptionList columns={2}>
								{item.details.map((row) => (
									<DescriptionList.Item key={row.term} term={row.term}>
										{row.value}
									</DescriptionList.Item>
								))}
							</DescriptionList>
						) : null}
					</LayerCard>
				) : (
					<LayerCard className="story-branch story-sleep">
						<StoryCardInfo label={item.title} notes={["这一夜的睡眠分析会归到起床那天。"]} />
						<StoryCardHeading
							icon={MoonStar}
							title={item.title}
							as="h3"
							subtitle={
								<time dateTime={item.occurredAt}>
									{formatLocalClock(item.occurredAt, "minute")}
								</time>
							}
						/>
					</LayerCard>
				)}
			</div>
		</div>
	);
}
