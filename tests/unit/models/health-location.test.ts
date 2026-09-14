import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type FootprintPoint, validateFootprintDay } from "../../../src/models/footprint";
import type { SleepNight } from "../../../src/models/health-insights";
import { interpretSleepLocation } from "../../../src/models/health-location";

const originalZone = process.env.TZ;
const fields = ["offsetSeconds", "latitude", "longitude", "elevation", "speed", "course"];
const home = { latitude: 31.2, longitude: 121.4 };
const nearby = { latitude: 31.2, longitude: 121.5 };
const distant = { latitude: 35, longitude: 116 };
const establishedDates = ["2026-09-01", "2026-09-03", "2026-09-05", "2026-09-07", "2026-09-09"];
type Observation = { at: string; latitude: number; longitude: number };

beforeEach(() => {
	process.env.TZ = "UTC";
});
afterEach(() => {
	if (originalZone === undefined) delete process.env.TZ;
	else process.env.TZ = originalZone;
});

function night(place: { latitude: number; longitude: number } | null = home): SleepNight {
	return {
		id: "night",
		fellAsleepAt: "2026-09-12T22:00:00.000Z",
		wokeAt: "2026-09-13T06:00:00.000Z",
		inBedMinutes: null,
		asleepMinutes: 480,
		awakeMinutes: null,
		stages: [],
		timeline: [],
		sources: [],
		evidence: [],
		place: place
			? {
					...place,
					sampleCount: 2,
					firstAt: "2026-09-12T22:00:00.000Z",
					lastAt: "2026-09-13T06:00:00.000Z",
					radiusMeters: 50,
					summary: "入睡前后有附近轨迹",
				}
			: null,
	};
}

function overnight(date: string, place = home, times = ["00:00:00", "02:00:00"]): Observation[] {
	return times.map((time) => ({ ...place, at: `${date}T${time}.000Z` }));
}

async function dailyPackages(points: Observation[]) {
	const byDay = new Map<number, FootprintPoint[]>();
	for (const point of points) {
		const at = Date.parse(point.at);
		const utcDay = Math.floor(at / 86_400_000) * 86_400_000;
		const rows = byDay.get(utcDay) ?? [];
		rows.push([(at - utcDay) / 1000, point.latitude, point.longitude, null, null, null]);
		byDay.set(utcDay, rows);
	}
	return Promise.all(
		[...byDay].map(([utcDay, points]) =>
			validateFootprintDay({
				utcDay,
				data: { v: 1, fields, points: points.sort((a, b) => a[0] - b[0]) },
			}),
		),
	);
}

