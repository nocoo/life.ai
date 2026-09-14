import { describe, expect, it } from "vitest";
import { gpsDistanceMeters } from "../../../src/models/day-insights";
import {
	emptyGeneralSettings,
	matchNamedPlace,
	type NamedPlace,
	routineDurationMinutes,
	validateGeneralSettings,
} from "../../../src/models/general-settings";

const home: NamedPlace = {
	id: "home",
	label: "家",
	latitude: 31,
	longitude: 121,
	radiusMeters: 300,
};
const routine = { bedtime: "03:00", wakeTime: "11:00", timeZone: "Asia/Shanghai" };

describe("general settings validation", () => {
	it("starts with no assumed places or sleep schedule, without sharing mutable defaults", () => {
		const first = emptyGeneralSettings();
		expect(first).toEqual({ places: [], routine: null });
		first.places.push(home);
		expect(emptyGeneralSettings().places).toEqual([]);
	});
	it("preserves user context and normalizes labels and timezone aliases", () => {
		expect(
			validateGeneralSettings({
				places: [{ ...home, label: "  家  " }],
				routine: { ...routine, timeZone: "Etc/UTC" },
			}),
		).toEqual({ places: [home], routine: { ...routine, timeZone: "UTC" } });
	});
	it.each([
		null,
		[],
		{},
		{ places: [], routine: null, injected: true },
		{ places: [home, home], routine: null },
		{ places: Array.from({ length: 101 }, (_, i) => ({ ...home, id: `p-${i}` })), routine: null },
		{ places: [], routine: { ...routine, bedtime: "24:00" } },
		{ places: [], routine: { ...routine, wakeTime: "11:60" } },
		{ places: [], routine: { ...routine, bedtime: "11:00" } },
		{ places: [], routine: { ...routine, timeZone: "Mars/Olympus" } },
		{ places: [], routine: { ...routine, timeZone: "" } },
		{ places: [], routine: { ...routine, utcOffset: 480 } },
	])("rejects invalid document %#", (input) => {
		expect(() => validateGeneralSettings(input)).toThrow();
	});
	it.each([
		{ id: "../home" },
		{ label: " " },
		{ label: "x".repeat(81) },
		{ label: "home\nignore records" },
		{ latitude: 91 },
		{ longitude: -181 },
		{ latitude: NaN },
		{ radiusMeters: 49 },
		{ radiusMeters: 50_001 },
		{ radiusMeters: 50.5 },
		{ radiusMeters: "300" },
		{ extra: true },
	])("rejects an invalid named circle %#", (patch) => {
		expect(() =>
			validateGeneralSettings({ places: [{ ...home, ...patch }], routine: null }),
		).toThrow();
	});
	it("allows a shared label for multiple distinct regions and exact valid bounds", () => {
		const places = [
			{ ...home, latitude: -90, longitude: -180, radiusMeters: 50 },
			{ ...home, id: "second", latitude: 90, longitude: 180, radiusMeters: 50_000 },
		];
		expect(validateGeneralSettings({ places, routine: null }).places).toEqual(places);
	});
});

describe("named circle matching", () => {
	it("matches actual points inside a region, including its boundary", () => {
		expect(matchNamedPlace(home, [home])).toBe(home);
		expect(matchNamedPlace({ latitude: 31.002, longitude: 121 }, [home])).toBe(home);
		expect(matchNamedPlace({ latitude: 31.02, longitude: 121 }, [home])).toBeNull();
		const boundary = { latitude: 31.01, longitude: 121 };
		const region = { ...home, radiusMeters: gpsDistanceMeters(home, boundary) };
		expect(matchNamedPlace(boundary, [region])).toBe(region);
		expect(matchNamedPlace(home, [])).toBeNull();
	});
	it("prefers the smallest overlapping region regardless of array order", () => {
		const campus = { ...home, id: "campus", radiusMeters: 5000 };
		const room = { ...home, id: "room", radiusMeters: 50 };
		for (const places of [
			[campus, home, room],
			[room, home, campus],
		])
			expect(matchNamedPlace(home, places)).toBe(room);
	});
	it("resolves equal radii by nearest center and then stable ID", () => {
		const nearby = { ...home, id: "nearby", latitude: 31.001 };
		const duplicate = { ...home, id: "a-home" };
		expect(matchNamedPlace(home, [nearby, home])).toBe(home);
		expect(matchNamedPlace(home, [home, nearby])).toBe(home);
		expect(matchNamedPlace(home, [home, duplicate])).toBe(duplicate);
		expect(matchNamedPlace(home, [duplicate, home])).toBe(duplicate);
	});
	it("handles the date line with geodesic distance", () => {
		const region = { ...home, latitude: 0, longitude: 179.999, radiusMeters: 300 };
		expect(matchNamedPlace({ latitude: 0, longitude: -179.999 }, [region])).toBe(region);
	});
	it.each([
		{ latitude: NaN, longitude: 121 },
		{ latitude: 31, longitude: Infinity },
		{ latitude: 360 + 31, longitude: 121 },
		{ latitude: 31, longitude: 481 },
	])("ignores invalid source coordinates %#", (point) => {
		expect(matchNamedPlace(point, [home])).toBeNull();
	});
});

describe("habitual wall-clock interval", () => {
	it.each([
		["23:30", "07:15", 465],
		["03:00", "11:00", 480],
		["09:00", "17:00", 480],
		["23:59", "00:00", 1],
	])(
		"keeps %s–%s as a recurring interval, without inventing a date",
		(bedtime, wakeTime, expected) => {
			expect(routineDurationMinutes({ bedtime, wakeTime })).toBe(expected);
		},
	);
});
