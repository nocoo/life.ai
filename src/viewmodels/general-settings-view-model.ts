import { createStore } from "zustand/vanilla";
import {
	type Coordinates,
	DEFAULT_PLACE_RADIUS_METERS,
	type GeneralSettings,
	MAX_NAMED_PLACES,
	type NamedPlace,
	type SleepRoutine,
	validateGeneralSettings,
} from "../models/general-settings";
import { fetchGeneralSettings, saveGeneralSettings } from "../services/general-settings-service";
import { isAbortError } from "../services/http";
import { isAuthFailure, type LoadStatus, toErrorMessage } from "./errors";

export interface PlaceDraft {
	id: string | null;
	label: string;
	center: Coordinates | null;
	radiusMeters: number;
}

export interface RoutineDraft {
	bedtime: string;
	wakeTime: string;
	timeZone: string;
}

export interface GeneralSettingsViewState {
	settings: GeneralSettings | null;
	status: LoadStatus;
	error: string | null;
	expired: boolean;
	saving: boolean;
	message: string | null;
	placeDraft: PlaceDraft | null;
	routineDraft: RoutineDraft;
	routineEnabled: boolean;
	load: () => Promise<void>;
	reset: () => void;
	beginPlace: (place?: NamedPlace, initialCenter?: Coordinates) => void;
	cancelPlace: () => void;
	setPlaceDraft: (patch: Partial<PlaceDraft>) => void;
	savePlace: () => Promise<boolean>;
	deletePlace: (id: string) => Promise<boolean>;
	setRoutineDraft: (patch: Partial<SleepRoutine>) => void;
	setRoutineEnabled: (enabled: boolean) => void;
	saveRoutine: () => Promise<boolean>;
}

let loadGeneration = 0;
let saveGeneration = 0;
let loadController: AbortController | null = null;
let saveController: AbortController | null = null;

function defaultTimeZone(): string {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai";
	} catch {
		return "Asia/Shanghai";
	}
}

function initialRoutineDraft(routine?: SleepRoutine | null): RoutineDraft {
	return {
		bedtime: routine?.bedtime ?? "",
		wakeTime: routine?.wakeTime ?? "",
		timeZone: routine?.timeZone ?? defaultTimeZone(),
	};
}

function initialState(): Pick<
	GeneralSettingsViewState,
	| "settings"
	| "status"
	| "error"
	| "expired"
	| "saving"
	| "message"
	| "placeDraft"
	| "routineDraft"
	| "routineEnabled"
> {
	return {
		settings: null,
		status: "idle",
		error: null,
		expired: false,
		saving: false,
		message: null,
		placeDraft: null,
		routineDraft: initialRoutineDraft(),
		routineEnabled: false,
	};
}

