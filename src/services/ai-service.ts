import type {
	AiConnectionResult,
	AiSettings,
	AiSettingsInput,
	DaySummaryQuery,
	DaySummaryResult,
} from "../models/ai";
import { apiGet, apiRequest, apiSend } from "./http";

export function fetchAiSettings(signal?: AbortSignal): Promise<AiSettings> {
	return apiGet<AiSettings>("/api/settings/ai", undefined, signal);
}

export function saveAiSettings(input: AiSettingsInput, signal?: AbortSignal): Promise<AiSettings> {
	return apiRequest<AiSettings>("/api/settings/ai", {
		method: "PUT",
		signal,
		body: JSON.stringify(input),
	});
}

export function testSavedAiConnection(signal?: AbortSignal): Promise<AiConnectionResult> {
	return apiSend<AiConnectionResult>("/api/settings/ai/test", "POST", undefined, signal);
}

export function fetchDaySummary(
	query: DaySummaryQuery,
	signal?: AbortSignal,
): Promise<DaySummaryResult> {
	return apiGet<DaySummaryResult>(
		"/api/day-summary",
		{
			date: query.date,
			timeZone: query.timeZone,
			start: query.start,
			end: query.end,
		},
		signal,
	);
}

export function generateDaySummary(
	query: DaySummaryQuery,
	signal?: AbortSignal,
	revision?: string,
): Promise<DaySummaryResult> {
	const note = revision?.trim();
	return apiSend<DaySummaryResult>(
		"/api/day-summary",
		"POST",
		note ? { ...query, revision: note } : query,
		signal,
	);
}
