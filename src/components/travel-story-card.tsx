import { LayerCard } from "@nocoo/basalt";
import { Bike, Car, Footprints, Route, TrainFront } from "lucide-react";
import { type GpsJourney, TRAVEL_MODE_LABELS } from "../models/gps-journeys";
import { storyDistance } from "../viewmodels/day-story";
import { formatDurationMinutes, formatLocalClock } from "../viewmodels/format";
import { StoryMetrics } from "./day-insights";
import { StoryCardInfo } from "./story-card-info";

const ICONS = { walk: Footprints, cycle: Bike, vehicle: Car, rail: TrainFront, unknown: Route };

export function TravelStoryCard({ journey }: { journey: GpsJourney }) {
	const Icon = ICONS[journey.mode];
	const title = journey.commute
		? `可能的通勤 · ${journey.commute === "outbound" ? "去程" : "返程"}`
		: TRAVEL_MODE_LABELS[journey.mode];
	return (
		<div className="story-hour-block">
			<div className="story-lane story-lane-right">
				<LayerCard
					className="story-branch story-travel"
					data-story-kind="travel"
					data-commute={journey.commute ?? undefined}
				>
					<StoryCardInfo
						label={title}
						notes={[
							`来源：${journey.sourceName}`,
							"按相邻定位估算距离与速度，稠密采样按约 30 秒归并；移动均速不含低于 2 km/h 的短暂停等。",
							"超过 5 分钟的断档或停留会拆段，距离可能因弯道与采样间隔而低估。",
							journey.modeReason,
							...(journey.commuteReason ? [journey.commuteReason] : []),
						]}
					/>
					<div className="story-branch-eyebrow">
						<span className="story-card-icon" aria-hidden="true">
							<Icon size={17} strokeWidth={1.6} />
						</span>
						<span>出行</span>
						<time dateTime={journey.startAt} className="story-period">
							{formatLocalClock(journey.startAt, "minute")} —{" "}
							{formatLocalClock(journey.endAt, "minute")}
						</time>
					</div>
					<h3 className="story-branch-title">{title}</h3>
					{journey.commute ? (
						<p className="story-visit-observation">{TRAVEL_MODE_LABELS[journey.mode]}</p>
					) : null}
					{journey.startPlace || journey.endPlace ? (
						<p className="story-travel-route">
							{journey.startPlace ?? "出发区域"} → {journey.endPlace ?? "到达区域"}
						</p>
					) : null}
					<StoryMetrics
						items={[
							{ label: "移动均速", value: `${journey.averageKmh.toFixed(1)} km/h` },
							{ label: "采样距离", value: storyDistance(journey.distanceMeters) },
							{ label: "移动时间", value: formatDurationMinutes(journey.movingMinutes) },
						]}
					/>
					{journey.stoppedMinutes > 0 ? (
						<p className="story-visit-observation">
							均速已排除约 {formatDurationMinutes(journey.stoppedMinutes)} 短暂停等
						</p>
					) : null}
					{journey.pointsOfInterest.length ? (
						<p className="story-visit-observation">
							途经命名范围：{journey.pointsOfInterest.map((point) => point.label).join(" · ")}
						</p>
					) : null}
				</LayerCard>
			</div>
		</div>
	);
}
