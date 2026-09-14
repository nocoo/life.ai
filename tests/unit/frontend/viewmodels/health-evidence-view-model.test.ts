import { describe, expect, it, vi } from "vitest";
import type { TrackPoint } from "../../../../src/models/day-insights";
import * as evidence from "../../../../src/services/health-evidence";
import { createHealthEvidenceStore } from "../../../../src/viewmodels/health-evidence-view-model";

const point: TrackPoint = {
	latitude: 31,
	longitude: 121,
	occurredAt: "2026-09-13T01:00:00Z",
	precision: "second",
	sourceId: "apple-health",
	sourceName: "Apple 健康",
	elevation: null,
	speed: null,
};
function dependencies() {
	return {
		fetchWorkoutRoute: vi.fn<typeof evidence.fetchWorkoutRoute>().mockResolvedValue([point]),
		fetchEcgWaveform: vi
			.fn<typeof evidence.fetchEcgWaveform>()
			.mockResolvedValue({ samples: [0, 10, 900, -12], samplingHz: 512, metadata: {} }),
	};
}

describe("health attachment selection", () => {
	it("starts idle and publishes route evidence", async () => {
		const deps = dependencies();
		const store = createHealthEvidenceStore(deps);
		expect(store.getState()).toMatchObject({
			status: "idle",
			error: null,
			points: [],
			waveform: [],
			samplingHz: null,
		});
		const work = store.getState().load("route", ["ride.gpx"]);
		expect(store.getState().status).toBe("loading");
		await work;
		expect(store.getState()).toMatchObject({ status: "ready", points: [point], waveform: [] });
		expect(deps.fetchWorkoutRoute).toHaveBeenCalledWith(["ride.gpx"], expect.any(AbortSignal));
	});
	it("clears stale route evidence when switching to a full waveform", async () => {
		const deps = dependencies();
		const store = createHealthEvidenceStore(deps);
		await store.getState().load("route", ["ride.gpx"]);
		const oldSignal = deps.fetchWorkoutRoute.mock.calls[0]?.[1];
		const work = store.getState().load("ecg", ["heart.csv", "unused.csv"]);
		expect(oldSignal?.aborted).toBe(true);
		expect(store.getState()).toMatchObject({
			status: "loading",
			points: [],
			waveform: [],
			samplingHz: null,
		});
		await work;
		expect(store.getState()).toMatchObject({
			status: "ready",
			points: [],
			waveform: [0, 10, 900, -12],
			samplingHz: 512,
		});
		expect(deps.fetchEcgWaveform).toHaveBeenCalledWith("heart.csv", expect.any(AbortSignal));
	});
	it("discards an older successful response even if its transport ignores cancellation", async () => {
		const deps = dependencies();
		let resolveRoute: (points: TrackPoint[]) => void = () => {};
		deps.fetchWorkoutRoute.mockImplementation(
			() =>
				new Promise((resolve) => {
					resolveRoute = resolve;
				}),
		);
		const store = createHealthEvidenceStore(deps);
		const old = store.getState().load("route", ["old.gpx"]);
		await store.getState().load("ecg", ["new.csv"]);
		resolveRoute([point]);
		await old;
		expect(store.getState()).toMatchObject({
			status: "ready",
			points: [],
			waveform: [0, 10, 900, -12],
		});
	});
	it("discards old errors without hiding the new selection", async () => {
		const deps = dependencies();
		let rejectRoute: (error: Error) => void = () => {};
		deps.fetchWorkoutRoute.mockImplementation(
			() =>
				new Promise((_, reject) => {
					rejectRoute = reject;
				}),
		);
		const store = createHealthEvidenceStore(deps);
		const old = store.getState().load("route", ["old.gpx"]);
		await store.getState().load("ecg", ["new.csv"]);
		rejectRoute(new Error("old failed"));
		await old;
		expect(store.getState()).toMatchObject({ status: "ready", error: null });
	});
	it("aborts current work and ignores a late response without an error card", async () => {
		const deps = dependencies();
		let resolveRoute: (points: TrackPoint[]) => void = () => {};
		deps.fetchWorkoutRoute.mockImplementation(
			() =>
				new Promise((resolve) => {
					resolveRoute = resolve;
				}),
		);
		const store = createHealthEvidenceStore(deps);
		store.getState().abort();
		const work = store.getState().load("route", ["ride.gpx"]);
		const signal = deps.fetchWorkoutRoute.mock.calls[0]?.[1];
		store.getState().abort();
		expect(signal?.aborted).toBe(true);
		resolveRoute([point]);
		await work;
		expect(store.getState().points).toEqual([]);
		expect(store.getState().error).toBeNull();
	});
	it("surfaces actionable errors, clears them on retry and leaves absent sample rates unknown", async () => {
		const deps = dependencies();
		deps.fetchEcgWaveform.mockRejectedValueOnce(new Error("附件已更新，请重新载入。"));
		const store = createHealthEvidenceStore(deps);
		await store.getState().load("ecg", ["heart.csv"]);
		expect(store.getState()).toMatchObject({ status: "error", error: "附件已更新，请重新载入。" });
		deps.fetchEcgWaveform.mockResolvedValue({ metadata: {}, samples: [1, 2], samplingHz: null });
		await store.getState().load("ecg", ["heart.csv"]);
		expect(store.getState()).toMatchObject({
			status: "ready",
			error: null,
			waveform: [1, 2],
			samplingHz: null,
		});
		await store.getState().load("route", []);
		expect(store.getState()).toMatchObject({
			status: "error",
			error: "没有可读取的健康附件。",
			waveform: [],
		});
	});
	it("does not turn a transport AbortError into a user-facing failure", async () => {
		const deps = dependencies();
		deps.fetchWorkoutRoute.mockRejectedValue(new DOMException("cancelled", "AbortError"));
		const store = createHealthEvidenceStore(deps);
		await store.getState().load("route", ["ride.gpx"]);
		expect(store.getState().error).toBeNull();
	});
	it("defaults to the shared evidence services", async () => {
		vi.spyOn(evidence, "fetchWorkoutRoute").mockResolvedValue([point]);
		const store = createHealthEvidenceStore();
		await store.getState().load("route", ["ride.gpx"]);
		expect(store.getState().points).toEqual([point]);
	});
});
