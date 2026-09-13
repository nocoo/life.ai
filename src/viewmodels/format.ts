import type { LifeEvent, Precision } from "../models/types";

export function formatByteSize(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes < 0) {
		return "0 B";
	}
	if (bytes < 1024) {
		return `${Math.round(bytes)} B`;
	}
	if (bytes < 1024 * 1024) {
		return `${(bytes / 1024).toFixed(1)} KB`;
	}
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatLocalDate(day: string): string {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
	if (!match) {
		return day;
	}
	const year = Number(match[1]);
	const month = Number(match[2]);
	const date = Number(match[3]);
	const value = new Date(year, month - 1, date);
	if (Number.isNaN(value.getTime())) {
		return day;
	}
	return new Intl.DateTimeFormat("zh-CN", { dateStyle: "full" }).format(value);
}

function clockOptions(precision: Precision): Intl.DateTimeFormatOptions {
	if (precision === "hour") {
		return { hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
	}
	if (precision === "minute") {
		return { hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
	}
	return { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" };
}

export function formatDurationMinutes(value: number | null): string {
	if (value === null || !Number.isFinite(value)) {
		return "—";
	}
	const total = Math.round(value);
	if (total < 0) {
		return "—";
	}
	const hours = Math.floor(total / 60);
	const rest = total % 60;
	if (hours > 0 && rest > 0) {
		return `${hours} 小时 ${rest} 分`;
	}
	if (hours > 0) {
		return `${hours} 小时`;
	}
	return `${total} 分`;
}

export function formatLocalClock(iso: string, precision: Precision): string | null {
	if (precision === "day") {
		return null;
	}
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) {
		return null;
	}
	return new Intl.DateTimeFormat("zh-CN", clockOptions(precision)).format(date);
}

export function formatInterval(event: LifeEvent): string | null {
	const start = formatLocalClock(event.occurredAt, event.precision);
	if (!start) {
		return null;
	}
	if (!event.endAt) {
		return start;
	}
	const end = formatLocalClock(event.endAt, event.precision);
	if (!end || end === start) {
		return start;
	}
	return `${start}–${end}`;
}

export function formatAbsoluteTime(iso: string | null): string {
	if (!iso) {
		return "从未";
	}
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) {
		return iso;
	}
	return new Intl.DateTimeFormat("zh-CN", {
		dateStyle: "medium",
		timeStyle: "short",
		hourCycle: "h23",
	}).format(date);
}

export function ingestCurlExample(token: string): string {
	return [
		"curl -X POST https://life.worker.hexly.ai/api/ingest \\",
		`  -H "Authorization: Bearer ${token}" \\`,
		'  -H "Content-Type: application/json" \\',
		`  -d '{"timestamp":"2026-01-01T00:00:00Z","title":"示例快照"}'`,
	].join("\n");
}
