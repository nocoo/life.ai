import { createStore } from "zustand/vanilla";
import type { Session } from "../models/types";
import { isAbortError } from "../services/http";
import { fetchSession } from "../services/session-service";
import { isAuthFailure, type LoadStatus, toErrorMessage } from "./errors";

export interface SessionViewState {
	session: Session | null;
	status: LoadStatus;
	error: string | null;
	expired: boolean;
	load: () => Promise<void>;
	reset: () => void;
}

let loadGeneration = 0;
let loadController: AbortController | null = null;

function initialSessionState(): Pick<SessionViewState, "session" | "status" | "error" | "expired"> {
	return {
		session: null,
		status: "idle",
		error: null,
		expired: false,
	};
}

export const sessionStore = createStore<SessionViewState>((set, get) => ({
	...initialSessionState(),
	async load() {
		loadController?.abort();
		const controller = new AbortController();
		loadController = controller;
		const generation = ++loadGeneration;
		set({ status: "loading", error: null, expired: false });
		try {
			const session = await fetchSession(controller.signal);
			if (generation !== loadGeneration) {
				return;
			}
			set({ session, status: "ready", error: null, expired: false });
		} catch (error) {
			if (generation !== loadGeneration || isAbortError(error)) {
				return;
			}
			const expired = isAuthFailure(error);
			set({
				session: expired ? null : get().session,
				status: "error",
				error: toErrorMessage(error),
				expired,
			});
		}
	},
	reset() {
		loadController?.abort();
		loadController = null;
		loadGeneration += 1;
		set(initialSessionState());
	},
}));

export function sessionDisplayName(session: Session | null): string {
	if (!session) {
		return "未登录";
	}
	if (session.mode === "local") {
		return session.email ?? "本地模式";
	}
	return session.email ?? "已认证";
}

export function sessionSecondaryText(session: Session | null): string {
	if (!session) {
		return "";
	}
	if (session.mode === "local") {
		return "本地开发";
	}
	return session.subject;
}
