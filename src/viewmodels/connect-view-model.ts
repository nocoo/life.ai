import { createStore } from "zustand/vanilla";
import type { Connect } from "../models/types";
import { createConnect, fetchConnects, revokeConnect } from "../services/connects-service";
import { isAbortError } from "../services/http";
import { type LoadStatus, toErrorMessage } from "./errors";
import { ingestCurlExample } from "./format";

export const CONNECT_NAME_MAX = 80;
export const INGEST_URL = "https://life.worker.hexly.ai/api/ingest";

export interface CreatedSecret {
	name: string;
	token: string;
	curl: string;
}

export interface ConnectViewState {
	connects: Connect[];
	status: LoadStatus;
	error: string | null;
	nameDraft: string;
	nameError: string | null;
	creating: boolean;
	revokingId: string | null;
	createdSecret: CreatedSecret | null;
	load: () => Promise<void>;
	setNameDraft: (name: string) => void;
	create: () => Promise<void>;
	revoke: (id: string) => Promise<void>;
	dismissSecret: () => void;
	retry: () => Promise<void>;
	reset: () => void;
}

let loadGeneration = 0;
let loadController: AbortController | null = null;

function initialConnectState(): Pick<
	ConnectViewState,
	| "connects"
	| "status"
	| "error"
	| "nameDraft"
	| "nameError"
	| "creating"
	| "revokingId"
	| "createdSecret"
> {
	return {
		connects: [],
		status: "idle",
		error: null,
		nameDraft: "",
		nameError: null,
		creating: false,
		revokingId: null,
		createdSecret: null,
	};
}

export function validateConnectName(name: string): string | null {
	const trimmed = name.trim();
	if (!trimmed) {
		return "请输入令牌名称。";
	}
	if (trimmed.length > CONNECT_NAME_MAX) {
		return `名称最多 ${CONNECT_NAME_MAX} 个字符。`;
	}
	return null;
}

export const connectStore = createStore<ConnectViewState>((set, get) => ({
	...initialConnectState(),
	async load() {
		loadController?.abort();
		const controller = new AbortController();
		loadController = controller;
		const generation = ++loadGeneration;
		set({ status: "loading", error: null });
		try {
			const connects = await fetchConnects(controller.signal);
			if (generation !== loadGeneration) {
				return;
			}
			set({ connects, status: "ready", error: null });
		} catch (error) {
			if (generation !== loadGeneration || isAbortError(error)) {
				return;
			}
			set({ status: "error", error: toErrorMessage(error) });
		}
	},
	setNameDraft(name: string) {
		set({ nameDraft: name, nameError: null });
	},
	async create() {
		const nameError = validateConnectName(get().nameDraft);
		if (nameError) {
			set({ nameError });
			return;
		}
		if (get().creating) {
			return;
		}
		const name = get().nameDraft.trim();
		set({ creating: true, error: null, nameError: null, createdSecret: null });
		try {
			const created = await createConnect(name);
			set((state) => ({
				creating: false,
				nameDraft: "",
				createdSecret: {
					name: created.connect.name,
					token: created.token,
					curl: ingestCurlExample(created.token),
				},
				connects: [
					created.connect,
					...state.connects.filter((item) => item.id !== created.connect.id),
				],
				status: "ready",
			}));
		} catch (error) {
			if (isAbortError(error)) {
				set({ creating: false });
				return;
			}
			set({ creating: false, error: toErrorMessage(error) });
		}
	},
	async revoke(id: string) {
		if (!id || get().revokingId) {
			return;
		}
		set({ revokingId: id, error: null });
		try {
			const revoked = await revokeConnect(id);
			set((state) => ({
				revokingId: null,
				connects: state.connects.map((item) => (item.id === revoked.id ? revoked : item)),
				status: "ready",
			}));
		} catch (error) {
			if (isAbortError(error)) {
				set({ revokingId: null });
				return;
			}
			set({ revokingId: null, error: toErrorMessage(error) });
		}
	},
	dismissSecret() {
		set({ createdSecret: null });
	},
	async retry() {
		await get().load();
	},
	reset() {
		loadController?.abort();
		loadController = null;
		loadGeneration += 1;
		set(initialConnectState());
	},
}));
