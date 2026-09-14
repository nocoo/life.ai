import { createStore } from "zustand/vanilla";
import type {
	DataOverview,
	DataTarget,
	ProviderCoverageDay,
	ProviderOverview,
} from "../models/data-management";
import { apiGet, isAbortError } from "../services/http";
import { isAuthFailure, type LoadStatus, toErrorMessage } from "./errors";

export interface DataOverviewViewState {
	overview: DataOverview | null;
	target: DataTarget | null;
	status: LoadStatus;
	error: string | null;
	expired: boolean;
	load: () => Promise<void>;
	retry: () => Promise<void>;
	reset: () => void;
}

let loadGeneration = 0;
let loadController: AbortController | null = null;

function initialState(): Pick<
	DataOverviewViewState,
	"overview" | "target" | "status" | "error" | "expired"
> {
	return {
		overview: null,
		target: null,
		status: "idle",
		error: null,
		expired: false,
	};
}

export function dataTargetLabel(target: DataTarget): string {
	if (target === "production") {
		return "当前使用的是生产数据。";
	}
	if (target === "test") {
		return "当前使用的是隔离测试数据。";
	}
	return "当前使用的是本机数据。";
}

export function storageLabel(storage: ProviderOverview["storage"]): string {
	return storage === "daily-json" ? "按 UTC 日保存" : "按条保存";
}

export function utcDayKey(utcDay: number): string {
	return new Date(utcDay).toISOString().slice(0, 10);
}

export function timelineDayHref(utcDay: number): string {
	return `/?day=${utcDayKey(utcDay)}`;
}

export interface CoverageMonth {
	key: string;
	label: string;
	year: number;
	month: number;
	cells: { utcDay: number | null; key: string; filled: boolean; recordCount: number }[];
}

export function coverageCellLabel(utcDay: number, recordCount: number): string {
	return `${utcDayKey(utcDay)} UTC，${recordCount} 点`;
}

export function groupCoverageMonths(days: ProviderCoverageDay[]): CoverageMonth[] {
	const byMonth = new Map<string, Map<number, ProviderCoverageDay>>();
	for (const day of days) {
		const date = new Date(day.utcDay);
		const year = date.getUTCFullYear();
		const month = date.getUTCMonth() + 1;
		const key = `${year}-${String(month).padStart(2, "0")}`;
		const bucket = byMonth.get(key) ?? new Map<number, ProviderCoverageDay>();
		bucket.set(date.getUTCDate(), day);
		byMonth.set(key, bucket);
	}
	return [...byMonth.entries()]
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([key, filled]) => {
			const [yearText, monthText] = key.split("-");
			const year = Number(yearText);
			const month = Number(monthText);
			const first = new Date(Date.UTC(year, month - 1, 1));
			const weekday = (first.getUTCDay() + 6) % 7;
			const lastDate = new Date(Date.UTC(year, month, 0)).getUTCDate();
			const cells: CoverageMonth["cells"] = [];
			for (let i = 0; i < weekday; i += 1) {
				cells.push({ utcDay: null, key: `${key}-pad-${i}`, filled: false, recordCount: 0 });
			}
			for (let date = 1; date <= lastDate; date += 1) {
				const hit = filled.get(date);
				const utcDay = hit?.utcDay ?? Date.UTC(year, month - 1, date);
				cells.push({
					utcDay,
					key: `${key}-${date}`,
					filled: Boolean(hit),
					recordCount: hit?.recordCount ?? 0,
				});
			}
			return {
				key,
				label: `${year}年${month}月`,
				year,
				month,
				cells,
			};
		});
}

export const dataOverviewStore = createStore<DataOverviewViewState>((set, get) => ({
	...initialState(),
	async load() {
		loadController?.abort();
		const controller = new AbortController();
		loadController = controller;
		const generation = ++loadGeneration;
		set({ status: "loading", error: null, expired: false });
		try {
			const [overview, targetBody] = await Promise.all([
				apiGet<DataOverview>("/api/data/overview", undefined, controller.signal),
				apiGet<{ target: DataTarget }>("/api/data/target", undefined, controller.signal),
			]);
			if (generation !== loadGeneration) {
				return;
			}
			set({
				overview,
				target: targetBody.target,
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
