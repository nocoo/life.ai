import type { Session } from "../models/types";
import { apiGet } from "./http";

export function fetchSession(signal?: AbortSignal): Promise<Session> {
	return apiGet<Session>("/api/session", undefined, signal);
}
