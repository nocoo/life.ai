import type { Connect, CreatedConnect } from "../models/types";
import { apiGet, apiSend } from "./http";

export function fetchConnects(signal?: AbortSignal): Promise<Connect[]> {
	return apiGet<Connect[]>("/api/connects", undefined, signal);
}

export function createConnect(name: string, signal?: AbortSignal): Promise<CreatedConnect> {
	return apiSend<CreatedConnect>("/api/connects", "POST", { name }, signal);
}

export function revokeConnect(id: string, signal?: AbortSignal): Promise<Connect> {
	return apiSend<Connect>(`/api/connects/${encodeURIComponent(id)}`, "DELETE", undefined, signal);
}
