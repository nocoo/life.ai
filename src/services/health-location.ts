import type { SleepNight } from "../models/health-insights";
import { interpretSleepLocation, type SleepLocation } from "../models/health-location";
import { createFootprintClient } from "./footprint-client";

export async function fetchSleepLocations(
	nights: SleepNight[],
	start: string,
	signal?: AbortSignal,
	client = createFootprintClient(),
): Promise<Record<string, SleepLocation>> {
	if (!nights.some((night) => night.place)) return {};
	const { days } = await client.days(
		new Date(Date.parse(start) - 30 * 86_400_000).toISOString(),
		start,
		signal,
	);
	signal?.throwIfAborted();
	return Object.fromEntries(
		nights
			.filter((night) => night.place)
			.map((night) => [night.id, interpretSleepLocation(night, days)]),
	);
}
