import type { DaySummaryQuery } from "../models/ai";
import type {
	DaySourceConnection,
	DaySourceInput,
	DaySourceProvider,
	DaySourceSettings,
	DaySourcesResult,
} from "../models/day-sources";
import { apiGet, apiRequest, apiSend } from "./http";

export function fetchDaySourceSettings(signal?: AbortSignal): Promise<DaySourceSettings[]> {
	return apiGet("/api/settings/sources", undefined, signal);
}
export function saveDaySourceSettings(
	provider: DaySourceProvider,
	input: DaySourceInput,
): Promise<DaySourceSettings[]> {
	return apiRequest(`/api/settings/sources/${provider}`, {
		method: "PUT",
		body: JSON.stringify(input),
	});
}
export function removeDaySource(provider: DaySourceProvider): Promise<DaySourceSettings[]> {
	return apiSend(`/api/settings/sources/${provider}`, "DELETE");
}
export function testDaySource(
	provider: DaySourceProvider,
	query: DaySummaryQuery,
): Promise<DaySourceConnection> {
	return apiSend(`/api/settings/sources/${provider}/test`, "POST", query);
}
export function fetchDaySources(
	query: DaySummaryQuery,
	signal?: AbortSignal,
): Promise<DaySourcesResult> {
	return apiGet("/api/day-sources", { ...query }, signal);
}
