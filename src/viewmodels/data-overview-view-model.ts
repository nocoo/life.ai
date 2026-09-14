import { createStore } from "zustand/vanilla";
import type {
	DataOverview,
	DataTarget,
	ProviderCoverageDay,
	ProviderOverview,
} from "../models/data-management";
import { apiGet, isAbortError } from "../services/http";
import { isAuthFailure, type LoadStatus, toErrorMessage } from "./errors";
import { formatByteSize } from "./format";

export const OVERVIEW_METRICS = {
	coverageDays: {
		label: "覆盖天数",
		unit: "天",
		description: "每个来源实际有记录的 UTC 日数，缺失日期不计入覆盖。",
	},
	recordCount: {
		label: "原始记录",
		unit: "条",
		description: "当前保存的原始记录总数，Footprint 的一条记录对应一个 GPS 点。",
	},
	dataRows: {
		label: "数据行",
		unit: "行",
		description: "保存内容使用的 D1 数据行，不包含索引和导入状态记录。",
	},
	payloadBytes: {
		label: "正文大小",
		unit: "",
		description: "JSON 正文的字节数，不等于 D1 全库物理占用。",
	},
} as const;

export type OverviewMetric = keyof typeof OVERVIEW_METRICS;

export function formatOverviewMetric(value: number, metric: OverviewMetric): string {
	if (metric === "payloadBytes") {
		return formatByteSize(value);
	}
	return `${value.toLocaleString("zh-CN")} ${OVERVIEW_METRICS[metric].unit}`;
}

export function summarizeProviders(providers: ProviderOverview[]) {
	const coveredDays = new Set<number>();
	let recordCount = 0;
	let dataRows = 0;
	let payloadBytes = 0;
	for (const provider of providers) {
		for (const day of provider.coverage) {
			coveredDays.add(day.utcDay);
		}
		recordCount += provider.recordCount;
		dataRows += provider.dataRows;
		payloadBytes += provider.payloadBytes;
	}
	return {
		coverageDays: coveredDays.size,
		recordCount,
		dataRows,
		payloadBytes,
		importedProviders: providers.filter(
			(provider) => provider.recordCount > 0 || provider.dataRows > 0,
		),
	};
}

export function compareProviders(providers: ProviderOverview[], metric: OverviewMetric) {
	const data = providers.map((provider) => ({
		id: provider.id,
		name: provider.name,
		value: provider[metric],
	}));
	return {
		data,
		summary: data
			.map((provider) => `${provider.name}：${formatOverviewMetric(provider.value, metric)}`)
			.join("；"),
	};
}

export function monthlyRecordCounts(providers: ProviderOverview[]) {
	const counts = new Map<number, number>();
	let first = Number.POSITIVE_INFINITY;
	let last = Number.NEGATIVE_INFINITY;
	for (const provider of providers) {
		for (const day of provider.coverage) {
			const date = new Date(day.utcDay);
			const month = date.getUTCFullYear() * 12 + date.getUTCMonth();
			counts.set(month, (counts.get(month) ?? 0) + day.recordCount);
			first = Math.min(first, month);
			last = Math.max(last, month);
		}
	}
	const data: { month: string; recordCount: number }[] = [];
	for (let month = first; month <= last; month += 1) {
		const year = String(Math.floor(month / 12)).padStart(4, "0");
		const monthNumber = String((month % 12) + 1).padStart(2, "0");
		data.push({ month: `${year}-${monthNumber}`, recordCount: counts.get(month) ?? 0 });
	}
	return {
		data,
		summary: data
			.map((month) => `${month.month}：${formatOverviewMetric(month.recordCount, "recordCount")}`)
			.join("；"),
	};
}

export function importChannelLabel(channel: ProviderOverview["lastImportChannel"]): string {
	if (channel === "web") {
		return "网页";
	}
	if (channel === "cli") {
		return "本机";
	}
	return "尚未导入";
}

export interface DataOverviewViewState {
	overview: DataOverview | null;
	target: DataTarget | null;
	status: LoadStatus;
	error: string | null;
	expired: boolean;
	metric: OverviewMetric;
	setMetric: (metric: OverviewMetric) => void;
	load: () => Promise<void>;
	retry: () => Promise<void>;
	reset: () => void;
}

let loadGeneration = 0;
let loadController: AbortController | null = null;

function initialState(): Pick<
	DataOverviewViewState,
	"overview" | "target" | "status" | "error" | "expired" | "metric"
> {
	return {
		overview: null,
		target: null,
		status: "idle",
		error: null,
		expired: false,
		metric: "coverageDays",
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
	return storage === "daily-json"
		? "按 UTC 日保存"
		: storage === "day-dimension"
			? "按 UTC 日与维度保存"
			: "按条保存";
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

export function coverageCellLabel(
	utcDay: number,
	recordCount: number,
	provider: ProviderOverview["id"] = "footprint",
): string {
	return `${utcDayKey(utcDay)} UTC，${recordCount} ${provider === "footprint" ? "点" : "条记录"}`;
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
	setMetric(metric) {
		set({ metric });
	},
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
