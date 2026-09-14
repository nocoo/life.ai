import type {
	DataTarget,
	FootprintBatchReceipt,
	FootprintImportReceipt,
	ImportChannel,
} from "../models/data-management";
import { type PixiuDay, type PixiuPlan, parsePixiu } from "../models/pixiu";
import {
	abortableDelay,
	createDataRequest,
	type FootprintClientOptions,
	isTransientError,
	partitionFootprintDays,
} from "./footprint-client";

const PREFIX = "/api/data/pixiu";
export function createPixiuClient(options: FootprintClientOptions = {}) {
	const request = createDataRequest(options);
	return {
		target: (signal?: AbortSignal) =>
			request<{ target: DataTarget }>("/api/data/target", { signal }),
		begin: (
			body: {
				fileName: string;
				totalDays: number;
				totalRecords: number;
				target: DataTarget;
				channel: ImportChannel;
			},
			signal?: AbortSignal,
		) =>
			request<{ id: string }>(`${PREFIX}/imports`, {
				method: "POST",
				body: JSON.stringify(body),
				signal,
			}),
		batch: (id: string, batch: number, days: PixiuDay[], signal?: AbortSignal) =>
			request<FootprintBatchReceipt>(
				`${PREFIX}/imports/${encodeURIComponent(id)}/batches/${batch}`,
				{ method: "PUT", body: JSON.stringify({ days }), signal },
			),
		finish: (id: string, status: "complete" | "cancelled", signal?: AbortSignal) =>
			request<FootprintImportReceipt>(`${PREFIX}/imports/${encodeURIComponent(id)}/finish`, {
				method: "POST",
				body: JSON.stringify({ status }),
				signal,
			}),
		days: (start: string, end: string, signal?: AbortSignal) =>
			request<{ days: PixiuDay[] }>(`${PREFIX}/days`, { signal }, { start, end }),
	};
}
export type PixiuClient = ReturnType<typeof createPixiuClient>;

export async function readPixiuFiles(
	files: readonly File[],
	signal?: AbortSignal,
): Promise<PixiuPlan> {
	if (files.some((file) => !/\.csv$/i.test(file.name)))
		throw new Error("请选择貔貅导出的 CSV 文件");
	if (files.reduce((sum, file) => sum + file.size, 0) > 32 * 1024 * 1024)
		throw new Error("每次貔貅导入最多 32 MiB，请分次导入完整日期");
	const inputs: { name: string; text: string }[] = [];
	for (const file of files) {
		signal?.throwIfAborted();
		inputs.push({
			name: file.name,
			text: new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()),
		});
	}
	return parsePixiu(inputs, { signal });
}

export async function uploadPixiuPlan(
	client: PixiuClient,
	plan: PixiuPlan,
	options: {
		target: DataTarget;
		channel: ImportChannel;
		signal?: AbortSignal;
		onProgress?: (receipt: FootprintImportReceipt) => void;
	},
): Promise<FootprintImportReceipt> {
	const { signal } = options;
	signal?.throwIfAborted();
	if (
		!plan.days.length ||
		plan.recordCount !== plan.days.reduce((sum, day) => sum + day.recordCount, 0)
	)
		throw new Error("貔貅导入计划不完整");
	if (new Set(plan.days.map((day) => day.utcDay)).size !== plan.days.length)
		throw new Error("貔貅导入计划包含重复日期");
	const batches = partitionFootprintDays([...plan.days].sort((a, b) => a.utcDay - b.utcDay));
	const remote = await client.target(signal);
	if (remote.target !== options.target)
		throw new Error(`目标环境不匹配：服务端为 ${remote.target}`);
	const session = await client.begin(
		{
			fileName: (plan.fileNames.length === 1
				? (plan.fileNames[0] as string)
				: `${plan.fileNames[0]} 等 ${plan.fileNames.length} 个文件`
			).slice(0, 255),
			totalDays: plan.days.length,
			totalRecords: plan.recordCount,
			target: options.target,
			channel: options.channel,
		},
		signal,
	);
	const retry = async <T>(operation: () => Promise<T>): Promise<T> => {
		for (let attempt = 0; ; attempt++) {
			signal?.throwIfAborted();
			try {
				return await operation();
			} catch (error) {
				if (attempt >= 2 || !isTransientError(error)) throw error;
				await abortableDelay(200 * 2 ** attempt, signal);
			}
		}
	};
	try {
		for (const [index, days] of batches.entries()) {
			const receipt = await retry(() => client.batch(session.id, index + 1, days, signal));
			options.onProgress?.(receipt);
		}
		const receipt = await retry(() => client.finish(session.id, "complete", signal));
		options.onProgress?.(receipt);
		return receipt;
	} catch (error) {
		try {
			await client.finish(session.id, "cancelled", AbortSignal.timeout(5000));
		} catch {
			/* Preserve the original failure; committed days remain safe to replay. */
		}
		throw error;
	}
}
