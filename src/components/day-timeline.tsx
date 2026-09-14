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
	Text,
} from "@nocoo/basalt";
import {
	Activity,
	ArrowUpRight,
	BookOpen,
	CalendarClock,
	CalendarDays,
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
import { useState } from "react";
import { Link } from "react-router";
import type { DayInsights } from "../models/day-insights";
import type { HealthStory } from "../models/health-insights";
import type { DayTimeline } from "../models/types";
import type { DayContextState, SolarMoment } from "../viewmodels/day-context-view-model";
import {
	type DayStory,
	type StoryBranch,
	type StoryHour,
	type StoryKind,
	type StoryVisit,
	storyDistance,
	storyHourBlocks,
} from "../viewmodels/day-story";
import { summaryQueryFromTimeline } from "../viewmodels/day-summary-view-model";
import { formatDurationMinutes } from "../viewmodels/format";
import { describeHourSlot } from "../viewmodels/hour-slot";
import type { TimelineMapMode } from "../viewmodels/timeline-view-model";
import { DayContextCard } from "./day-context";
import { DayInsightsCard, StoryMetrics } from "./day-insights";
import { DayMap } from "./day-map";
import { DaySummaryCard } from "./day-summary";
import { EventDetails } from "./event-card";
import { FinanceDayCard } from "./finance-day";
import { HealthDayCard } from "./health-story";
import { HealthTimelineEntry } from "./health-timeline-entry";
import { SourceStoryCard } from "./source-story-card";
import { StoryCardHeading } from "./story-card-heading";
import { StoryCardInfo } from "./story-card-info";
import { TravelStoryCard } from "./travel-story-card";
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
	computer: Plug,
	article: BookOpen,
} satisfies Record<StoryKind, typeof Moon>;

const BRANCH_LABELS: Record<StoryKind, string> = {
	sleep: "睡眠",
	health: "身体活动",
	workout: "锻炼",
	journey: "足迹",
	money: "收支",
	note: "随记",
	connect: "连接记录",
	computer: "电脑活动",
	article: "发表文章",
};

function StoryBranchView({
	branch,
	onOpenMap,
	embedded = false,
}: {
	branch: StoryBranch;
	onOpenMap: (branch: StoryBranch) => void;
	embedded?: boolean;
}) {
	if (branch.computer || branch.article) return <SourceStoryCard branch={branch} />;
	const Icon = BRANCH_ICONS[branch.kind];
	const grouped = branch.kind === "sleep" || branch.kind === "health" || branch.kind === "journey";
	const source = branch.events[0];
	const Surface = embedded ? "article" : LayerCard;
	return (
		<Surface
			className={`${embedded ? "story-all-day-entry" : "story-branch"} story-${branch.kind}`}
			data-story-kind={branch.kind}
		>
			{!embedded ? (
				<StoryCardInfo
					label={branch.title}
					notes={[
						...new Set(branch.events.map((event) => `来源：${event.sourceName}`)),
						`${branch.events.length} 条记录`,
					]}
				/>
			) : null}
			{!embedded ? (
				<div className="story-branch-eyebrow">
					<span className="story-card-icon" aria-hidden="true">
						<Icon size={17} strokeWidth={1.6} />
					</span>
					<span>{BRANCH_LABELS[branch.kind]}</span>
					{branch.period ? <span className="story-period">{branch.period}</span> : null}
				</div>
			) : null}
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
			{!grouped && source ? (
				<Collapsible className="story-event-details">
					<CollapsibleTrigger>详情</CollapsibleTrigger>
					<CollapsibleContent>
						<EventDetails event={source} />
					</CollapsibleContent>
				</Collapsible>
			) : null}
		</Surface>
	);
}

