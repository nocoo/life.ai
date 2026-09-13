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
	const name = session.name?.trim();
	if (name) {
		return name;
	}
	const email = session.email?.trim();
	if (email) {
		return email;
	}
	return session.mode === "local" ? "本地模式" : "已认证";
}

export function sessionSecondaryText(session: Session | null): string {
	return session?.email?.trim() ?? "";
}

export function sessionAvatarUrl(session: Session | null): string | null {
	const avatar = session?.avatar?.trim();
	return avatar ? avatar : null;
}

export function sessionInitials(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) {
		return "?";
	}
	return parts
		.map((part) => part.slice(0, 1))
		.join("")
		.toUpperCase()
		.slice(0, 2);
}
