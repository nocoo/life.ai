import type { DayTimeline, HourSlot, LifeEvent, Precision } from "./types";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIMESTAMP =
	/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2})(?::(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?)?(?:\s*(Z|([+-])(\d{2}):?(\d{2})))?)?$/i;

/** Explicit ISO components only. Offsetless timestamps (including Apple exports) mean UTC. */
export function normalizeTimestamp(value: string): string {
	const match = typeof value === "string" ? TIMESTAMP.exec(value.trim()) : null;
	if (!match) throw new Error("时间必须是 ISO 日期或时间，例如 2026-09-13T08:30:00Z");
	const [, year, month, day, hour, minute, second, fraction, , sign, offsetHour, offsetMinute] =
		match;
	const date = new Date(0);
	date.setUTCFullYear(Number(year), Number(month) - 1, Number(day));
	if (
		date.getUTCFullYear() !== Number(year) ||
		date.getUTCMonth() !== Number(month) - 1 ||
		date.getUTCDate() !== Number(day) ||
		Number(hour ?? 0) > 23 ||
		Number(minute ?? 0) > 59 ||
		Number(second ?? 0) > 59 ||
		Number(offsetHour ?? 0) > 23 ||
		Number(offsetMinute ?? 0) > 59
	) {
		throw new Error("日期或时间超出有效范围");
	}
	date.setUTCHours(
		Number(hour ?? 0),
		Number(minute ?? 0),
		Number(second ?? 0),
		Number((fraction ?? "").padEnd(3, "0").slice(0, 3)),
	);
	const offset = (Number(offsetHour ?? 0) * 60 + Number(offsetMinute ?? 0)) * MINUTE;
	return new Date(date.getTime() + (sign === "-" ? offset : -offset)).toISOString();
}

export function timestampAtPrecision(value: string, precision: Precision): string {
	const date = new Date(normalizeTimestamp(value));
	switch (precision) {
		case "day":
			date.setUTCHours(0, 0, 0, 0);
			break;
		case "hour":
			date.setUTCMinutes(0, 0, 0);
			break;
		case "minute":
			date.setUTCSeconds(0, 0);
			break;
		case "second":
			date.setUTCMilliseconds(0);
			break;
	}
	return date.toISOString();
}

export function localDateKey(date = new Date()): string {
	if (!Number.isFinite(date.getTime())) throw new Error("无效日期");
	return [date.getFullYear().toString().padStart(4, "0"), date.getMonth() + 1, date.getDate()]
		.map((value) => String(value).padStart(2, "0"))
		.join("-");
}

function calendarDate(day: string): Date {
	if (!DATE.test(day)) throw new Error("日期必须是 YYYY-MM-DD");
	return new Date(normalizeTimestamp(day));
}

export function shiftLocalDate(day: string, amount: number): string {
	if (!Number.isInteger(amount)) throw new Error("日期偏移必须是整数");
	const date = calendarDate(day);
	date.setUTCDate(date.getUTCDate() + amount);
	return date.toISOString().slice(0, 10);
}

export function localDayWindow(day: string): { start: string; end: string } {
	calendarDate(day);
	return {
		start: new Date(`${day}T00:00:00`).toISOString(),
		end: new Date(`${shiftLocalDate(day, 1)}T00:00:00`).toISOString(),
	};
}

export function buildDayTimeline(day: string, events: LifeEvent[]): DayTimeline {
	const { start, end } = localDayWindow(day);
	const startMs = Date.parse(start);
	const endMs = Date.parse(end);
	const spans: { start: number; end: number }[][] = Array.from({ length: 24 }, () => []);
	const hours: HourSlot[] = Array.from({ length: 24 }, (_, hour) => ({
		hour,
		label: `${String(hour).padStart(2, "0")}:00`,
		instants: [],
		events: [],
		state: "normal",
	}));
	let previous = new Date(startMs - MINUTE);
	// Inspect local clock minutes so half-hour DST transitions are represented too.
	for (let instant = startMs; instant < endMs; instant += MINUTE) {
		const current = new Date(instant);
		const slotSpans = spans[current.getHours()] as { start: number; end: number }[];
		const last = slotSpans.at(-1);
		if (
			last &&
			current.getHours() === previous.getHours() &&
			current.getMinutes() > previous.getMinutes() &&
			current.getTimezoneOffset() === previous.getTimezoneOffset()
		) {
			last.end = Math.min(instant + MINUTE, endMs);
		} else {
			slotSpans.push({ start: instant, end: Math.min(instant + MINUTE, endMs) });
		}
		previous = current;
	}
	const selected = events
		.map((event) => ({
			event,
			start: Date.parse(event.occurredAt),
			end: event.endAt ? Date.parse(event.endAt) : Date.parse(event.occurredAt),
		}))
		.filter(({ event, start: eventStart, end: eventEnd }) =>
			event.precision === "day"
				? eventStart >= startMs && eventStart < endMs
				: eventStart < endMs && Math.max(eventEnd, eventStart + 1) > startMs,
		)
		.sort((a, b) => a.start - b.start || a.event.id.localeCompare(b.event.id));
	for (const slot of hours) {
		const slotSpans = spans[slot.hour] as { start: number; end: number }[];
		const duration = slotSpans.reduce((sum, span) => sum + span.end - span.start, 0);
		slot.instants = slotSpans.map((span) => span.start);
		slot.state = duration < HOUR ? "missing" : duration > HOUR ? "repeated" : "normal";
		slot.events = selected
			.filter(
				({ event, start: eventStart, end: eventEnd }) =>
					event.precision !== "day" &&
					slotSpans.some(
						(span) => eventStart < span.end && Math.max(eventEnd, eventStart + 1) > span.start,
					),
			)
			.map(({ event }) => event);
	}
	return {
		date: day,
		start,
		end,
		timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
		hours,
		allDay: selected.filter(({ event }) => event.precision === "day").map(({ event }) => event),
		totalEvents: selected.length,
		activeHours: hours.filter((slot) => slot.events.length > 0).length,
		sourceCount: new Set(selected.map(({ event }) => event.sourceId)).size,
	};
}
