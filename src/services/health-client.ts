import type { DataTarget, ImportChannel } from "../models/data-management";
import {
	HEALTH_LIMITS,
	type HealthDay,
	type HealthFileManifest,
	type HealthFilePart,
	type HealthImportReceipt,
	type HealthImportRequest,
	type HealthPlan,
	type HealthProgress,
	type StoredHealthSeries,
} from "../models/health-types";
import {
	abortableDelay,
	createDataRequest,
	type FootprintClientOptions,
	isTransientError,
} from "./footprint-client";
import { isAbortError } from "./http";

const PREFIX = "/api/data/apple-health";

export function createHealthClient(options: FootprintClientOptions = {}) {
	const request = createDataRequest(options);
	return {
		target: (signal?: AbortSignal) =>
			request<{ target: DataTarget }>("/api/data/target", { signal }),
		inventory: (signal?: AbortSignal) =>
			request<{ files: { path: string; contentHash: string }[] }>(`${PREFIX}/files`, { signal }),
		begin: (body: HealthImportRequest, signal?: AbortSignal) =>
			request<{ id: string }>(`${PREFIX}/imports`, {
				method: "POST",
				body: JSON.stringify(body),
				signal,
			}),
		batch: (id: string, batch: number, day: HealthDay, signal?: AbortSignal) =>
			request<HealthImportReceipt>(`${PREFIX}/imports/${encodeURIComponent(id)}/batches/${batch}`, {
				method: "PUT",
				body: JSON.stringify({ days: [day] }),
				signal,
			}),
		part: (id: string, file: number, part: HealthFilePart, signal?: AbortSignal) =>
			request<{ contentHash: string }>(
				`${PREFIX}/imports/${encodeURIComponent(id)}/files/${file}/parts/${part.part}`,
				{ method: "PUT", body: JSON.stringify(part), signal },
			),
		finish: (id: string, status: "complete" | "cancelled", signal?: AbortSignal) =>
			request<HealthImportReceipt>(`${PREFIX}/imports/${encodeURIComponent(id)}/finish`, {
				method: "POST",
				body: JSON.stringify({ status }),
				signal,
			}),
		series: (start: string, end: string, storyOnly = false, signal?: AbortSignal) =>
			request<{ series: StoredHealthSeries[] }>(
				`${PREFIX}/series`,
				{ signal },
				{ start, end, view: storyOnly ? "story" : "all" },
			),
		file: (path: string, signal?: AbortSignal) =>
			request<HealthFileManifest>(`${PREFIX}/file`, { signal }, { path }),
		filePart: (path: string, part: number, signal?: AbortSignal) =>
			request<HealthFilePart>(`${PREFIX}/file`, { signal }, { path, part }),
	};
}

export type HealthClient = ReturnType<typeof createHealthClient>;

export async function uploadHealthPlan(
	client: HealthClient,
	plan: HealthPlan,
	options: {
		fileName: string;
		target: DataTarget;
		channel: ImportChannel;
		signal?: AbortSignal;
		onProgress?: (progress: HealthProgress) => void;
	},
): Promise<HealthImportReceipt> {
	const { signal } = options;
	signal?.throwIfAborted();
	if (
		!plan.days.length ||
		plan.recordCount !== plan.days.reduce((sum, day) => sum + day.recordCount, 0)
	)
		throw new Error("健康导入计划不完整。");
	const days = [...plan.days].sort((a, b) => a.utcDay - b.utcDay);
	if (new Set(days.map((day) => day.utcDay)).size !== days.length)
		throw new Error("健康导入计划包含重复日期。");
	for (const day of days)
		if (new TextEncoder().encode(JSON.stringify({ days: [day] })).length > HEALTH_LIMITS.dayBytes)
			throw new Error("健康日包超过提交上限，请重新整理。");
	const target = await client.target(signal);
	if (target.target !== options.target)
		throw new Error(`目标环境不匹配：服务端为 ${target.target}。`);
	const inventory = await client.inventory(signal);
	const existing = new Map(inventory.files.map((file) => [file.path, file.contentHash]));
	const files: HealthFileManifest[] = plan.files.map((file) => ({
		...file,
		parts: file.parts.map(({ body: _body, ...part }) => part),
	}));
	const total = days.length + plan.files.reduce((sum, file) => sum + file.parts.length, 0);
	let completed = 0;
	const report = (phase: HealthProgress["phase"] = "uploading") =>
		options.onProgress?.({
			phase,
			bytesRead: 0,
			totalBytes: plan.payloadBytes,
			recordCount: plan.recordCount,
			completed,
			total,
		});
	const session = await client.begin(
		{
			fileName: options.fileName,
			target: options.target,
			channel: options.channel,
			totalDays: days.length,
			totalRecords: plan.recordCount,
			files,
		},
		signal,
	);
	const retry = async <T>(operation: () => Promise<T>): Promise<T> => {
		for (let attempt = 0; ; attempt++) {
			signal?.throwIfAborted();
			try {
				return await operation();
			} catch (error) {
				if (attempt >= 2 || isAbortError(error) || !isTransientError(error)) throw error;
				await abortableDelay(200 * 2 ** attempt, signal);
			}
		}
	};
	try {
		report();
		for (const [index, file] of plan.files.entries()) {
			if (existing.get(file.path) === file.contentHash) {
				completed += file.parts.length;
				report();
				continue;
			}
			for (const part of file.parts) {
				await retry(() => client.part(session.id, index, part, signal));
				completed++;
				report();
			}
		}
		for (const [index, day] of days.entries()) {
			await retry(() => client.batch(session.id, index + 1, day, signal));
			completed++;
			report();
		}
		const result = await retry(() => client.finish(session.id, "complete", signal));
		report("complete");
		return result;
	} catch (error) {
		try {
			await client.finish(session.id, "cancelled", AbortSignal.timeout(5000));
		} catch {
			/* Keep the original failure. */
		}
		throw error;
	}
}
