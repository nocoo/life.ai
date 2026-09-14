import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DaySourceSettings } from "../../../../src/models/day-sources";

vi.mock("../../../../src/services/day-sources-service", () => ({
	fetchDaySourceSettings: vi.fn(),
	saveDaySourceSettings: vi.fn(),
	removeDaySource: vi.fn(),
	testDaySource: vi.fn(),
}));

import {
	fetchDaySourceSettings,
	removeDaySource,
	saveDaySourceSettings,
	testDaySource,
} from "../../../../src/services/day-sources-service";
import { daySourcesSettingsStore as store } from "../../../../src/viewmodels/day-sources-view-model";

const settings: DaySourceSettings[] = [
	{ provider: "gecko", enabled: true, hasApiKey: true },
	{ provider: "firefly", enabled: true, hasApiKey: false },
];
function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<T>((done, fail) => {
		resolve = done;
		reject = fail;
	});
	return { promise, resolve, reject };
}
beforeEach(() => {
	store.getState().reset();
	vi.mocked(fetchDaySourceSettings).mockReset().mockResolvedValue(settings);
	vi.mocked(saveDaySourceSettings).mockReset().mockResolvedValue(settings);
	vi.mocked(removeDaySource).mockReset().mockResolvedValue([]);
	vi.mocked(testDaySource)
		.mockReset()
		.mockResolvedValue({ provider: "gecko", success: true, date: "2026-09-14", eventCount: 2 });
});
afterEach(() => store.getState().reset());

describe("data source settings", () => {
	it("loads saved status, saves a trimmed secret and clears only the saved provider's draft", async () => {
		await store.getState().load();
		expect(store.getState()).toMatchObject({ status: "ready", settings });
		store.getState().setApiKey(" fixture-secret ");
		await store.getState().save("firefly", true);
		expect(saveDaySourceSettings).toHaveBeenLastCalledWith("firefly", { enabled: true });
		expect(store.getState().apiKey).toBe(" fixture-secret ");
		await store.getState().remove("firefly");
		expect(store.getState().apiKey).toBe(" fixture-secret ");
		await store.getState().save("gecko", true);
		expect(saveDaySourceSettings).toHaveBeenLastCalledWith("gecko", {
			enabled: true,
			apiKey: "fixture-secret",
		});
		expect(store.getState().apiKey).toBe("");
		await store.getState().save("gecko", false);
		expect(saveDaySourceSettings).toHaveBeenLastCalledWith("gecko", { enabled: false });
		store.getState().setApiKey("discard");
		await store.getState().remove("gecko");
		expect(store.getState()).toMatchObject({ apiKey: "", settings: [], busy: null });
	});
	it("tests today's validated local window with the saved configuration", async () => {
		await store.getState().test("gecko");
		expect(testDaySource).toHaveBeenCalledWith(
			"gecko",
			expect.objectContaining({
				date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
				start: expect.stringMatching(/Z$/),
				end: expect.stringMatching(/Z$/),
				timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
			}),
		);
		expect(store.getState().connection?.success).toBe(true);
		store.getState().setApiKey("edited");
		expect(store.getState().connection).toBeNull();
	});
	it("serializes actions and does not reload over an active save", async () => {
		const pending = deferred<DaySourceSettings[]>();
		vi.mocked(saveDaySourceSettings).mockReturnValueOnce(pending.promise);
		const save = store.getState().save("gecko", false);
		await Promise.all([
			store.getState().save("firefly", true),
			store.getState().remove("gecko"),
			store.getState().test("firefly"),
			store.getState().load(),
		]);
		expect(saveDaySourceSettings).toHaveBeenCalledOnce();
		expect(removeDaySource).not.toHaveBeenCalled();
		expect(testDaySource).not.toHaveBeenCalled();
		expect(fetchDaySourceSettings).not.toHaveBeenCalled();
		pending.resolve(settings);
		await save;
		expect(store.getState().busy).toBeNull();
	});
	it("ignores obsolete reads, aborts on reset and reports current failures without losing drafts", async () => {
		const pending = deferred<DaySourceSettings[]>();
		vi.mocked(fetchDaySourceSettings).mockReturnValueOnce(pending.promise);
		const load = store.getState().load();
		const signal = vi.mocked(fetchDaySourceSettings).mock.calls[0]?.[0];
		await store.getState().load();
		expect(signal?.aborted).toBe(true);
		pending.resolve([]);
		await load;
		expect(store.getState().settings).toEqual(settings);
		vi.mocked(fetchDaySourceSettings).mockRejectedValueOnce(new Error("load failed"));
		await store.getState().load();
		expect(store.getState()).toMatchObject({ status: "error", error: "load failed" });
		vi.mocked(fetchDaySourceSettings).mockRejectedValueOnce(
			new DOMException("aborted", "AbortError"),
		);
		await store.getState().load();
		expect(store.getState().error).toBeNull();
	});
	it.each(["save", "remove", "test"] as const)(
		"preserves prior configuration when %s fails and ignores completion after reset",
		async (method) => {
			await store.getState().load();
			store.getState().setApiKey("draft");
			const mocked = vi.mocked(
				method === "save"
					? saveDaySourceSettings
					: method === "remove"
						? removeDaySource
						: testDaySource,
			);
			mocked.mockRejectedValueOnce(new Error("temporarily unavailable"));
			const act = () =>
				method === "save"
					? store.getState().save("gecko", true)
					: store.getState()[method]("gecko");
			await act();
			expect(store.getState()).toMatchObject({
				settings,
				apiKey: "draft",
				error: "temporarily unavailable",
				busy: null,
			});
			const pending = deferred<never>();
			mocked.mockReturnValueOnce(pending.promise);
			const work = act();
			store.getState().reset();
			pending.reject(new Error("old failure"));
			await work;
			expect(store.getState()).toMatchObject({
				status: "idle",
				error: null,
				busy: null,
				apiKey: "",
			});
		},
	);
});