export const generalSettingsStore = createStore<GeneralSettingsViewState>((set, get) => ({
	...initialState(),

	async load() {
		if (get().saving) return;

		loadController?.abort();
		const controller = new AbortController();
		loadController = controller;
		const generation = ++loadGeneration;

		set({ status: "loading", error: null, expired: false, message: null });

		try {
			const settings = await fetchGeneralSettings(controller.signal);
			if (generation !== loadGeneration) return;

			set({
				settings,
				status: "ready",
				error: null,
				expired: false,
				routineDraft: initialRoutineDraft(settings.routine),
				routineEnabled: settings.routine !== null,
			});
		} catch (err) {
			if (generation !== loadGeneration || isAbortError(err)) return;
			set({
				status: "error",
				error: toErrorMessage(err),
				expired: isAuthFailure(err),
			});
		}
	},

	reset() {
		loadController?.abort();
		loadController = null;
		saveController?.abort();
		saveController = null;
		loadGeneration++;
		saveGeneration++;
		set(initialState());
	},

	beginPlace(place?: NamedPlace, initialCenter?: Coordinates) {
		if (get().saving) return;
		if (place) {
			set({
				placeDraft: {
					id: place.id,
					label: place.label,
					center: { latitude: place.latitude, longitude: place.longitude },
					radiusMeters: place.radiusMeters,
				},
				message: null,
			});
		} else {
			set({
				placeDraft: {
					id: null,
					label: "",
					center: initialCenter ?? null,
					radiusMeters: DEFAULT_PLACE_RADIUS_METERS,
				},
				message: null,
			});
		}
	},

	cancelPlace() {
		if (get().saving) return;
		set({ placeDraft: null, message: null });
	},

	setPlaceDraft(patch: Partial<PlaceDraft>) {
		if (get().saving) return;
		const current = get().placeDraft;
		if (!current) return;
		set({
			placeDraft: {
				...current,
				...patch,
			},
		});
	},

	async savePlace(): Promise<boolean> {
		const state = get();
		if (state.saving) return false;
		if (!state.settings || state.status !== "ready") {
			set({ error: "请先加载通用设置" });
			return false;
		}

		const draft = state.placeDraft;
		if (!draft) return false;

		const trimmedLabel = draft.label.trim();
		if (!trimmedLabel) {
			set({ error: "请填写地点名称" });
			return false;
		}
		if (!draft.center) {
			set({ error: "请在地图上选择地点中心位置" });
			return false;
		}

		const placeId = draft.id ?? crypto.randomUUID();
		const newPlace: NamedPlace = {
			id: placeId,
			label: trimmedLabel,
			latitude: draft.center.latitude,
			longitude: draft.center.longitude,
			radiusMeters: draft.radiusMeters,
		};

		const existingPlaces = state.settings.places;
		let updatedPlaces: NamedPlace[];

		if (draft.id) {
			updatedPlaces = existingPlaces.map((p) => (p.id === draft.id ? newPlace : p));
		} else {
			if (existingPlaces.length >= MAX_NAMED_PLACES) {
				set({ error: `最多保存 ${MAX_NAMED_PLACES} 个地点` });
				return false;
			}
			updatedPlaces = [...existingPlaces, newPlace];
		}

		const candidate: GeneralSettings = {
			places: updatedPlaces,
			routine: state.settings.routine,
		};

		try {
			validateGeneralSettings(candidate);
		} catch (err) {
			set({ error: toErrorMessage(err) });
			return false;
		}

		saveController?.abort();
		const controller = new AbortController();
		saveController = controller;
		const generation = ++saveGeneration;
		set({ saving: true, error: null, message: null });

		try {
			const saved = await saveGeneralSettings(candidate, controller.signal);
			if (generation !== saveGeneration) return false;
			set({
				settings: saved,
				saving: false,
				placeDraft: null,
				error: null,
				message: "地点保存成功",
			});
			return true;
		} catch (err) {
			if (generation !== saveGeneration) return false;
			if (isAbortError(err)) {
				set({ saving: false });
				return false;
			}
			set({
				saving: false,
				error: toErrorMessage(err),
				expired: isAuthFailure(err),
			});
			return false;
		}
	},

	async deletePlace(id: string): Promise<boolean> {
		const state = get();
		if (state.saving) return false;
		if (!state.settings || state.status !== "ready") {
			set({ error: "请先加载通用设置" });
			return false;
		}

		const updatedPlaces = state.settings.places.filter((p) => p.id !== id);
		const candidate: GeneralSettings = {
			places: updatedPlaces,
			routine: state.settings.routine,
		};

		saveController?.abort();
		const controller = new AbortController();
		saveController = controller;
		const generation = ++saveGeneration;
		set({ saving: true, error: null, message: null });

		try {
			const saved = await saveGeneralSettings(candidate, controller.signal);
			if (generation !== saveGeneration) return false;
			const currentDraft = get().placeDraft;
			set({
				settings: saved,
				saving: false,
				placeDraft: currentDraft?.id === id ? null : currentDraft,
				error: null,
				message: "地点已删除",
			});
			return true;
		} catch (err) {
			if (generation !== saveGeneration) return false;
			if (isAbortError(err)) {
				set({ saving: false });
				return false;
			}
			set({
				saving: false,
				error: toErrorMessage(err),
				expired: isAuthFailure(err),
			});
			return false;
		}
	},

	setRoutineDraft(patch: Partial<SleepRoutine>) {
		if (get().saving) return;
		set((state) => ({
			routineDraft: {
				...state.routineDraft,
				...patch,
			},
		}));
	},

	setRoutineEnabled(enabled: boolean) {
		if (get().saving) return;
		set({ routineEnabled: enabled, message: null });
	},

	async saveRoutine(): Promise<boolean> {
		const state = get();
		if (state.saving) return false;
		if (!state.settings || state.status !== "ready") {
			set({ error: "请先加载通用设置" });
			return false;
		}

		let nextRoutine: SleepRoutine | null = null;
		if (state.routineEnabled) {
			const { bedtime, wakeTime, timeZone } = state.routineDraft;
			if (!bedtime || !wakeTime) {
				set({ error: "请选择完整的入睡和起床时间" });
				return false;
			}
			nextRoutine = {
				bedtime,
				wakeTime,
				timeZone,
			};
		}

		const candidate: GeneralSettings = {
			places: state.settings.places,
			routine: nextRoutine,
		};

		try {
			validateGeneralSettings(candidate);
		} catch (err) {
			set({ error: toErrorMessage(err) });
			return false;
		}

		saveController?.abort();
		const controller = new AbortController();
		saveController = controller;
		const generation = ++saveGeneration;
		set({ saving: true, error: null, message: null });

		try {
			const saved = await saveGeneralSettings(candidate, controller.signal);
			if (generation !== saveGeneration) return false;
			set({
				settings: saved,
				saving: false,
				error: null,
				message: "作息设置保存成功",
				routineDraft: initialRoutineDraft(saved.routine),
				routineEnabled: saved.routine !== null,
			});
			return true;
		} catch (err) {
			if (generation !== saveGeneration) return false;
			if (isAbortError(err)) {
				set({ saving: false });
				return false;
			}
			set({
				saving: false,
				error: toErrorMessage(err),
				expired: isAuthFailure(err),
			});
			return false;
		}
	},
}));
