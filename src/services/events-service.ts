import { footprintDayEvents } from "../models/footprint";
import { normalizeTimestamp } from "../models/time";
import type { EventPage, LifeEvent } from "../models/types";
import { ApiError, apiGet } from "./http";

const MAX_EVENT_PAGES = 500;

export interface FetchEventsQuery {
	start: string;
	end: string;
	source?: string | null;
	signal?: AbortSignal;
	maxPages?: number;
}

export async function fetchEventPage(
	query: FetchEventsQuery & { cursor?: string | null },
): Promise<EventPage> {
	return apiGet<EventPage>(
		"/api/events",
		{
			start: query.start,
			end: query.end,
			source: query.source ?? undefined,
			cursor: query.cursor ?? undefined,
		},
		query.signal,
	);
}

export async function fetchAllEvents(query: FetchEventsQuery): Promise<LifeEvent[]> {
	const events: LifeEvent[] = [];
	const seenCursors = new Set<string>();
	let cursor: string | null | undefined;
	const maxPages = query.maxPages ?? MAX_EVENT_PAGES;
	for (let page = 0; page < maxPages; page += 1) {
		if (cursor) {
			if (seenCursors.has(cursor)) {
				throw new ApiError(0, "cursor_loop", "事件分页游标重复，已中止。");
			}
			seenCursors.add(cursor);
		}
		const batch = await fetchEventPage({ ...query, cursor });
		events.push(...batch.events);
		if (page === 0 && batch.footprintDays && (!query.source || query.source === "footprint")) {
			const window = {
				start: Date.parse(normalizeTimestamp(query.start)),
				end: Date.parse(normalizeTimestamp(query.end)),
			};
			for (const day of batch.footprintDays) events.push(...footprintDayEvents(day, window));
		}
		if (!batch.nextCursor) {
			return events.sort(
				(a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id),
			);
		}
		cursor = batch.nextCursor;
	}
	throw new ApiError(0, "too_many_pages", "事件分页过多，已中止。");
}