function VisitView({ item, mode }: { item: StoryVisit; mode: TimelineMapMode }) {
	const [open, setOpen] = useState(mode === "all" || (mode === "auto" && !item.repeatedPlace));
	const { visit } = item;
	return (
		<Collapsible
			open={open}
			onOpenChange={setOpen}
			className="story-visit story-hour-block"
			data-visit={visit.id}
		>
			<div className="story-lane story-lane-right">
				<LayerCard className="story-branch story-visit-copy" data-story-kind="journey">
					<StoryCardInfo
						label={item.title}
						notes={[
							...new Set(visit.points.map((point) => `来源：${point.sourceName}`)),
							`${visit.pointCount} 个位置采样`,
						]}
					/>
					<div className="story-branch-eyebrow">
						<span className="story-card-icon" aria-hidden="true">
							<MapPin size={17} strokeWidth={1.6} />
						</span>
						<span>足迹</span>
						<time dateTime={visit.startAt} className="story-period">
							{item.period}
						</time>
					</div>
					<Text as="h3" variant="heading" size="md">
						{item.title}
					</Text>
					{open ? (
						<p className="story-visit-observation">
							{visit.observedMinutes > 0
								? `有连续采样 ${formatDurationMinutes(visit.observedMinutes)}`
								: "零散位置采样"}
						</p>
					) : null}
					{open && item.stops.length > 1 ? (
						<ol className="story-route-stops">
							{item.stops.map((stop) => (
								<li key={stop.id}>
									<time dateTime={stop.at}>{stop.clock}</time>
									<span>{stop.label ?? `区域 ${stop.placeIndex}`}</span>
								</li>
							))}
						</ol>
					) : null}
					{open && item.repeatedPlace ? (
						<p className="story-visit-compact">与上一时段的采样位于同一区域</p>
					) : null}
					<div className="story-visit-actions">
						{!open ? (
							<p className="story-visit-compact">
								{visit.pointCount} 个点 · {storyDistance(item.map.gps.distanceMeters)}
							</p>
						) : null}
						<CollapsibleTrigger aria-label={`${open ? "收起" : "展开"}${item.period}的地图`}>
							{open ? "收起这段地图" : "展开这段地图"}
						</CollapsibleTrigger>
					</div>
				</LayerCard>
			</div>
			<div className="story-lane story-lane-left story-visit-map">
				<CollapsibleContent unstyled>
					<DayMap
						insights={item.map}
						places={item.places}
						compact
						showPoints
						title={item.places.length > 1 ? "这一路的足迹" : `区域 ${item.places[0]?.index} 附近`}
						label={`${item.period}的足迹地图`}
					/>
				</CollapsibleContent>
			</div>
		</Collapsible>
	);
}

function HourRow({
	row,
	solar,
	reference,
	mapMode,
	stacked,
	onOpenMap,
}: {
	row: StoryHour;
	solar: SolarMoment[];
	reference: string;
	mapMode: TimelineMapMode;
	stacked: boolean;
	onOpenMap: (branch: StoryBranch) => void;
}) {
	const { slot } = row;
	const view = describeHourSlot(slot);
	const blocks = storyHourBlocks(row, solar);
	const quiet = !blocks.length && !row.continuing.length;
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
			<div className="story-hour-content">
				{row.continuing.length > 0 ? (
					<div className="story-hour-block story-hour-continuations">
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
							</div>
						))}
					</div>
				) : null}
				{blocks.map((block) => {
					if (block.kind === "travel")
						return <TravelStoryCard key={block.id} journey={block.journey} />;
					if (block.kind === "health")
						return (
							<HealthTimelineEntry
								key={`${block.id}:${mapMode}`}
								item={block.health}
								mode={mapMode}
							/>
						);
					if (block.kind === "visit")
						return <VisitView key={`${block.id}:${mapMode}`} item={block.visit} mode={mapMode} />;
					if (block.kind === "solar") {
						const Icon = block.solar.kind === "sunrise" ? Sunrise : Sunset;
						return (
							<div
								className="story-solar story-hour-block"
								key={block.id}
								data-solar={block.solar.kind}
							>
								<Icon className="story-solar-icon" size={18} strokeWidth={1.5} aria-hidden="true" />
								<div className="story-solar-copy">
									<time dateTime={block.solar.occurredAt}>{block.solar.clock}</time>
									<span>{block.solar.label}</span>
									<small>{reference} · 天文时间</small>
								</div>
							</div>
						);
					}
					return (
						<div className="story-hour-block story-hour-branches" key={block.id}>
							{(stacked ? ["both"] : ["left", "right"]).map((side) => (
								<div className={`story-lane story-lane-${side}`} key={side}>
									{block.branches
										.filter((branch) => side === "both" || branch.side === side)
										.map((branch) => (
											<StoryBranchView key={branch.id} branch={branch} onOpenMap={onOpenMap} />
										))}
								</div>
							))}
						</div>
					);
				})}
				{view.skipped || view.partial ? (
					<div className="story-hour-block">
						<p className="story-dst-hint story-lane-right">{view.hint}</p>
					</div>
				) : null}
			</div>
		</div>
	);
}

