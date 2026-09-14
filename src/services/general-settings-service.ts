import type { GeneralSettings } from "../models/general-settings";
import { apiGet, apiRequest } from "./http";

export function fetchGeneralSettings(signal?: AbortSignal): Promise<GeneralSettings> {
	return apiGet<GeneralSettings>("/api/settings/general", undefined, signal);
}

export function saveGeneralSettings(
	input: GeneralSettings,
	signal?: AbortSignal,
): Promise<GeneralSettings> {
	return apiRequest<GeneralSettings>("/api/settings/general", {
		method: "PUT",
		signal,
		body: JSON.stringify(input),
	});
}
