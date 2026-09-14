/// <reference lib="webworker" />
import { parseHealthExport } from "../models/apple-health";
import type { HealthPlan, HealthProgress, HealthStaging } from "../models/health-types";
import { openHealthZip } from "./health-archive";
import { type HealthWorkerIn, type HealthWorkerOut, healthPreview } from "./health-browser";
import { createHealthClient, uploadHealthPlan } from "./health-client";
import { createHealthStaging } from "./health-staging";

export function createHealthImportHost(
	post: (message: HealthWorkerOut) => void,
	deps = {
		parseHealthExport,
		openHealthZip,
		createHealthStaging,
		createHealthClient,
		uploadHealthPlan,
	},
) {
	let plan: HealthPlan | null = null;
	let controller: AbortController | null = null;
	let fileName = "apple_health_export";
	let busy = false;
	return {
		async handle(message: HealthWorkerIn): Promise<void> {
			if (message.type === "cancel") {
				controller?.abort();
				return;
			}
			if (busy) {
				post({ type: "error", id: message.id, message: "上一项处理尚未结束。", aborted: false });
				return;
			}
			busy = true;
			controller = new AbortController();
			const signal = controller.signal;
			let staging: HealthStaging | null = null;
			let archive: Awaited<ReturnType<typeof openHealthZip>> | null = null;
			let result: HealthWorkerOut;
			try {
				const onProgress = (progress: HealthProgress) =>
					post({ type: "progress", id: message.id, progress });
				if (message.type === "start") {
					plan = null;
					const first = message.files[0];
					if (!first) throw new Error("请选择完整 Apple 健康导出。");
					fileName = message.files.length === 1 ? first.file.name : "apple_health_export";
					staging = await deps.createHealthStaging(message.stagingName);
					archive =
						message.files.length === 1 && /\.zip$/i.test(first.path)
							? await deps.openHealthZip(first.file)
							: null;
					const files =
						archive?.files ??
						message.files.map(({ file, path }) => ({
							path,
							size: file.size,
							stream: () => file.stream(),
						}));
					plan = await deps.parseHealthExport(files, staging, { signal, onProgress });
					signal.throwIfAborted();
					result = { type: "preview", id: message.id, preview: healthPreview(plan) };
				} else {
					if (!plan) throw new Error("没有可提交的健康解析结果。");
					const receipt = await deps.uploadHealthPlan(deps.createHealthClient(), plan, {
						fileName,
						target: message.target,
						channel: "web",
						signal,
						onProgress,
					});
					result = { type: "complete", id: message.id, receipt };
				}
			} catch (error) {
				result = {
					type: "error",
					id: message.id,
					message: error instanceof Error ? error.message : "健康数据处理失败。",
					aborted: signal.aborted,
				};
			}
			const cleanup = await Promise.allSettled([archive?.close(), staging?.clear()]);
			if (cleanup.some((item) => item.status === "rejected") && result.type !== "error")
				result = {
					type: "error",
					id: message.id,
					message: "无法清理健康暂存数据，请重新选择文件。",
					aborted: signal.aborted,
				};
			busy = false;
			post(result);
		},
	};
}

export function bindHealthWorker(scope: {
	onmessage: ((event: MessageEvent<HealthWorkerIn>) => void) | null;
	postMessage: (message: HealthWorkerOut) => void;
}) {
	const host = createHealthImportHost((message) => scope.postMessage(message));
	scope.onmessage = (event) => {
		void host.handle(event.data);
	};
	return host;
}

if (typeof self !== "undefined") bindHealthWorker(self);
