import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
	LayerCard,
	Text,
} from "@nocoo/basalt";
import { ChartNoAxesColumn } from "lucide-react";
import type { DayInsights } from "../models/day-insights";
import { healthMetrics, type StoryMetric } from "../viewmodels/day-story";

export function StoryMetrics({ items }: { items: StoryMetric[] }) {
	if (items.length === 0) return null;
	return (
		<dl className="story-metrics">
			{items.map((item) => (
				<div key={item.label}>
					<dt>{item.label}</dt>
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
	if (!metrics.length && !insights.workoutCount && !insights.finance.length) return null;
	return (
		<LayerCard className="story-totals">
			<LayerCard.Header>
				<div className="flex items-center gap-2">
					<ChartNoAxesColumn size={16} strokeWidth={1.5} aria-hidden="true" />
					<Text as="h2" variant="heading" size="md">
						一日累计
					</Text>
				</div>
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
				{insights.finance.map((row) => (
					<div className="story-finance-total" key={row.currency}>
						<div className="story-finance-caption">
							<span>{row.currency}</span>
							<span>{row.count} 笔收支</span>
						</div>
						<StoryMetrics
							items={[
								{ label: "收入", value: row.income.toFixed(2) },
								{ label: "支出", value: row.expense.toFixed(2) },
								{ label: "转账", value: row.transfers.toFixed(2) },
							]}
						/>
					</div>
				))}
			</LayerCard.Body>
		</LayerCard>
	);
}
