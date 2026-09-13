import {
	Badge,
	Button,
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
	LayerCard,
} from "@nocoo/basalt";
import {
	Activity,
	ArrowDown,
	ArrowUpRight,
	BookOpen,
	Footprints,
	Leaf,
	MapPin,
	Moon,
	NotebookPen,
	Plug,
	Sun,
	Sunrise,
	Sunset,
	Wallet,
} from "lucide-react";
import { Fragment, useState } from "react";
import { Link } from "react-router";
import type { DayInsights } from "../models/day-insights";
import type { DayTimeline } from "../models/types";
import type { DayStory, StoryBranch, StoryHour, StoryKind } from "../viewmodels/day-story";
import { summaryQueryFromTimeline } from "../viewmodels/day-summary-view-model";
import { describeHourSlot } from "../viewmodels/hour-slot";
import { DayInsightsCard, StoryMetrics } from "./day-insights";
import { DayMap } from "./day-map";
import { DaySummaryCard } from "./day-summary";
import { EventCard, EventDetails } from "./event-card";
import { useIsMobile } from "./use-is-mobile";

const CHAPTERS = [
	{ hour: 0, name: "凌晨", range: "00 — 06", icon: Moon },
	{ hour: 6, name: "上午", range: "06 — 12", icon: Sunrise },
	{ hour: 12, name: "下午", range: "12 — 18", icon: Sun },
	{ hour: 18, name: "夜晚", range: "18 — 24", icon: Sunset },
];

const BRANCH_ICONS = {
	sleep: Moon,
	health: Activity,
	workout: Footprints,
	journey: MapPin,
	money: Wallet,
	note: NotebookPen,
	connect: Plug,
} satisfies Record<StoryKind, typeof Moon>;

function StoryBranchView({
	branch,
	onOpenMap,
}: {
	branch: StoryBranch;
	onOpenMap: (branch: StoryBranch) => void;
}) {
	const Icon = BRANCH_ICONS[branch.kind];
	const grouped = branch.kind === "sleep" || branch.kind === "health" || branch.kind === "journey";
	const source = branch.events[0];
	return (
		<LayerCard className={`story-branch story-${branch.kind}`} data-story-kind={branch.kind}>
			<div className="story-branch-eyebrow">
				<Icon size={15} strokeWidth={1.6} aria-hidden="true" />
				<span>{source?.sourceName}</span>
				{branch.period ? <span className="story-period">{branch.period}</span> : null}
			</div>
			{branch.fromPreviousDay ? <p className="story-carried">延续自前一天</p> : null}
			<div className="story-branch-copy">
				<h3
					className={`story-branch-title${branch.kind === "health" && branch.metrics.length ? " sr-only" : ""}`}
				>
					{branch.title}
				</h3>
				{source?.content ? <p className="story-event-preview">{source.content}</p> : null}
				<StoryMetrics items={branch.metrics} />
			</div>
			{branch.heartTrace ? (
				<svg className="story-heart-trace" viewBox="0 0 120 36" aria-hidden="true">
					<polyline
						points={branch.heartTrace}
						fill="none"
						stroke="currentColor"
						strokeWidth="1.8"
					/>
				</svg>
			) : null}
			{branch.kind === "journey" && branch.insights.gps.pointCount > 0 ? (
				<Button
					variant="ghost"
					size="sm"
					className="story-map-link"
					onClick={() => onOpenMap(branch)}
					aria-label={`查看${branch.period ?? "全天"}的足迹`}
				>
					查看这段足迹 <ArrowUpRight size={14} aria-hidden="true" />
				</Button>
			) : null}
			<Collapsible className="story-raw-records">
				<CollapsibleTrigger>
					{grouped ? `查看 ${branch.events.length} 条原始记录` : "详情"}
				</CollapsibleTrigger>
				<CollapsibleContent>
					{grouped ? (
						<div className="story-record-list">
							{branch.events.map((event) => (
								<EventCard key={event.id} event={event} />
							))}
						</div>
					) : source ? (
						<EventDetails event={source} />
					) : null}
				</CollapsibleContent>
			</Collapsible>
		</LayerCard>
	);
}

function HourRow({
	row,
	map,
	stacked,
	onOpenMap,
}: {
	row: StoryHour;
	map?: DayInsights;
	stacked: boolean;
	onOpenMap: (branch: StoryBranch) => void;
}) {
	const { slot } = row;
	const view = describeHourSlot(slot);
	const quiet = !row.branches.length && !row.continuing.length && !map;
	const mapBranchId =
		stacked && map ? row.branches.find((branch) => branch.insights.gps.pointCount > 0)?.id : null;
	const mapView = map ? (
		<div className="story-map-branch" id="life-day-map">
			<DayMap insights={map} compact />
			<p className="story-map-caption">当天已记录的轨迹 · 查看枝条可展开对应路段</p>
		</div>
	) : null;
	return (
		<div
			id={`life-hour-${slot.hour}`}
			className={`story-hour${quiet ? " story-hour-quiet" : ""}`}
			data-hour={slot.hour}
			tabIndex={-1}
		>
			<div className="story-hour-axis">
				<span className="story-clock">{slot.label}</span>
				{view.stateLabel ? <Badge variant="warning">{view.stateLabel}</Badge> : null}
			</div>
			{(stacked ? ["both"] : ["left", "right"]).map((side) => (
				<div className={`story-lane story-lane-${side}`} key={side}>
					{row.continuing
						.filter((item) => side === "both" || item.side === side)
						.map((item) => (
							<a
								key={item.id}
								href={`#life-hour-${item.anchorHour}`}
								className={`story-continuation story-${item.kind}`}
								aria-label={`${item.title}，回到开始时段`}
							>
								<span className="story-continuation-line" aria-hidden="true" />
								{item.title}
							</a>
						))}
					{row.branches
						.filter((branch) => side === "both" || branch.side === side)
						.map((branch) => (
							<Fragment key={branch.id}>
								<StoryBranchView branch={branch} onOpenMap={onOpenMap} />
								{branch.id === mapBranchId ? mapView : null}
							</Fragment>
						))}
					{side === "left" || (side === "both" && !mapBranchId) ? mapView : null}
					{side !== "left" && (view.skipped || view.partial) ? (
						<p className="story-dst-hint">{view.hint}</p>
					) : null}
				</div>
			))}
		</div>
	);
}

