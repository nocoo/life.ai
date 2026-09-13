import {
	Badge,
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
	DescriptionList,
	Text,
} from "@nocoo/basalt";
import type { LifeEvent } from "../models/types";
import { describeEventData, sourceKindLabel } from "../viewmodels/event-details";
import { formatInterval } from "../viewmodels/format";

function badgeVariant(event: LifeEvent): "teal" | "blue" | "orange" | "purple" | "secondary" {
	if (event.sourceKind === "connect") {
		return "secondary";
	}
	const haystack = `${event.sourceId} ${event.sourceName}`.toLowerCase();
	if (haystack.includes("apple") || haystack.includes("health")) {
		return "teal";
	}
	if (haystack.includes("footprint") || haystack.includes("gpx")) {
		return "blue";
	}
	if (haystack.includes("pixiu") || haystack.includes("貔貅")) {
		return "orange";
	}
	if (haystack.includes("journal") || haystack.includes("日记")) {
		return "purple";
	}
	return "secondary";
}

export function EventDetails({ event }: { event: LifeEvent }) {
	const details = describeEventData(event);
	return (
		<div className="space-y-3">
			{event.content ? (
				<Text as="p" size="sm" className="whitespace-pre-wrap break-words">
					{event.content}
				</Text>
			) : null}
			{details.length > 0 ? (
				<DescriptionList columns={2}>
					{details.map((row) => (
						<DescriptionList.Item key={`${event.id}-${row.term}`} term={row.term}>
							{row.value}
						</DescriptionList.Item>
					))}
				</DescriptionList>
			) : null}
		</div>
	);
}

export function EventCard({ event }: { event: LifeEvent }) {
	const clock = formatInterval(event);
	const details = describeEventData(event);
	const hasDetails = details.length > 0 || Boolean(event.content);

	return (
		<div className="story-event flex flex-col gap-2 py-2">
			<div className="flex flex-wrap items-start justify-between gap-2">
				<div className="min-w-0 space-y-1">
					<Text as="p" bold className="story-event-title">
						{event.title}
					</Text>
					{clock ? (
						<Text as="p" size="xs" tone="muted">
							{clock}
						</Text>
					) : null}
				</div>
				<div className="flex shrink-0 items-center gap-2">
					<Badge variant={badgeVariant(event)}>{event.sourceName}</Badge>
					<Badge variant="outline">{sourceKindLabel(event.sourceKind)}</Badge>
				</div>
			</div>
			{hasDetails ? (
				<Collapsible>
					<CollapsibleTrigger>详情</CollapsibleTrigger>
					<CollapsibleContent>
						<EventDetails event={event} />
					</CollapsibleContent>
				</Collapsible>
			) : null}
		</div>
	);
}
