import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
	DescriptionList,
	LayerCard,
	Text,
} from "@nocoo/basalt";
import { Banner } from "@nocoo/basalt/components/banner";
import { HeartPulse, Moon, Stethoscope } from "lucide-react";
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
		<LayerCard className="story-branch health-special-card">
			<div className="story-branch-eyebrow">
				<HeartPulse size={17} aria-hidden="true" />
				<span>一次心电测量</span>
			</div>
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
					<LayerCard className="health-sleep-place">
						<Text as="h3" variant="heading" size="sm">
							{item.location.label}
						</Text>
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
					<LayerCard className="story-branch health-special-card">
						<div className="story-branch-eyebrow">
							<Stethoscope size={17} aria-hidden="true" />
							<span>一次血压测量</span>
						</div>
						<BloodPressureCard reading={item.reading} />
					</LayerCard>
				) : item.kind === "moment" ? (
					<LayerCard className="story-branch story-health">
						<HealthMomentCard moment={item.moment} />
					</LayerCard>
				) : item.kind === "observation" ? (
					<LayerCard className="story-branch story-health">
						<time>{formatLocalClock(item.occurredAt, item.event.precision)}</time>
						<Text as="h3" variant="heading" size="sm">
							{item.title}
						</Text>
						<DescriptionList columns={2}>
							{item.details.map((row) => (
								<DescriptionList.Item key={row.term} term={row.term}>
									{row.value}
								</DescriptionList.Item>
							))}
						</DescriptionList>
					</LayerCard>
				) : (
					<LayerCard className="story-branch story-sleep">
						<div className="story-branch-eyebrow">
							<Moon size={16} aria-hidden="true" />
							<time>{formatLocalClock(item.occurredAt, "minute")}</time>
						</div>
						<Text as="h3" variant="heading" size="sm">
							{item.title}
						</Text>
						<Text as="p" size="sm" tone="muted">
							这一夜的睡眠分析会归到起床那天。
						</Text>
					</LayerCard>
				)}
			</div>
		</div>
	);
}