export function DayTimelineView({
	timeline,
	story,
	insights,
}: {
	timeline: DayTimeline;
	story: DayStory;
	insights: DayInsights;
}) {
	const [mapDetail, setMapDetail] = useState<StoryBranch | null>(null);
	const stacked = useIsMobile() === true;
	const hasMap = insights.gps.pointCount > 0;
	return (
		<>
			<div className="story-guide">
				<p>
					{timeline.totalEvents} 条记录 <span>·</span> {timeline.activeHours} 个小时 <span>·</span>{" "}
					{timeline.sourceCount} 个来源
				</p>
				<a href="#life-day-close">
					日终回看 <ArrowDown size={13} aria-hidden="true" />
				</a>
			</div>
			<nav className="story-ribbon" aria-label="一天的时段">
				{CHAPTERS.map((chapter) => (
					<a
						href={`#life-hour-${chapter.hour}`}
						key={chapter.hour}
						aria-label={`跳转至${chapter.name}`}
					>
						<div className="story-ribbon-bars" aria-hidden="true">
							{story.hours.slice(chapter.hour, chapter.hour + 6).map((row) => (
								<span
									key={row.slot.hour}
									data-clock-mark=""
									data-active={row.activity > 0}
									style={{ height: `${6 + row.activity * 20}px` }}
								/>
							))}
						</div>
						<span className="story-ribbon-label">
							<span>{chapter.name}</span>
							<span>{chapter.range}</span>
						</span>
					</a>
				))}
			</nav>
			<section className="story-tree" aria-label="24 小时时间线">
				<div className="story-lane-headings" aria-hidden="true">
					<span>身体 · 现场</span>
					<Leaf size={18} strokeWidth={1.25} />
					<span>行迹 · 生活</span>
				</div>
				{story.allDay.length > 0 ? (
					<section className="story-all-day" aria-label="全天记录">
						<div className="story-hour-axis">
							<span className="story-clock">全天</span>
						</div>
						{(["left", "right"] as const).map((side) => (
							<div className={`story-lane story-lane-${side}`} key={side}>
								{story.allDay
									.filter((branch) => branch.side === side)
									.map((branch) => (
										<StoryBranchView key={branch.id} branch={branch} onOpenMap={setMapDetail} />
									))}
								{side === "left" && hasMap && story.mapHour === null ? (
									<DayMap insights={insights} compact />
								) : null}
							</div>
						))}
					</section>
				) : null}
				{CHAPTERS.map((chapter) => {
					const Icon = chapter.icon;
					return (
						<section key={chapter.hour} aria-label={chapter.name} className="story-chapter">
							<div className="story-chapter-heading">
								<span className="story-chapter-range">{chapter.range}</span>
								<span className="story-chapter-symbol">
									<Icon size={19} strokeWidth={1.25} aria-hidden="true" />
								</span>
								<h2>{chapter.name}</h2>
							</div>
							{chapter.hour === 0 && timeline.totalEvents === 0 ? (
								<div className="story-empty">
									<BookOpen size={26} strokeWidth={1.2} aria-hidden="true" />
									<h3>这一天，留待记录</h3>
									<p>一段步行、一笔午餐、一则随记，都可以成为这一天的开始。</p>
									<div className="flex flex-wrap justify-center gap-2">
										<Button variant="outline" size="sm" asChild>
											<Link to="/imports">导入记录</Link>
										</Button>
										<Button variant="ghost" size="sm" asChild>
											<Link to="/connect">
												连接一个来源 <ArrowUpRight size={14} aria-hidden="true" />
											</Link>
										</Button>
									</div>
								</div>
							) : null}
							{story.hours.slice(chapter.hour, chapter.hour + 6).map((row) => (
								<HourRow
									key={row.slot.hour}
									row={row}
									stacked={stacked}
									map={hasMap && story.mapHour === row.slot.hour ? insights : undefined}
									onOpenMap={setMapDetail}
								/>
							))}
						</section>
					);
				})}
				<section id="life-day-close" className="story-close" aria-label="日终回看" tabIndex={-1}>
					<div className="story-hour-axis">
						<span className="story-clock">24:00</span>
					</div>
					<div className="story-lane story-lane-left">
						<DayInsightsCard insights={insights} />
					</div>
					<div className="story-lane story-lane-right">
						<DaySummaryCard query={summaryQueryFromTimeline(timeline)} />
					</div>
				</section>
			</section>
			<p className="story-colophon">
				{timeline.date} <span>·</span> {timeline.timezone} <span>·</span> Life.ai 生活实录
			</p>
			<Dialog
				open={mapDetail !== null}
				onOpenChange={(open) => {
					if (!open) setMapDetail(null);
				}}
			>
				<DialogContent className="story-map-dialog sm:max-w-3xl">
					<DialogTitle>这一段足迹</DialogTitle>
					<DialogDescription>
						{mapDetail?.period ?? "全天位置记录"} · {mapDetail?.events[0]?.sourceName}
					</DialogDescription>
					{mapDetail ? <DayMap insights={mapDetail.insights} label="所选时段足迹地图" /> : null}
				</DialogContent>
			</Dialog>
		</>
	);
}
