import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildDayInsights } from "../../../src/models/day-insights";
import { buildDayPlaces } from "../../../src/models/day-places";
import type { NamedPlace } from "../../../src/models/general-settings";
import { buildHealthStory, type SleepNight } from "../../../src/models/health-insights";
import { namedSleepLocation } from "../../../src/models/health-location";
import { buildDayTimeline } from "../../../src/models/time";
import { buildDayRecords } from "../../../src/viewmodels/day-records";
import { buildDayStory } from "../../../src/viewmodels/day-story";
import { buildHealthTimeline } from "../../../src/viewmodels/health-timeline";
import { eventFixture } from "../frontend/helpers";

const originalZone = process.env.TZ;
beforeEach(() => {
	process.env.TZ = "UTC";
});
afterEach(() => {
	if (originalZone === undefined) delete process.env.TZ;
	else process.env.TZ = originalZone;
});
const home: NamedPlace = {
	id: "home",
	label: "家",
	latitude: 31,
	longitude: 121,
	radiusMeters: 100,
};
const office: NamedPlace = { ...home, id: "office", label: "工作室", latitude: 31.01 };
const events = [home, home, office, office, home].map((point, index) =>
	eventFixture({
		id: `gps-${index}`,
		sourceId: "footprint",
		precision: "minute",
		title: "GPS",
		occurredAt: `2026-09-13T0${index}:00:00Z`,
		data: { latitude: point.latitude, longitude: point.longitude },
	}),
);

describe("named location stories", () => {
	it("keeps two small named regions distinct inside one coarse area and preserves ordered returns", () => {
		const timeline = buildDayTimeline("2026-09-13", events);
		const insights = buildDayInsights(events, timeline);
		expect(buildDayPlaces(insights.gps, 5).places).toHaveLength(1);
		const named = buildDayPlaces(insights.gps, 5, [home, office]);
		expect(named.places.map((place) => place.namedPlace?.id)).toEqual(["home", "office"]);
		expect(named.visits.map((visit) => visit.placeIndex)).toEqual([1, 2, 1]);
		expect(named.visits.flatMap((visit) => visit.points)).toHaveLength(events.length);
		expect(named.visits[0]?.observedMinutes).toBe(0); // A one-hour recording gap is still unknown.
	});
	it("does not spread a name to nearby samples outside the saved circle", () => {
		const outside = eventFixture({
			id: "outside",
			sourceId: "footprint",
			occurredAt: "2026-09-13T05:00:00Z",
			data: { latitude: 31.002, longitude: 121 },
		});
		const input = [...events, outside];
		const timeline = buildDayTimeline("2026-09-13", input);
		const areas = buildDayPlaces(buildDayInsights(input, timeline).gps, 10, [home, office]);
		expect(areas.places).toHaveLength(3);
		expect(areas.places[2]?.namedPlace).toBeUndefined();
		expect(areas.visits.at(-1)?.points[0]?.latitude).toBe(31.002);
	});
	it("expands the first map for each named arrival and renders labels without altering raw records", () => {
		const before = structuredClone(events);
		const timeline = buildDayTimeline("2026-09-13", events);
		const story = buildDayStory(
			timeline,
			buildDayInsights(events, timeline),
			5,
			[],
			[home, office],
		);
		const visits = story.hours.flatMap((hour) => hour.visits);
		expect(visits.map((item) => item.repeatedPlace)).toEqual([false, true, false, true, false]);
		expect(visits.map((item) => item.title)).toEqual([
			"家附近",
			"家附近",
			"工作室附近",
			"工作室附近",
			"家附近",
		]);
		expect(visits[2]?.stops[0]?.label).toBe("工作室");
		expect(
			buildDayRecords(timeline, "locations", [home, office]).map((row) => row.placeLabel),
		).toEqual(["家", "家", "工作室", "工作室", "家"]);
		expect(events).toEqual(before);
	});
	it("names mixed-hour movement without assigning the name to the remaining unknown area", () => {
		const input = [
			eventFixture({
				id: "home-first",
				sourceId: "footprint",
				occurredAt: "2026-09-13T00:00:00Z",
				data: { latitude: home.latitude, longitude: home.longitude },
			}),
			eventFixture({
				id: "street",
				sourceId: "footprint",
				occurredAt: "2026-09-13T00:15:00Z",
				data: { latitude: 31.002, longitude: 121 },
			}),
		];
		const timeline = buildDayTimeline("2026-09-13", input);
		const story = buildDayStory(timeline, buildDayInsights(input, timeline), 5, [], [home]);
		expect(story.hours[0]?.visits[0]?.title).toBe("家与周边");
		expect(story.hours[0]?.visits[0]?.stops.map((stop) => stop.label)).toEqual(["家", undefined]);
	});
	it("prefers the user's sleep-area name over residence/hotel guesses while preserving uncertainty", () => {
		const night: SleepNight = {
			id: "night",
			fellAsleepAt: "2026-09-12T20:00:00Z",
			wokeAt: "2026-09-13T04:00:00Z",
			asleepMinutes: 480,
			inBedMinutes: null,
			awakeMinutes: null,
			stages: [],
			timeline: [],
			sources: [],
			evidence: [],
			place: {
				...home,
				sampleCount: 2,
				firstAt: "2026-09-12T21:00:00Z",
				lastAt: "2026-09-13T03:00:00Z",
				radiusMeters: 50,
				summary: "附近采样",
			},
		};
		expect(namedSleepLocation(night, [home])).toMatchObject({
			kind: "named",
			label: "家",
			detail: expect.stringContaining("采样中心"),
		});
		expect(namedSleepLocation({ ...night, place: null }, [home])).toBeNull();
		expect(namedSleepLocation(night, [office])).toBeNull();
		const timeline = buildDayTimeline("2026-09-13", events);
		const insights = buildDayInsights(events, timeline);
		const health = { ...buildHealthStory([], timeline), nights: [night] };
		const story = buildHealthTimeline(
			timeline,
			insights,
			health,
			events,
			5,
			{
				night: {
					kind: "travel",
					label: "可能在旅途中住宿",
					detail: "此前的推测",
					matchedNights: 0,
					observedNights: 6,
				},
			},
			[home],
		);
		const item = story.hours
			.flatMap((hour) => hour.health ?? [])
			.find((item) => item.kind === "sleep");
		expect(item?.kind === "sleep" && item.location?.label).toBe("家");
	});
});
