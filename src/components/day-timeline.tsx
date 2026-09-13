import { Badge, LayerCard, Separator, StatStrip, Text } from "@nocoo/basalt";
import { Empty } from "@nocoo/basalt/components/empty";
import { SectionRule } from "@nocoo/basalt/components/section-rule";
import type { DayTimeline, HourSlot } from "../models/types";
import { describeHourSlot } from "../viewmodels/hour-slot";
import { EventCard } from "./event-card";

function HourRow({ slot }: { slot: HourSlot }) {
	const view = describeHourSlot(slot);
	return (
		<div className="grid gap-3 py-3 md:grid-cols-[5.5rem_minmax(0,1fr)]" data-hour={slot.hour}>
			<div className="flex items-baseline gap-2 md:flex-col md:gap-1">
				<Text as="p" variant="mono" size="sm" bold>
					{slot.label}
				</Text>
				{view.stateLabel ? (
					<Badge variant={view.skipped || view.partial ? "warning" : "info"}>
						{view.stateLabel}
					</Badge>
				) : null}
			</div>
			<div className="space-y-2">
				{view.hint ? (
					<Text as="p" size="sm" tone="muted">
						{view.hint}
					</Text>
				) : null}
				{view.showEvents ? (
					<div className="divide-y divide-basalt-border">
						{slot.events.map((event) => (
							<EventCard key={event.id} event={event} />
						))}
					</div>
				) : null}
			</div>
		</div>
	);
}

export function DayTimelineView({ timeline }: { timeline: DayTimeline }) {
	return (
		<div className="space-y-6">
			<StatStrip
				items={[
					{ label: "记录", value: String(timeline.totalEvents) },
					{ label: "有记录的小时", value: String(timeline.activeHours) },
					{ label: "来源", value: String(timeline.sourceCount) },
					{ label: "时区", value: timeline.timezone },
				]}
			/>
			<LayerCard>
				<LayerCard.Header>
					<Text as="h2" variant="heading" size="md">
						全天
					</Text>
					<Text as="p" size="sm" tone="muted">
						仅有日期、没有钟点的记录
					</Text>
				</LayerCard.Header>
				<LayerCard.Body>
					{timeline.allDay.length === 0 ? (
						<Empty title="没有全天记录" description="这一天没有日期精度的记录。" />
					) : (
						<div className="divide-y divide-basalt-border">
							{timeline.allDay.map((event) => (
								<EventCard key={event.id} event={event} />
							))}
						</div>
					)}
				</LayerCard.Body>
			</LayerCard>
			<SectionRule
				title="24 小时"
				hint="按本地钟点排列，夏令时缺失、缩短或重复的小时会单独标出。"
			/>
			<LayerCard padding="sm">
				{timeline.hours.map((slot) => (
					<div key={slot.hour}>
						{slot.hour > 0 ? <Separator /> : null}
						<HourRow slot={slot} />
					</div>
				))}
			</LayerCard>
		</div>
	);
}
