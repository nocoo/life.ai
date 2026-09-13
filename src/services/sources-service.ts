import type { Source } from "../models/types";
import { apiGet } from "./http";

export function fetchSources(signal?: AbortSignal): Promise<Source[]> {
	return apiGet<Source[]>("/api/sources", undefined, signal);
}
