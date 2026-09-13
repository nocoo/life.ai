import { normalizeTimestamp, timestampAtPrecision } from "../src/models/time.js";

// Re-export coordinator's shared time functions
export { normalizeTimestamp, timestampAtPrecision };

/**
 * Floors a UTC ISO timestamp or epoch ms to UTC hour boundary (ISO string).
 * Kept worker-specific for Connect hourly ingestion.
 */
export function floorToUtcHour(value: string | number): { iso: string; ms: number } {
	const epochMs = typeof value === "number" ? value : new Date(normalizeTimestamp(value)).getTime();
	const date = new Date(epochMs);
	date.setUTCMinutes(0, 0, 0);
	date.setUTCMilliseconds(0);
	return {
		iso: date.toISOString(),
		ms: date.getTime(),
	};
}