export function DayTimelineView({
	timeline,
	story,
	insights,
	context,
	mapMode,
	health,
}: {
	timeline: DayTimeline;
	story: DayStory;
	insights: DayInsights;
	context: DayContextState | null;
	mapMode: TimelineMapMode;
	health?: HealthStory | null;
}) {
	const [mapDetail, setMapDetail] = useState<StoryBranch | null>(null);
	const stacked = useIsMobile() === true;
	const hasMap = insights.gps.pointCount > 0;
	const reference = story.places.representativePlace
		? `${story.places.representativePlace.namedPlace?.label ?? `区域 ${story.places.representativePlace.index}`} 附近`
		: "当天参考位置";
	return (
		<>
			<div className="day-layout">
				<div className="day-story-column">
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
											solar={context?.solar ?? []}
											reference={reference}
											mapMode={mapMode}
											stacked={stacked}
											onOpenMap={setMapDetail}
										/>
									))}
								</section>
							);
						})}
						<div className="story-end-mark">24:00</div>
					</section>
				</div>
				<aside className="day-meta" aria-label="当日信息">
					<LayerCard className="story-card story-overview">
						<LayerCard.Header>
							<StoryCardHeading
								icon={CalendarClock}
								title="当天概况"
								subtitle={timeline.timezone}
							/>
						</LayerCard.Header>
						<LayerCard.Body>
							<StoryMetrics
								items={[
									{ label: "时间线记录", value: `${timeline.totalEvents} 条` },
									{ label: "有记录的小时", value: `${timeline.activeHours} / 24` },
									{ label: "来源", value: `${timeline.sourceCount} 个` },
									...(hasMap
										? [{ label: "位置区域", value: `${story.places.places.length} 处` }]
										: []),
								]}
							/>
							<p className="day-meta-caption">
								汇总当前可见来源 · 区域半径 {story.places.radiusKm} km
							</p>
						</LayerCard.Body>
					</LayerCard>
					<DayContextCard context={context} reference={reference} hasLocation={hasMap} />
					{hasMap ? (
						<div id="life-day-map">
							<DayMap
								insights={insights}
								places={story.places.places.length <= 12 ? story.places.places : undefined}
								compact
							/>
						</div>
					) : null}
					<DayInsightsCard insights={insights} />
					<FinanceDayCard finance={story.finance} />
					{health ? <HealthDayCard story={health} /> : null}
					{story.allDay.length > 0 ? (
						<LayerCard className="story-card story-all-day-card">
							<StoryCardInfo
								label="全天记录"
								notes={[
									"这些内容只精确到日期，不代表发生在零点。",
									...story.allDay.flatMap((branch) => [
										...new Set(branch.events.map((event) => `来源：${event.sourceName}`)),
										`${branch.title}：${branch.events.length} 条记录`,
									]),
								]}
							/>
							<LayerCard.Header>
								<StoryCardHeading icon={CalendarDays} title="全天记录" />
							</LayerCard.Header>
							<LayerCard.Body>
								<section className="story-all-day" aria-label="全天记录">
									{story.allDay.map((branch) => (
										<StoryBranchView
											key={branch.id}
											branch={branch}
											onOpenMap={setMapDetail}
											embedded
										/>
									))}
								</section>
							</LayerCard.Body>
						</LayerCard>
					) : null}
					<section id="life-day-close" aria-label="日终回看" tabIndex={-1}>
						<DaySummaryCard query={summaryQueryFromTimeline(timeline)} />
					</section>
				</aside>
			</div>
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
					{mapDetail ? (
						<DayMap insights={mapDetail.insights} showPoints label="所选时段足迹地图" />
					) : null}
				</DialogContent>
			</Dialog>
		</>
	);
}
