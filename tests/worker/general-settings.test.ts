import { afterEach, describe, expect, it, vi } from "vitest";
import {
	handleGetGeneralSettings,
	handlePutGeneralSettings,
	readGeneralSettings,
} from "../../worker/general-settings";
import { sqliteD1 } from "../helpers/sqlite-d1";

const databases: ReturnType<typeof sqliteD1>[] = [];
function setup() {
	const value = sqliteD1();
	databases.push(value);
	return value;
}
afterEach(() => {
	for (const database of databases.splice(0)) database.sqlite.close();
});

const settings = {
	places: [{ id: "home", label: "家", latitude: 31, longitude: 121, radiusMeters: 300 }],
	routine: { bedtime: "03:00", wakeTime: "11:00", timeZone: "Asia/Shanghai" },
};
function request(body: unknown) {
	return new Request("https://life.hexly.ai/api/settings/general", {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

describe("single-owner general settings", () => {
	it("reads empty settings without creating a row or conventional sleep assumptions", async () => {
		const { env, sqlite, queries } = setup();
		expect(await (await handleGetGeneralSettings(env)).json()).toEqual({
			data: { places: [], routine: null },
		});
		expect(sqlite.prepare("SELECT COUNT(*) AS n FROM general_settings").get()?.n).toBe(0);
		expect(queries.every((sql) => sql.startsWith("SELECT"))).toBe(true);
	});
	it("stores multiple named circles and a timezone-aware personal routine in one row", async () => {
		const { env, sqlite } = setup();
		const multiple = {
			...settings,
			places: [...settings.places, { ...settings.places[0], id: "office", label: "工作室" }],
		};
		expect(await (await handlePutGeneralSettings(request(multiple), env)).json()).toEqual({
			data: multiple,
		});
		expect(await readGeneralSettings(env)).toEqual(multiple);
		expect(sqlite.prepare("SELECT COUNT(*) AS n FROM general_settings").get()?.n).toBe(1);
	});
	it("leaves identical content and its timestamp unchanged, and replaces only this document", async () => {
		const { env, sqlite } = setup();
		vi.spyOn(Date, "now").mockReturnValue(100);
		await handlePutGeneralSettings(request(settings), env);
		vi.spyOn(Date, "now").mockReturnValue(200);
		await handlePutGeneralSettings(
			request({ ...settings, places: [{ ...settings.places[0], label: " 家 " }] }),
			env,
		);
		expect(sqlite.prepare("SELECT updated_at FROM general_settings").get()?.updated_at).toBe(100);
		await handlePutGeneralSettings(request({ ...settings, places: [], routine: null }), env);
		expect(await readGeneralSettings(env)).toEqual({ places: [], routine: null });
		expect(sqlite.prepare("SELECT updated_at FROM general_settings").get()?.updated_at).toBe(200);
	});
	it.each([null, {}, { ...settings, routine: { ...settings.routine, timeZone: "fake/zone" } }])(
		"rejects invalid settings before any write %#",
		async (input) => {
			const { env, sqlite } = setup();
			await handlePutGeneralSettings(request(settings), env);
			await expect(handlePutGeneralSettings(request(input), env)).rejects.toMatchObject({
				status: 400,
				code: "invalid_settings",
			});
			expect(await readGeneralSettings(env)).toEqual(settings);
			expect(sqlite.prepare("SELECT COUNT(*) AS n FROM general_settings").get()?.n).toBe(1);
		},
	);
	it("bounds request size and leaves stored settings unchanged", async () => {
		const { env } = setup();
		await handlePutGeneralSettings(request(settings), env);
		await expect(
			handlePutGeneralSettings(request({ text: "x".repeat(65_536) }), env),
		).rejects.toMatchObject({ status: 413 });
		expect(await readGeneralSettings(env)).toEqual(settings);
	});
	it("does not disguise unavailable or corrupt storage as empty preferences", async () => {
		const { env, sqlite } = setup();
		sqlite.prepare("INSERT INTO general_settings VALUES ('default', '{}', 1)").run();
		await expect(readGeneralSettings(env)).rejects.toThrow();
		sqlite.exec("DROP TABLE general_settings");
		await expect(readGeneralSettings(env)).rejects.toThrow();
	});
});
