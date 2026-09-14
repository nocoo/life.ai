import { afterEach, describe, expect, it, vi } from "vitest";
import { withD1Retry } from "../../worker/database";
import { readGeneralSettings } from "../../worker/general-settings";
import { sqliteD1 } from "../helpers/sqlite-d1";

afterEach(() => vi.useRealTimers());

describe("transient database connections", () => {
	it("recovers the shared settings read after a remote binding disconnect", async () => {
		vi.useFakeTimers();
		vi.spyOn(console, "warn").mockImplementation(() => {});
		const { env, sqlite } = sqliteD1();
		const prepare = vi.spyOn(env.DB, "prepare");
		prepare.mockImplementationOnce(() => {
			throw new Error("Network connection lost.");
		});
		try {
			const result = readGeneralSettings(env);
			await vi.runAllTimersAsync();
			expect(await result).toEqual({ places: [], routine: null });
			expect(prepare).toHaveBeenCalledTimes(2);
		} finally {
			sqlite.close();
		}
	});
	it.each([
		"D1_ERROR: Internal error in D1 DB storage caused object to be reset.",
		"D1 DB reset because its code was updated.",
		"Replica disconnected from primary.",
		"Cannot resolve D1 DB due to transient issue on remote node.",
		"internal error; reference = test",
		"D1_ERROR: internal error; reference = test",
	])("retries a documented transient failure: %s", async (message) => {
		vi.useFakeTimers();
		vi.spyOn(console, "warn").mockImplementation(() => {});
		const operation = vi
			.fn<() => Promise<number>>()
			.mockRejectedValueOnce(new Error(message))
			.mockResolvedValue(7);
		const result = withD1Retry(operation);
		await vi.runAllTimersAsync();
		expect(await result).toBe(7);
		expect(operation).toHaveBeenCalledTimes(2);
	});
	it("bounds repeated failures, including nested remote causes, without logging credentials", async () => {
		vi.useFakeTimers();
		const log = vi.spyOn(console, "warn").mockImplementation(() => {});
		const operation = vi
			.fn()
			.mockRejectedValue(new Error("private query contents", { cause: new Error("fetch failed") }));
		const result = expect(withD1Retry(operation)).rejects.toMatchObject({
			status: 503,
			code: "database_unavailable",
		});
		await vi.runAllTimersAsync();
		await result;
		expect(operation).toHaveBeenCalledTimes(3);
		expect(JSON.stringify(log.mock.calls)).not.toContain("private query contents");
	});
	it.each([
		new Error("D1_ERROR: no such table: missing"),
		new Error("D1_TYPE_ERROR"),
		new Error("AI request failed"),
		"unknown",
	])("does not retry non-transient errors: %s", async (error) => {
		const operation = vi.fn().mockRejectedValue(error);
		await expect(withD1Retry(operation)).rejects.toBe(error);
		expect(operation).toHaveBeenCalledTimes(1);
	});
});