describe("sleep location interpretation", () => {
	it("suggests a residence only from repeated nights across at least a week, counted by night rather than point", async () => {
		const points = establishedDates.flatMap((date) => overnight(date));
		// One densely sampled night still supplies one night of evidence.
		for (let minute = 1; minute < 90; minute++)
			points.push({ ...home, at: `2026-09-01T00:${String(minute % 60).padStart(2, "0")}:30.000Z` });
		const days = await dailyPackages([...points, ...overnight("2026-09-11", nearby)]);
		const input = night();
		const before = structuredClone({ input, days });
		const result = interpretSleepLocation(input, days);
		expect(result).toMatchObject({
			kind: "residence",
			label: "可能在常住地",
			matchedNights: 5,
			observedNights: 6,
		});
		expect(result.detail).toContain("500 米");
		expect({ input, days }).toEqual(before);
	});

	it("suggests temporary travel accommodation relative to an established residence, without asserting a hotel", async () => {
		const days = await dailyPackages(establishedDates.flatMap((date) => overnight(date)));
		const result = interpretSleepLocation(night(distant), days);
		expect(result).toMatchObject({
			kind: "travel",
			label: "可能在旅途中住宿",
			matchedNights: 0,
			observedNights: 5,
		});
		expect(result.detail).toContain("酒店或临时住所");
		expect(result.detail).toContain("尚未确认");
		const shortStay = await dailyPackages([
			...establishedDates.flatMap((date) => overnight(date)),
			...overnight("2026-09-11", distant),
		]);
		expect(interpretSleepLocation(night(distant), shortStay)).toMatchObject({
			kind: "travel",
			matchedNights: 1,
			observedNights: 6,
		});
	});

	it("does not infer travel from a nearby stay or a distant visit without a known residence", async () => {
		const baseline = await dailyPackages(establishedDates.flatMap((date) => overnight(date)));
		expect(interpretSleepLocation(night(nearby), baseline)).toMatchObject({
			kind: "unknown",
			matchedNights: 0,
			observedNights: 5,
		});
		const sparse = await dailyPackages(
			["2026-09-01", "2026-09-05"].flatMap((date) => overnight(date)),
		);
		expect(interpretSleepLocation(night(distant), sparse)).toMatchObject({
			kind: "unknown",
			observedNights: 2,
		});
	});

	it("uses a familiar-place label when only a few nights or less than a week have been observed", async () => {
		const three = await dailyPackages(
			["2026-09-01", "2026-09-05", "2026-09-09"].flatMap((date) => overnight(date)),
		);
		expect(interpretSleepLocation(night(), three)).toMatchObject({
			kind: "familiar",
			matchedNights: 3,
			observedNights: 3,
		});
		const shortSpan = await dailyPackages(
			["2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12"].flatMap((date) =>
				overnight(date),
			),
		);
		expect(interpretSleepLocation(night(), shortSpan)).toMatchObject({
			kind: "familiar",
			matchedNights: 5,
		});
	});

	it("does not choose a home among equally common stays and does not call a recurring second home a trip", async () => {
		const alternating = ["2026-09-02", "2026-09-04", "2026-09-06", "2026-09-08", "2026-09-10"];
		const ambiguous = await dailyPackages([
			...establishedDates.flatMap((date) => overnight(date)),
			...alternating.flatMap((date) => overnight(date, distant)),
		]);
		expect(interpretSleepLocation(night(), ambiguous)).toMatchObject({
			kind: "familiar",
			matchedNights: 5,
			observedNights: 10,
		});
		const dominantDates = [
			"2026-08-20",
			"2026-08-21",
			"2026-08-22",
			"2026-08-23",
			"2026-08-24",
			...establishedDates,
		];
		const recurring = await dailyPackages([
			...dominantDates.flatMap((date) => overnight(date)),
			...alternating.flatMap((date) => overnight(date, distant)),
		]);
		expect(interpretSleepLocation(night(distant), recurring)).toMatchObject({
			kind: "familiar",
			matchedNights: 5,
			observedNights: 15,
		});
	});

	it("requires a substantial stationary overnight interval instead of isolated, brief or moving GPS samples", async () => {
		const days = await dailyPackages([
			...overnight("2026-09-01", home, ["00:00:00"]),
			...overnight("2026-09-02", home, ["00:00:00", "01:29:59"]),
			{ ...home, at: "2026-09-03T00:00:00.000Z" },
			{ ...nearby, at: "2026-09-03T02:00:00.000Z" },
			...overnight("2026-09-04", home, ["06:00:00", "08:00:00"]),
		]);
		expect(interpretSleepLocation(night(), days)).toMatchObject({
			kind: "unknown",
			observedNights: 0,
		});
		const threshold = await dailyPackages(overnight("2026-09-01", home, ["00:00:00", "01:30:00"]));
		expect(interpretSleepLocation(night(), threshold)).toMatchObject({
			kind: "unknown",
			matchedNights: 1,
			observedNights: 1,
		});
	});

	it("ignores future observations, the selected night itself and observations older than a month", async () => {
		const days = await dailyPackages([
			...overnight("2026-08-01"),
			...overnight("2026-09-13"),
			...overnight("2026-09-14"),
			...overnight("2026-09-05"),
		]);
		expect(interpretSleepLocation(night(), days)).toMatchObject({
			kind: "unknown",
			matchedNights: 1,
			observedNights: 1,
		});
		expect(interpretSleepLocation(night(null), days)).toMatchObject({
			kind: "unknown",
			matchedNights: 0,
			observedNights: 0,
		});
		expect(interpretSleepLocation(night(), [])).toMatchObject({
			kind: "unknown",
			matchedNights: 0,
			observedNights: 0,
		});
	});

	it("anchors a place to its first observation so sequential drift cannot connect different neighborhoods", async () => {
		const days = await dailyPackages([
			...overnight("2026-09-01", { latitude: 0, longitude: 0 }),
			...overnight("2026-09-03", { latitude: 0, longitude: 0.004 }),
			...overnight("2026-09-05", { latitude: 0, longitude: 0.008 }),
		]);
		expect(interpretSleepLocation(night({ latitude: 0, longitude: 0.008 }), days)).toMatchObject({
			kind: "unknown",
			matchedNights: 1,
			observedNights: 3,
		});
	});

	it("groups historical samples by the user's local night across UTC date boundaries", async () => {
		process.env.TZ = "America/New_York";
		const sameNight = [
			{ ...home, at: "2026-09-05T04:00:00.000Z" },
			{ ...home, at: "2026-09-05T06:00:00.000Z" },
		];
		const eveningOnly = [
			{ ...home, at: "2026-09-06T00:00:00.000Z" },
			{ ...home, at: "2026-09-06T02:00:00.000Z" },
		];
		expect(
			interpretSleepLocation(night(), await dailyPackages([...sameNight, ...eveningOnly])),
		).toMatchObject({ observedNights: 1, matchedNights: 1 });
		process.env.TZ = "Asia/Kolkata";
		const splitUtc = [
			{ ...home, at: "2026-09-04T23:00:00.000Z" },
			{ ...home, at: "2026-09-05T00:29:59.999Z" },
		];
		// 04:30 to 05:59:59.999 is still shorter than the minimum 90 observed minutes.
		expect(interpretSleepLocation(night(), await dailyPackages(splitUtc))).toMatchObject({
			observedNights: 0,
		});
		const longEnough = [
			{ ...home, at: "2026-09-04T22:59:59.000Z" },
			{ ...home, at: "2026-09-05T00:29:59.000Z" },
		];
		expect(interpretSleepLocation(night(), await dailyPackages(longEnough))).toMatchObject({
			observedNights: 1,
			matchedNights: 1,
		});
	});
});
