import { Collapsible, CollapsibleContent, CollapsibleTrigger, LayerCard } from "@nocoo/basalt";
import {
	Activity,
	ArrowDownLeft,
	ArrowLeftRight,
	ArrowUpRight,
	ChartNoAxesColumn,
	CircleDot,
	Clock,
	Droplets,
	Dumbbell,
	Flame,
	Footprints,
	GitCommitHorizontal,
	GitPullRequest,
	HeartPulse,
	List,
	type LucideIcon,
	MapPin,
	MoonStar,
	MoveUpRight,
	PersonStanding,
	Plug,
	Route,
	Tag,
} from "lucide-react";
import type { DayInsights } from "../models/day-insights";
import { healthMetrics, type StoryMetric } from "../viewmodels/day-story";
import { StoryCardHeading, StoryMetricLabel } from "./story-card-heading";

const METRIC_ICONS: Record<string, LucideIcon> = {
	步数: Footprints,
	心率: HeartPulse,
	睡眠: MoonStar,
	步行距离: Route,
	活动能量: Flame,
	饮水: Droplets,
	锻炼: Dumbbell,
	站立: PersonStanding,
	爬楼: MoveUpRight,
	时间线记录: List,
	有记录的小时: Clock,
	来源: Plug,
	位置区域: MapPin,
	收入: ArrowDownLeft,
	支出: ArrowUpRight,
	转账: ArrowLeftRight,
	Commit: GitCommitHorizontal,
	PR: GitPullRequest,
	Issue: CircleDot,
	Release: Tag,
};

export function StoryMetrics({ items }: { items: StoryMetric[] }) {
	if (items.length === 0) return null;
	return (
		<dl className="story-metrics">
			{items.map((item) => (
				<div key={item.label}>
					<dt>
						<StoryMetricLabel icon={METRIC_ICONS[item.label] ?? Activity}>
							{item.label}
						</StoryMetricLabel>
					</dt>
					<dd>
						{item.value}
						{item.detail ? <span className="story-metric-detail">{item.detail}</span> : null}
					</dd>
				</div>
			))}
		</dl>
	);
}

export function DayInsightsCard({ insights }: { insights: DayInsights }) {
	const metrics = healthMetrics(insights.health);
	if (!metrics.length && !insights.workoutCount) return null;
	return (
		<LayerCard className="story-totals story-card">
			<LayerCard.Header>
				<StoryCardHeading icon={ChartNoAxesColumn} title="一日累计" />
			</LayerCard.Header>
			<LayerCard.Body>
				<StoryMetrics items={metrics} />
				{insights.workoutCount > 0 ? (
					<p className="story-total-workouts">留下了 {insights.workoutCount} 次运动记录</p>
				) : null}
				{insights.health.sleepStages.length > 0 ? (
					<Collapsible className="story-disclosure">
						<CollapsibleTrigger>睡眠分期</CollapsibleTrigger>
						<CollapsibleContent>
							<ul className="story-stage-list">
								{insights.health.sleepStages.map((stage) => (
									<li key={stage.name}>
										<span>{stage.name}</span>
										<span>{Math.round(stage.minutes)} 分钟</span>
									</li>
								))}
							</ul>
						</CollapsibleContent>
					</Collapsible>
				) : null}
			</LayerCard.Body>
		</LayerCard>
	);
}
