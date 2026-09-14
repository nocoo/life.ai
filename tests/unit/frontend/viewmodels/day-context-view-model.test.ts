import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DaySun, DayWeather } from "../../../../src/models/day-context";
import type { TrackPoint } from "../../../../src/models/day-insights";
import type { DayPlaces, GpsPlace } from "../../../../src/models/day-places";
import type { DayTimeline } from "../../../../src/models/types";
import { abortError } from "../helpers";

vi.mock("../../../../src/services/day-context-service", () => ({
	fetchDayWeather: vi.fn(),
	fetchDaySun: vi.fn(),
}));

import { fetchDaySun, fetchDayWeather } from "../../../../src/services/day-context-service";
import {
	dayContextQuery,
	dayContextStore,
	sameDayContext,
	solarMoments,
} from "../../../../src/viewmodels/day-context-view-model";

const fetchWeather = vi.mocked(fetchDayWeather);
const fetchSun = vi.mocked(fetchDaySun);

const query = {
	date: "2026-09-13",
	timeZone: "Asia/Shanghai",
	start: "2026-09-12T16:00:00.000Z",
	end: "2026-09-13T16:00:00.000Z",
	latitude: 31.23,
	longitude: 121.47,
};

const weather: DayWeather = {
	temperatureMin: 16,
	temperatureMax: 28,
	temperatureMean: 22,
	precipitationMm: 0,
	windMaxKmh: 12,
	weatherCode: 0,
	sampleCount: 24,
	expectedSamples: 24,
	complete: true,
	kind: "forecast",
};

const sun: DaySun = {
	events: [{ kind: "sunrise", occurredAt: "2026-09-12T21:54:00.000Z" }],
	daylightMinutes: 720,
	status: "normal",
};

function timeline(): DayTimeline {
	return {
		date: query.date,
		start: query.start,
		end: query.end,
		timezone: query.timeZone,
		hours: [],
		allDay: [],
		totalEvents: 0,
		activeHours: 0,
		sourceCount: 0,
	};
}

function point(overrides: Partial<TrackPoint> = {}): TrackPoint {
	return {
		latitude: 31.234,
		longitude: 121.473,
		occurredAt: query.start,
		precision: "second",
		sourceId: "footprint",
		sourceName: "GPS",
		elevation: null,
		speed: null,
		...overrides,
	};
}

function places(overrides: Partial<DayPlaces> = {}): DayPlaces {
	const anchor = point();
	const place: GpsPlace = {
		id: "place-1",
		index: 0,
		anchor: { latitude: 31.234, longitude: 121.473 },
		radiusKm: 5,
		pointCount: 1,
		totalObservedMinutes: 10,
		firstObservedAt: query.start,
		lastObservedAt: query.end,
	};
	return {
		radiusKm: 5,
		places: [place],
		visits: [],
		representativePlace: place,
		allDayPoints: [anchor],
		totalPoints: 1,
		timedPoints: 1,
		...overrides,
	};
}

describe("day context helpers", () => {
	it("uses the representative GPS anchor and rounds coordinates", () => {
		expect(dayContextQuery(timeline(), places())).toEqual(query);
		expect(
			dayContextQuery(
				timeline(),
				places({
					representativePlace: null,
					allDayPoints: [point({ latitude: 39.904, longitude: 116.407 })],
				}),
			),
		).toMatchObject({ latitude: 39.9, longitude: 116.41 });
		expect(
			dayContextQuery(timeline(), places({ representativePlace: null, allDayPoints: [] })),
		).toBeNull();
		expect(sameDayContext(query, { ...query, latitude: 31.24 })).toBe(false);
		expect(sameDayContext(null, null)).toBe(true);
	});

	it("projects solar instants into the user's clock including a DST hour", () => {
		const moments = solarMoments(sun, query);
		expect(moments[0]).toMatchObject({ hour: 5, clock: "05:54", label: "日出" });
		const fall = solarMoments(
			{
				events: [{ kind: "sunset", occurredAt: "2026-11-01T08:30:00.000Z" }],
				daylightMinutes: 600,
				status: "normal",
			},
			{
				...query,
				timeZone: "America/Los_Angeles",
				date: "2026-11-01",
				start: "2026-11-01T07:00:00.000Z",
				end: "2026-11-02T08:00:00.000Z",
			},
		);
		expect(fall[0]).toMatchObject({ hour: 1, label: "日落" });
	});
});

describe("dayContextStore", () => {
	beforeEach(() => {
		dayContextStore.getState().abort();
		fetchWeather.mockReset();
		fetchSun.mockReset();
		fetchWeather.mockResolvedValue(weather);
		fetchSun.mockResolvedValue(sun);
	});

	it("loads weather and sun independently", async () => {
		await dayContextStore.getState().load(query);
		expect(dayContextStore.getState()).toMatchObject({
			weatherStatus: "ready",
			sunStatus: "ready",
			weather,
			solar: [{ label: "日出", hour: 5 }],
		});
	});

	it("marks weather unavailable without failing sun", async () => {
		fetchWeather.mockResolvedValue(null);
		await dayContextStore.getState().load(query);
		expect(dayContextStore.getState()).toMatchObject({
			weatherStatus: "unavailable",
			sunStatus: "ready",
			weather: null,
		});
	});

	it("keeps the later load when an earlier weather response arrives late", async () => {
		let finish: (value: DayWeather) => void = () => {};
		fetchWeather.mockImplementationOnce(
			() =>
				new Promise<DayWeather>((resolve) => {
					finish = resolve;
				}),
		);
		const first = dayContextStore.getState().load(query);
		const nextQuery = { ...query, latitude: 39.9 };
		fetchWeather.mockResolvedValue({ ...weather, temperatureMax: 10 });
		const second = dayContextStore.getState().load(nextQuery);
		finish(weather);
		await Promise.all([first, second]);
		expect(dayContextStore.getState().query?.latitude).toBe(39.9);
		expect(dayContextStore.getState().weather?.temperatureMax).toBe(10);
	});

	it("ignores aborted failures and reset returns to idle", async () => {
		fetchWeather.mockImplementation((_next, signal) => {
			return new Promise((_resolve, reject) => {
				signal.addEventListener("abort", () => reject(abortError()));
			});
		});
		const pending = dayContextStore.getState().load(query);
		dayContextStore.getState().abort();
		await pending;
		expect(dayContextStore.getState()).toMatchObject({
			weatherStatus: "idle",
			sunStatus: "idle",
			query: null,
			weatherError: null,
		});
	});

	it("records public errors and retries the current query", async () => {
		fetchWeather.mockRejectedValueOnce(new Error("公共数据服务暂时不可用。"));
		fetchSun.mockRejectedValueOnce(new Error("公共数据服务暂时不可用。"));
		await dayContextStore.getState().load(query);
		expect(dayContextStore.getState()).toMatchObject({
			weatherStatus: "error",
			weatherError: "公共数据服务暂时不可用。",
			sunStatus: "error",
			sunError: "公共数据服务暂时不可用。",
		});
		fetchWeather.mockResolvedValue(weather);
		await dayContextStore.getState().retry();
		expect(dayContextStore.getState().weatherStatus).toBe("ready");
	});

	it("clears context when the timeline has no GPS query", async () => {
		await dayContextStore.getState().load(query);
		await dayContextStore.getState().load(null);
		expect(dayContextStore.getState()).toMatchObject({
			query: null,
			weatherStatus: "idle",
			sun: null,
		});
	});
});
