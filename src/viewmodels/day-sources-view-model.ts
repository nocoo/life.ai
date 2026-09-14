import { createStore } from "zustand/vanilla";
import type {
	DaySourceConnection,
	DaySourceProvider,
	DaySourceSettings,
} from "../models/day-sources";
import { localDateKey, localDayWindow } from "../models/time";
import {
	fetchDaySourceSettings,
	removeDaySource,
	saveDaySourceSettings,
	testDaySource,
} from "../services/day-sources-service";
import { isAbortError } from "../services/http";
import { type LoadStatus, toErrorMessage } from "./errors";

interface DaySourcesSettingsState {
	settings: DaySourceSettings[];
	apiKey: string;
	status: LoadStatus;
	busy: DaySourceProvider | null;
	error: string | null;
	connection: DaySourceConnection | null;
	load: () => Promise<void>;
	setApiKey: (apiKey: string) => void;
	save: (provider: DaySourceProvider, enabled: boolean) => Promise<void>;
	remove: (provider: DaySourceProvider) => Promise<void>;
	test: (provider: DaySourceProvider) => Promise<void>;
	reset: () => void;
}

let controller: AbortController | null = null;
let generation = 0;
const initial = () => ({
	settings: [] as DaySourceSettings[],
	apiKey: "",
	status: "idle" as LoadStatus,
	busy: null,
	error: null,
	connection: null,
});
export const daySourcesSettingsStore = createStore<DaySourcesSettingsState>((set, get) => ({
	...initial(),
	async load() {
		if (get().busy) return;
		controller?.abort();
		controller = new AbortController();
		const current = ++generation;
		set({ status: "loading", error: null });
		try {
			const settings = await fetchDaySourceSettings(controller.signal);
			if (current === generation) set({ settings, status: "ready" });
		} catch (error) {
			if (current === generation && !isAbortError(error))
				set({ status: "error", error: toErrorMessage(error) });
		}
	},
	setApiKey(apiKey) {
		set({ apiKey, connection: null });
	},
	async save(provider, enabled) {
		if (get().busy) return;
		const current = generation;
		const apiKey = provider === "gecko" && enabled ? get().apiKey.trim() : "";
		set({ busy: provider, error: null, connection: null });
		try {
			const settings = await saveDaySourceSettings(provider, {
				enabled,
				...(apiKey ? { apiKey } : {}),
			});
			if (current === generation)
				set({ settings, apiKey: provider === "gecko" ? "" : get().apiKey, status: "ready" });
		} catch (error) {
			if (current === generation) set({ error: toErrorMessage(error) });
		} finally {
			if (current === generation) set({ busy: null });
		}
	},
	async remove(provider) {
		if (get().busy) return;
		const current = generation;
		set({ busy: provider, error: null, connection: null });
		try {
			const settings = await removeDaySource(provider);
			if (current === generation)
				set({ settings, apiKey: provider === "gecko" ? "" : get().apiKey });
		} catch (error) {
			if (current === generation) set({ error: toErrorMessage(error) });
		} finally {
			if (current === generation) set({ busy: null });
		}
	},
	async test(provider) {
		if (get().busy) return;
		const current = generation;
		set({ busy: provider, connection: null, error: null });
		const date = localDateKey();
		try {
			const connection = await testDaySource(provider, {
				date,
				timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
				...localDayWindow(date),
			});
			if (current === generation) set({ connection });
		} catch (error) {
			if (current === generation) set({ error: toErrorMessage(error) });
		} finally {
			if (current === generation) set({ busy: null });
		}
	},
	reset() {
		controller?.abort();
		controller = null;
		generation++;
		set(initial());
	},
}));
