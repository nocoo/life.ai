import { DescriptionList, Text } from "@nocoo/basalt";
import type { LifeEvent } from "../models/types";
import { describeEventData } from "../viewmodels/event-details";

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
