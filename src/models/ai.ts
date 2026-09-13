import { normalizeTimestamp } from "./time";

export const DEFAULT_AI_MODEL = "@cf/qwen/qwen3-30b-a3b-fp8";

export interface AiSettings {
	provider: string;
	model: string;
	baseURL: string;
	sdkType: "openai" | "anthropic";
	authType: "apiKey" | "bearer";
	hasApiKey: boolean;
	configured: boolean;
}

export interface AiSettingsInput {
	provider: string;
	model: string;
	baseURL: string;
	sdkType: "openai" | "anthropic";
	authType: "apiKey" | "bearer";
	/** Omit to keep the key for the same provider and endpoint. */
	apiKey?: string;
}

export interface AiConnectionResult {
	success: boolean;
	response: string;
	provider: string;
	model: string;
}

export interface DaySummaryQuery {
	date: string;
	timeZone: string;
	start: string;
	end: string;
}

export interface DaySummary extends DaySummaryQuery {
	content: string;
	provider: string;
	model: string;
	generatedAt: string;
	eventCount: number;
	inputHash: string;
}

export interface DaySummaryResult {
	summary: DaySummary | null;
	stale: boolean;
	eventCount: number;
}

/** Verify browser-computed UTC boundaries in the named timezone, including DST. */
export function validateSummaryQuery(input: unknown): DaySummaryQuery {
	if (!input || typeof input !== "object") throw new Error("请选择有效日期与时区");
	const fields = input as Record<string, unknown>;
	if (
		typeof fields.date !== "string" ||
		!/^\d{4}-\d{2}-\d{2}$/.test(fields.date) ||
		typeof fields.timeZone !== "string" ||
		fields.timeZone.length > 100 ||
		typeof fields.start !== "string" ||
		typeof fields.end !== "string"
	)
		throw new Error("请选择有效日期与时区");
	normalizeTimestamp(fields.date);
	const start = normalizeTimestamp(fields.start);
	const end = normalizeTimestamp(fields.end);
	const startMs = Date.parse(start);
	const endMs = Date.parse(end);
	const formatter = new Intl.DateTimeFormat("en-US", {
		timeZone: fields.timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	});
	const dateAt = (instant: number) => {
		const parts = Object.fromEntries(
			formatter.formatToParts(instant).map(({ type, value }) => [type, value]),
		);
		return `${parts.year?.padStart(4, "0")}-${parts.month}-${parts.day}`;
	};
	if (
		endMs <= startMs ||
		endMs - startMs > 48 * 3_600_000 ||
		dateAt(startMs) !== fields.date ||
		dateAt(startMs - 1) === fields.date ||
		dateAt(endMs - 1) !== fields.date ||
		dateAt(endMs) === fields.date
	)
		throw new Error("UTC 时间范围与所选本地日期不一致");
	return { date: fields.date, timeZone: formatter.resolvedOptions().timeZone, start, end };
}
