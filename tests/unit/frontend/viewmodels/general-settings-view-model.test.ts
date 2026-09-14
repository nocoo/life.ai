import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GeneralSettings, NamedPlace } from "../../../../src/models/general-settings";
import {
	fetchGeneralSettings,
	saveGeneralSettings,
} from "../../../../src/services/general-settings-service";
import { ApiError } from "../../../../src/services/http";
import { generalSettingsStore } from "../../../../src/viewmodels/general-settings-view-model";
import { abortError } from "../helpers";

vi.mock("../../../../src/services/general-settings-service", () => ({
	fetchGeneralSettings: vi.fn(),
	saveGeneralSettings: vi.fn(),
}));

const fetchMock = vi.mocked(fetchGeneralSettings);
const saveMock = vi.mocked(saveGeneralSettings);

const samplePlace: NamedPlace = {
	id: "place-1",
	label: "公司",
	latitude: 31.23,
	longitude: 121.47,
	radiusMeters: 400,
};

const sampleSettings: GeneralSettings = {
	places: [samplePlace],
	routine: {
		bedtime: "23:00",
		wakeTime: "07:00",
		timeZone: "Asia/Shanghai",
	},
};

describe("generalSettingsStore", () => {
	beforeEach(() => {
		generalSettingsStore.getState().reset();
		vi.resetAllMocks();
	});

	describe("load and reset", () => {
		it("loads settings successfully and sets ready status", async () => {
			fetchMock.mockResolvedValueOnce(sampleSettings);

			const loadPromise = generalSettingsStore.getState().load();
			expect(generalSettingsStore.getState().status).toBe("loading");

			await loadPromise;
			const state = generalSettingsStore.getState();
			expect(state.status).toBe("ready");
			expect(state.settings).toEqual(sampleSettings);
			expect(state.routineEnabled).toBe(true);
			expect(state.routineDraft.bedtime).toBe("23:00");
			expect(state.routineDraft.wakeTime).toBe("07:00");
			expect(state.routineDraft.timeZone).toBe("Asia/Shanghai");
		});

		it("handles load failure and captures error", async () => {
			fetchMock.mockRejectedValueOnce(new Error("网络异常"));

			await generalSettingsStore.getState().load();
			const state = generalSettingsStore.getState();
			expect(state.status).toBe("error");
			expect(state.error).toBe("网络异常");
			expect(state.expired).toBe(false);
		});

		it("identifies session expiration on 401", async () => {
			fetchMock.mockRejectedValueOnce(new ApiError(401, "session_expired", "登录过期"));

			await generalSettingsStore.getState().load();
			const state = generalSettingsStore.getState();
			expect(state.status).toBe("error");
			expect(state.expired).toBe(true);
		});

		it("discards late load result if reset is called in flight", async () => {
			let finish: (value: GeneralSettings) => void = () => {};
			fetchMock.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						finish = resolve;
					}),
			);

			const pending = generalSettingsStore.getState().load();
			generalSettingsStore.getState().reset();

			finish(sampleSettings);
			await pending;

			expect(generalSettingsStore.getState().status).toBe("idle");
			expect(generalSettingsStore.getState().settings).toBeNull();
		});

		it("ignores AbortError during load without changing state to error", async () => {
			fetchMock.mockRejectedValueOnce(abortError());

			await generalSettingsStore.getState().load();
			expect(generalSettingsStore.getState().status).toBe("loading");
			expect(generalSettingsStore.getState().error).toBeNull();
		});
	});

	describe("place drafting, creation and editing", () => {
		it("initializes an empty place draft with default radius and seeded center", () => {
			generalSettingsStore.getState().beginPlace(undefined, { latitude: 30, longitude: 120 });
			const draft = generalSettingsStore.getState().placeDraft;
			expect(draft).toEqual({
				id: null,
				label: "",
				center: { latitude: 30, longitude: 120 },
				radiusMeters: 300,
			});
		});

		it("populates place draft when editing an existing place", () => {
			generalSettingsStore.getState().beginPlace(samplePlace);
			const draft = generalSettingsStore.getState().placeDraft;
			expect(draft).toEqual({
				id: "place-1",
				label: "公司",
				center: { latitude: 31.23, longitude: 121.47 },
				radiusMeters: 400,
			});
		});

		it("cancels place draft cleanly", () => {
			generalSettingsStore.getState().beginPlace(samplePlace);
			expect(generalSettingsStore.getState().placeDraft).not.toBeNull();
			generalSettingsStore.getState().cancelPlace();
			expect(generalSettingsStore.getState().placeDraft).toBeNull();
		});

		it("patches place draft properties", () => {
			generalSettingsStore.getState().beginPlace();
			generalSettingsStore.getState().setPlaceDraft({ label: "健身房", radiusMeters: 500 });
			const draft = generalSettingsStore.getState().placeDraft;
			expect(draft?.label).toBe("健身房");
			expect(draft?.radiusMeters).toBe(500);

			// Calling patch without draft does nothing safely
			generalSettingsStore.getState().cancelPlace();
			generalSettingsStore.getState().setPlaceDraft({ label: "无影响" });
			expect(generalSettingsStore.getState().placeDraft).toBeNull();
		});
	});

	describe("savePlace and deletePlace", () => {
		it("refuses to save when settings are not loaded", async () => {
			generalSettingsStore.getState().beginPlace();
			generalSettingsStore.getState().setPlaceDraft({
				label: "家",
				center: { latitude: 31, longitude: 121 },
			});
			const ok = await generalSettingsStore.getState().savePlace();
			expect(ok).toBe(false);
			expect(generalSettingsStore.getState().error).toBe("请先加载通用设置");
		});

		it("validates draft requirements before saving", async () => {
			fetchMock.mockResolvedValueOnce(sampleSettings);
			await generalSettingsStore.getState().load();

			// 1. Missing draft
			expect(await generalSettingsStore.getState().savePlace()).toBe(false);

			// 2. Empty label
			generalSettingsStore.getState().beginPlace();
			expect(await generalSettingsStore.getState().savePlace()).toBe(false);
			expect(generalSettingsStore.getState().error).toBe("请填写地点名称");

			// 3. Missing center coordinates
			generalSettingsStore.getState().setPlaceDraft({ label: "有名称" });
			expect(await generalSettingsStore.getState().savePlace()).toBe(false);
			expect(generalSettingsStore.getState().error).toBe("请在地图上选择地点中心位置");
		});

		it("creates a new place and saves to service, preserving routine settings", async () => {
			fetchMock.mockResolvedValueOnce(sampleSettings);
			await generalSettingsStore.getState().load();

			generalSettingsStore.getState().beginPlace(undefined, { latitude: 31.25, longitude: 121.5 });
			generalSettingsStore.getState().setPlaceDraft({ label: "新家", radiusMeters: 250 });

			const expectedPlaces = [
				samplePlace,
				{
					id: expect.any(String),
					label: "新家",
					latitude: 31.25,
					longitude: 121.5,
					radiusMeters: 250,
				},
			];

			saveMock.mockImplementationOnce(async (saved) => saved);

			const ok = await generalSettingsStore.getState().savePlace();
			expect(ok).toBe(true);
			expect(generalSettingsStore.getState().placeDraft).toBeNull();
			expect(generalSettingsStore.getState().message).toBe("地点保存成功");
			expect(saveMock).toHaveBeenCalledWith(
				{
					places: expectedPlaces,
					routine: sampleSettings.routine,
				},
				expect.any(AbortSignal),
			);
		});

		it("updates an existing place by ID", async () => {
			fetchMock.mockResolvedValueOnce(sampleSettings);
			await generalSettingsStore.getState().load();

			generalSettingsStore.getState().beginPlace(samplePlace);
			generalSettingsStore.getState().setPlaceDraft({ label: "总部大楼", radiusMeters: 600 });

			saveMock.mockImplementationOnce(async (saved) => saved);

			const ok = await generalSettingsStore.getState().savePlace();
			expect(ok).toBe(true);
			expect(generalSettingsStore.getState().settings?.places[0]?.label).toBe("总部大楼");
			expect(generalSettingsStore.getState().settings?.places[0]?.radiusMeters).toBe(600);
		});

		it("catches validation schema error during candidate validation", async () => {
			fetchMock.mockResolvedValueOnce(sampleSettings);
			await generalSettingsStore.getState().load();

			generalSettingsStore.getState().beginPlace();
			generalSettingsStore.getState().setPlaceDraft({
				label: "半径过大",
				center: { latitude: 30, longitude: 120 },
				radiusMeters: 999_999, // exceeds max 50000
			});

			const ok = await generalSettingsStore.getState().savePlace();
			expect(ok).toBe(false);
			expect(generalSettingsStore.getState().error).toBe("地点半径不能超过 50 公里");
		});

		it("deletes a place by ID and keeps unaffected places", async () => {
			fetchMock.mockResolvedValueOnce(sampleSettings);
			await generalSettingsStore.getState().load();

			saveMock.mockImplementationOnce(async (saved) => saved);

			const ok = await generalSettingsStore.getState().deletePlace("place-1");
			expect(ok).toBe(true);
			expect(generalSettingsStore.getState().settings?.places).toHaveLength(0);
			expect(generalSettingsStore.getState().message).toBe("地点已删除");
		});

		it("handles savePlace API failure and preserves draft for retry", async () => {
			fetchMock.mockResolvedValueOnce(sampleSettings);
			await generalSettingsStore.getState().load();

			generalSettingsStore.getState().beginPlace();
			generalSettingsStore.getState().setPlaceDraft({
				label: "咖啡店",
				center: { latitude: 31, longitude: 121 },
			});

			saveMock.mockRejectedValueOnce(new Error("服务端存储失败"));

			const ok = await generalSettingsStore.getState().savePlace();
			expect(ok).toBe(false);
			expect(generalSettingsStore.getState().error).toBe("服务端存储失败");
			// Draft is NOT cleared on failure so user does not lose their input
			expect(generalSettingsStore.getState().placeDraft?.label).toBe("咖啡店");
		});

		it("clears placeDraft if deleting the place currently being edited", async () => {
			fetchMock.mockResolvedValueOnce(sampleSettings);
			await generalSettingsStore.getState().load();

			generalSettingsStore.getState().beginPlace(samplePlace);
			expect(generalSettingsStore.getState().placeDraft?.id).toBe("place-1");

			saveMock.mockImplementationOnce(async (saved) => saved);

			const ok = await generalSettingsStore.getState().deletePlace("place-1");
			expect(ok).toBe(true);
			expect(generalSettingsStore.getState().placeDraft).toBeNull();
		});

		it("keeps placeDraft if deleting a different place", async () => {
			const anotherPlace: NamedPlace = {
				id: "place-2",
				label: "学校",
				latitude: 31.24,
				longitude: 121.48,
				radiusMeters: 500,
			};
			fetchMock.mockResolvedValueOnce({
				places: [samplePlace, anotherPlace],
				routine: null,
			});
			await generalSettingsStore.getState().load();

			generalSettingsStore.getState().beginPlace(samplePlace);

			saveMock.mockImplementationOnce(async (saved) => saved);

			const ok = await generalSettingsStore.getState().deletePlace("place-2");
			expect(ok).toBe(true);
			expect(generalSettingsStore.getState().placeDraft?.id).toBe("place-1");
		});

		it("identifies session expiration on savePlace failure", async () => {
			fetchMock.mockResolvedValueOnce(sampleSettings);
			await generalSettingsStore.getState().load();

			generalSettingsStore.getState().beginPlace(samplePlace);
			saveMock.mockRejectedValueOnce(new ApiError(401, "session_expired", "请重新登录"));

			const ok = await generalSettingsStore.getState().savePlace();
			expect(ok).toBe(false);
			expect(generalSettingsStore.getState().expired).toBe(true);
		});

		it("identifies session expiration on deletePlace failure", async () => {
			fetchMock.mockResolvedValueOnce(sampleSettings);
			await generalSettingsStore.getState().load();

			saveMock.mockRejectedValueOnce(new ApiError(401, "session_expired", "请重新登录"));

			const ok = await generalSettingsStore.getState().deletePlace("place-1");
			expect(ok).toBe(false);
			expect(generalSettingsStore.getState().expired).toBe(true);
		});

		it("falls back gracefully when Intl.DateTimeFormat throws in defaultTimeZone", () => {
			const originalDateTimeFormat = Intl.DateTimeFormat;
			try {
				// @ts-expect-error test throw
				Intl.DateTimeFormat = () => {
					throw new Error("Intl failure");
				};
				generalSettingsStore.getState().reset();
				expect(generalSettingsStore.getState().routineDraft).toEqual({
					bedtime: "",
					wakeTime: "",
					timeZone: "Asia/Shanghai",
				});
			} finally {
				Intl.DateTimeFormat = originalDateTimeFormat;
			}
		});
	});

	describe("sleep routine management", () => {
		it("patches routine draft and toggle state", () => {
			generalSettingsStore.getState().setRoutineEnabled(true);
			expect(generalSettingsStore.getState().routineEnabled).toBe(true);

			generalSettingsStore.getState().setRoutineDraft({ bedtime: "22:45", wakeTime: "06:30" });
			const draft = generalSettingsStore.getState().routineDraft;
			expect(draft.bedtime).toBe("22:45");
			expect(draft.wakeTime).toBe("06:30");
		});

		it("refuses to save routine before settings are loaded", async () => {
			const ok = await generalSettingsStore.getState().saveRoutine();
			expect(ok).toBe(false);
			expect(generalSettingsStore.getState().error).toBe("请先加载通用设置");
		});

		it("requires both bedtime and wakeTime if routine is enabled", async () => {
			fetchMock.mockResolvedValueOnce({ places: [], routine: null });
			await generalSettingsStore.getState().load();

			generalSettingsStore.getState().setRoutineEnabled(true);
			generalSettingsStore.getState().setRoutineDraft({ bedtime: "23:00", wakeTime: "" });

			const ok = await generalSettingsStore.getState().saveRoutine();
			expect(ok).toBe(false);
			expect(generalSettingsStore.getState().error).toBe("请选择完整的入睡和起床时间");
		});

		it("validates that bedtime and wakeTime cannot be equal", async () => {
			fetchMock.mockResolvedValueOnce({ places: [], routine: null });
			await generalSettingsStore.getState().load();

			generalSettingsStore.getState().setRoutineEnabled(true);
			generalSettingsStore.getState().setRoutineDraft({ bedtime: "07:00", wakeTime: "07:00" });

			const ok = await generalSettingsStore.getState().saveRoutine();
			expect(ok).toBe(false);
			expect(generalSettingsStore.getState().error).toBe("入睡和起床时间不能相同");
		});

		it("keeps an explicitly cleared or invalid timezone as an error instead of silently changing it", async () => {
			fetchMock.mockResolvedValueOnce(sampleSettings);
			await generalSettingsStore.getState().load();
			for (const timeZone of ["", "invalid-zone"]) {
				generalSettingsStore.getState().setRoutineDraft({ timeZone });
				expect(await generalSettingsStore.getState().saveRoutine()).toBe(false);
				expect(generalSettingsStore.getState().routineDraft.timeZone).toBe(timeZone);
				expect(generalSettingsStore.getState().settings).toEqual(sampleSettings);
				expect(generalSettingsStore.getState().error).toBe("请选择有效时区");
			}
			expect(saveMock).not.toHaveBeenCalled();
		});

		it("saves routine enabled and persists alongside existing places", async () => {
			fetchMock.mockResolvedValueOnce(sampleSettings);
			await generalSettingsStore.getState().load();

			generalSettingsStore.getState().setRoutineEnabled(true);
			generalSettingsStore.getState().setRoutineDraft({ bedtime: "23:15", wakeTime: "07:45" });

			saveMock.mockImplementationOnce(async (saved) => saved);

			const ok = await generalSettingsStore.getState().saveRoutine();
			expect(ok).toBe(true);
			expect(generalSettingsStore.getState().message).toBe("作息设置保存成功");
			expect(saveMock).toHaveBeenCalledWith(
				{
					places: sampleSettings.places,
					routine: {
						bedtime: "23:15",
						wakeTime: "07:45",
						timeZone: "Asia/Shanghai",
					},
				},
				expect.any(AbortSignal),
			);
		});

		it("clears routine when disabled and saved", async () => {
			fetchMock.mockResolvedValueOnce(sampleSettings);
			await generalSettingsStore.getState().load();

			generalSettingsStore.getState().setRoutineEnabled(false);
			saveMock.mockImplementationOnce(async (saved) => saved);

			const ok = await generalSettingsStore.getState().saveRoutine();
			expect(ok).toBe(true);
			expect(generalSettingsStore.getState().settings?.routine).toBeNull();
			expect(saveMock).toHaveBeenCalledWith(
				{
					places: sampleSettings.places,
					routine: null,
				},
				expect.any(AbortSignal),
			);
		});

		it("handles saveRoutine API failure", async () => {
			fetchMock.mockResolvedValueOnce(sampleSettings);
			await generalSettingsStore.getState().load();

			saveMock.mockRejectedValueOnce(new Error("网络超时"));

			const ok = await generalSettingsStore.getState().saveRoutine();
			expect(ok).toBe(false);
			expect(generalSettingsStore.getState().error).toBe("网络超时");
		});

		it("discards save operations when aborted", async () => {
			fetchMock.mockResolvedValueOnce(sampleSettings);
			await generalSettingsStore.getState().load();

			generalSettingsStore.getState().beginPlace(samplePlace);
			saveMock.mockRejectedValueOnce(abortError());
			expect(await generalSettingsStore.getState().savePlace()).toBe(false);
			expect(generalSettingsStore.getState().saving).toBe(false);

			saveMock.mockRejectedValueOnce(abortError());
			expect(await generalSettingsStore.getState().deletePlace("place-1")).toBe(false);
			expect(generalSettingsStore.getState().saving).toBe(false);

			saveMock.mockRejectedValueOnce(abortError());
			expect(await generalSettingsStore.getState().saveRoutine()).toBe(false);
			expect(generalSettingsStore.getState().saving).toBe(false);
		});

		it("blocks double submissions while saving is true", async () => {
			fetchMock.mockResolvedValueOnce(sampleSettings);
			await generalSettingsStore.getState().load();

			generalSettingsStore.setState({ saving: true });

			expect(await generalSettingsStore.getState().savePlace()).toBe(false);
			expect(await generalSettingsStore.getState().deletePlace("place-1")).toBe(false);
			expect(await generalSettingsStore.getState().saveRoutine()).toBe(false);
		});

		it("preserves unsaved place draft when routine is saved", async () => {
			fetchMock.mockResolvedValueOnce(sampleSettings);
			await generalSettingsStore.getState().load();

			generalSettingsStore.getState().beginPlace(undefined, { latitude: 35, longitude: 110 });
			generalSettingsStore.getState().setPlaceDraft({ label: "草稿地点" });

			saveMock.mockImplementationOnce(async (saved) => saved);

			const ok = await generalSettingsStore.getState().saveRoutine();
			expect(ok).toBe(true);
			// Place draft remains intact
			expect(generalSettingsStore.getState().placeDraft?.label).toBe("草稿地点");
		});

		it("preserves unsaved routine draft when place is saved", async () => {
			fetchMock.mockResolvedValueOnce(sampleSettings);
			await generalSettingsStore.getState().load();

			generalSettingsStore.getState().setRoutineDraft({ bedtime: "21:00", wakeTime: "05:00" });

			generalSettingsStore.getState().beginPlace(samplePlace);
			generalSettingsStore.getState().setPlaceDraft({ label: "公司新址" });

			saveMock.mockImplementationOnce(async (saved) => saved);

			const ok = await generalSettingsStore.getState().savePlace();
			expect(ok).toBe(true);
			// Routine draft remains intact
			expect(generalSettingsStore.getState().routineDraft.bedtime).toBe("21:00");
			expect(generalSettingsStore.getState().routineDraft.wakeTime).toBe("05:00");
		});

		it("guards load while saving is in progress and does not bump generation or abort save", async () => {
			fetchMock.mockResolvedValueOnce(sampleSettings);
			await generalSettingsStore.getState().load();

			generalSettingsStore.getState().beginPlace(samplePlace);
			generalSettingsStore.getState().setPlaceDraft({ label: "保存中测试" });

			let finishSave: (val: GeneralSettings) => void = () => {};
			saveMock.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						finishSave = resolve;
					}),
			);

			const savePromise = generalSettingsStore.getState().savePlace();
			expect(generalSettingsStore.getState().saving).toBe(true);

			// Now attempt load() while saving is true
			await generalSettingsStore.getState().load();
			// Status remains ready, load was skipped because saving was true
			expect(generalSettingsStore.getState().saving).toBe(true);
			expect(fetchMock).toHaveBeenCalledTimes(1);

			// Now complete the save
			finishSave({
				places: [{ ...samplePlace, label: "保存中测试" }],
				routine: sampleSettings.routine,
			});
			const ok = await savePromise;
			expect(ok).toBe(true);
			expect(generalSettingsStore.getState().saving).toBe(false);
			expect(generalSettingsStore.getState().settings?.places[0]?.label).toBe("保存中测试");
		});

		it("guards draft and routine editing operations while saving is in progress", async () => {
			fetchMock.mockResolvedValueOnce(sampleSettings);
			await generalSettingsStore.getState().load();

			generalSettingsStore.getState().beginPlace(samplePlace);
			generalSettingsStore.setState({ saving: true });

			// Modifications while saving are ignored
			generalSettingsStore.getState().setPlaceDraft({ label: "修改草稿被阻止" });
			expect(generalSettingsStore.getState().placeDraft?.label).toBe("公司");

			generalSettingsStore.getState().cancelPlace();
			expect(generalSettingsStore.getState().placeDraft).not.toBeNull();

			generalSettingsStore.getState().beginPlace(undefined, { latitude: 0, longitude: 0 });
			expect(generalSettingsStore.getState().placeDraft?.label).toBe("公司");

			generalSettingsStore.getState().setRoutineDraft({ bedtime: "01:00" });
			expect(generalSettingsStore.getState().routineDraft.bedtime).toBe("23:00");

			generalSettingsStore.getState().setRoutineEnabled(false);
			expect(generalSettingsStore.getState().routineEnabled).toBe(true);
		});

		it("discards late savePlace response when reset occurs in flight", async () => {
			fetchMock.mockResolvedValueOnce(sampleSettings);
			await generalSettingsStore.getState().load();

			generalSettingsStore.getState().beginPlace(samplePlace);
			generalSettingsStore.getState().setPlaceDraft({ label: "旧保存" });

			let finishSave: (val: GeneralSettings) => void = () => {};
			saveMock.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						finishSave = resolve;
					}),
			);

			const savePromise = generalSettingsStore.getState().savePlace();
			expect(generalSettingsStore.getState().saving).toBe(true);

			// User leaves or resets
			generalSettingsStore.getState().reset();
			expect(generalSettingsStore.getState().status).toBe("idle");
			expect(generalSettingsStore.getState().saving).toBe(false);

			finishSave({
				places: [{ ...samplePlace, label: "旧保存" }],
				routine: null,
			});
			const ok = await savePromise;
			expect(ok).toBe(false);
			// Settings should not be overwritten by late save callback
			expect(generalSettingsStore.getState().settings).toBeNull();
		});

		it("discards late saveRoutine response when reset occurs in flight", async () => {
			fetchMock.mockResolvedValueOnce(sampleSettings);
			await generalSettingsStore.getState().load();

			let finishSave: (val: GeneralSettings) => void = () => {};
			saveMock.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						finishSave = resolve;
					}),
			);

			const savePromise = generalSettingsStore.getState().saveRoutine();
			expect(generalSettingsStore.getState().saving).toBe(true);

			generalSettingsStore.getState().reset();

			finishSave({ places: [], routine: null });
			const ok = await savePromise;
			expect(ok).toBe(false);
			expect(generalSettingsStore.getState().settings).toBeNull();
		});

		it("discards late deletePlace response when reset occurs in flight", async () => {
			fetchMock.mockResolvedValueOnce(sampleSettings);
			await generalSettingsStore.getState().load();

			let finishSave: (val: GeneralSettings) => void = () => {};
			saveMock.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						finishSave = resolve;
					}),
			);

			const savePromise = generalSettingsStore.getState().deletePlace("place-1");
			expect(generalSettingsStore.getState().saving).toBe(true);

			generalSettingsStore.getState().reset();

			finishSave({ places: [], routine: null });
			const ok = await savePromise;
			expect(ok).toBe(false);
			expect(generalSettingsStore.getState().settings).toBeNull();
		});

		it("enforces MAX_NAMED_PLACES limit", async () => {
			const hundredPlaces: NamedPlace[] = Array.from({ length: 100 }, (_, i) => ({
				id: `p-${i}`,
				label: `地点${i}`,
				latitude: 30,
				longitude: 120,
				radiusMeters: 200,
			}));

			fetchMock.mockResolvedValueOnce({ places: hundredPlaces, routine: null });
			await generalSettingsStore.getState().load();

			generalSettingsStore.getState().beginPlace(undefined, { latitude: 31, longitude: 121 });
			generalSettingsStore.getState().setPlaceDraft({ label: "第101个" });

			const ok = await generalSettingsStore.getState().savePlace();
			expect(ok).toBe(false);
			expect(generalSettingsStore.getState().error).toBe("最多保存 100 个地点");
		});
	});
});
