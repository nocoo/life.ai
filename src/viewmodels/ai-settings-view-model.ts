import { CUSTOM_PROVIDER_INFO, defaultRegistry } from "@nocoo/next-ai";
import { createStore } from "zustand/vanilla";
import {
	type AiConnectionResult,
	type AiSettings,
	type AiSettingsInput,
	DEFAULT_AI_MODEL,
} from "../models/ai";
import { fetchAiSettings, saveAiSettings, testSavedAiConnection } from "../services/ai-service";
import { isAbortError } from "../services/http";
import { isAuthFailure, type LoadStatus, toErrorMessage } from "./errors";

export const WORKERS_AI_PROVIDER = "workers-ai";

export interface AiProviderOption {
	id: string;
	label: string;
}

export interface AiSettingsDraft {
	provider: string;
	model: string;
	baseURL: string;
	sdkType: AiSettingsInput["sdkType"];
	authType: AiSettingsInput["authType"];
	apiKey: string;
}

export interface AiSettingsViewState {
	settings: AiSettings | null;
	draft: AiSettingsDraft;
	status: LoadStatus;
	error: string | null;
	expired: boolean;
	saving: boolean;
	testing: boolean;
	testResult: AiConnectionResult | null;
	testError: string | null;
	load: () => Promise<void>;
	setDraft: (patch: Partial<AiSettingsDraft>) => void;
	selectProvider: (provider: string) => void;
	save: () => Promise<void>;
	testSaved: () => Promise<void>;
	retry: () => Promise<void>;
	reset: () => void;
}

let loadGeneration = 0;
let loadController: AbortController | null = null;

function emptyDraft(): AiSettingsDraft {
	return {
		provider: WORKERS_AI_PROVIDER,
		model: DEFAULT_AI_MODEL,
		baseURL: "",
		sdkType: "openai",
		authType: "apiKey",
		apiKey: "",
	};
}

function draftFromSettings(settings: AiSettings): AiSettingsDraft {
	return {
		provider: settings.provider || WORKERS_AI_PROVIDER,
		model: settings.model || DEFAULT_AI_MODEL,
		baseURL: settings.baseURL,
		sdkType: settings.sdkType,
		authType: settings.authType,
		apiKey: "",
	};
}

export function aiProviderOptions(): AiProviderOption[] {
	return [
		{ id: WORKERS_AI_PROVIDER, label: "Cloudflare Workers AI" },
		...defaultRegistry.getAll().map((provider) => ({ id: provider.id, label: provider.label })),
		{ id: CUSTOM_PROVIDER_INFO.id, label: "自定义" },
	];
}

export function modelsForProvider(provider: string): string[] {
	if (provider === WORKERS_AI_PROVIDER) {
		return [DEFAULT_AI_MODEL];
	}
	return defaultRegistry.get(provider)?.models ?? [];
}

export function providerNeedsApiKey(provider: string): boolean {
	return provider !== WORKERS_AI_PROVIDER;
}

export function isCustomProvider(provider: string): boolean {
	return provider === CUSTOM_PROVIDER_INFO.id;
}

export function buildAiSettingsInput(draft: AiSettingsDraft): AiSettingsInput {
	const builtin = defaultRegistry.get(draft.provider);
	const input: AiSettingsInput = {
		provider: draft.provider,
		model: draft.model.trim() || (builtin?.defaultModel ?? DEFAULT_AI_MODEL),
		baseURL: isCustomProvider(draft.provider) ? draft.baseURL.trim() : (builtin?.baseURL ?? ""),
		sdkType: isCustomProvider(draft.provider) ? draft.sdkType : (builtin?.sdkType ?? "openai"),
		authType: draft.authType,
	};
	if (draft.apiKey.trim()) {
		input.apiKey = draft.apiKey.trim();
	}
	return input;
}

function initialState(): Pick<
	AiSettingsViewState,
	| "settings"
	| "draft"
	| "status"
	| "error"
	| "expired"
	| "saving"
	| "testing"
	| "testResult"
	| "testError"
> {
	return {
		settings: null,
		draft: emptyDraft(),
		status: "idle",
		error: null,
		expired: false,
		saving: false,
		testing: false,
		testResult: null,
		testError: null,
	};
}

export const aiSettingsStore = createStore<AiSettingsViewState>((set, get) => ({
	...initialState(),
	async load() {
		loadController?.abort();
		const controller = new AbortController();
		loadController = controller;
		const generation = ++loadGeneration;
		set({ status: "loading", error: null, expired: false, testResult: null, testError: null });
		try {
			const settings = await fetchAiSettings(controller.signal);
			if (generation !== loadGeneration) {
				return;
			}
			set({
				settings,
				draft: draftFromSettings(settings),
				status: "ready",
				error: null,
				expired: false,
			});
		} catch (error) {
			if (generation !== loadGeneration || isAbortError(error)) {
				return;
			}
			set({
				status: "error",
				error: toErrorMessage(error),
				expired: isAuthFailure(error),
			});
		}
	},
	setDraft(patch) {
		set({ draft: { ...get().draft, ...patch }, testResult: null, testError: null });
	},
	selectProvider(provider) {
		if (provider === WORKERS_AI_PROVIDER) {
			set({
				draft: {
					...emptyDraft(),
					provider,
				},
				testResult: null,
				testError: null,
			});
			return;
		}
		const builtin = defaultRegistry.get(provider);
		set({
			draft: {
				provider,
				model: builtin?.defaultModel ?? "",
				baseURL: builtin?.baseURL ?? "",
				sdkType: builtin?.sdkType ?? "openai",
				authType: "apiKey",
				apiKey: "",
			},
			testResult: null,
			testError: null,
		});
	},
	async save() {
		if (get().saving) {
			return;
		}
		set({ saving: true, error: null, testResult: null, testError: null });
		try {
			const settings = await saveAiSettings(buildAiSettingsInput(get().draft));
			set({
				saving: false,
				settings,
				draft: draftFromSettings(settings),
				status: "ready",
				error: null,
			});
		} catch (error) {
			if (isAbortError(error)) {
				set({ saving: false });
				return;
			}
			set({
				saving: false,
				error: toErrorMessage(error),
				expired: isAuthFailure(error),
			});
		}
	},
	async testSaved() {
		if (get().testing) {
			return;
		}
		set({ testing: true, testResult: null, testError: null, error: null });
		try {
			const result = await testSavedAiConnection();
			set({
				testing: false,
				testResult: result,
				testError: result.success ? null : result.response,
			});
		} catch (error) {
			if (isAbortError(error)) {
				set({ testing: false });
				return;
			}
			set({
				testing: false,
				testError: toErrorMessage(error),
				expired: isAuthFailure(error),
			});
		}
	},
	async retry() {
		await get().load();
	},
	reset() {
		loadController?.abort();
		loadController = null;
		loadGeneration += 1;
		set(initialState());
	},
}));
