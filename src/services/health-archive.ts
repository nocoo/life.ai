import { BlobReader, ZipReader } from "@zip.js/zip.js";
import { healthFilePath } from "../models/apple-health";
import type { HealthInputFile } from "../models/health-types";

/** ZIP entries are streamed with backpressure; EOF is exposed only after CRC validation succeeds. */
export async function openHealthZip(blob: Blob): Promise<{
	files: HealthInputFile[];
	close: () => Promise<void>;
}> {
	const zip = new ZipReader(new BlobReader(blob), {
		useWebWorkers: false,
		checkCrc32: true,
		strictness: "strict",
		filenameValidation: "strict",
	});
	const tasks = new Set<Promise<void>>();
	const controllers = new Set<AbortController>();
	let closed = false;
	const close = async () => {
		closed = true;
		for (const controller of controllers) controller.abort();
		await Promise.all(tasks);
		await zip.close();
	};
	try {
		const entries = await zip.getEntries();
		const files: HealthInputFile[] = [];
		const paths = new Set<string>();
		for (const entry of entries) {
			if (entry.symlink) throw new Error("健康 ZIP 不能包含符号链接");
			if (entry.directory) continue;
			const path = healthFilePath(entry.filename);
			if (
				paths.has(path) ||
				!Number.isSafeInteger(entry.uncompressedSize) ||
				entry.uncompressedSize < 0
			) {
				throw new Error("健康 ZIP 文件路径重复或大小无效");
			}
			paths.add(path);
			files.push({
				path,
				size: entry.uncompressedSize,
				stream: () => {
					if (closed) throw new Error("健康 ZIP 已关闭");
					const controller = new AbortController();
					controllers.add(controller);
					const bridge = new TransformStream<Uint8Array, Uint8Array>(
						undefined,
						new ByteLengthQueuingStrategy({ highWaterMark: 64 * 1024 }),
						new ByteLengthQueuingStrategy({ highWaterMark: 64 * 1024 }),
					);
					const reader = bridge.readable.getReader();
					const task = (async () => {
						try {
							await entry.getData(bridge.writable, {
								signal: controller.signal,
								preventClose: true,
							});
							await bridge.writable.close();
						} catch (error) {
							await Promise.allSettled([bridge.writable.abort(error)]);
						} finally {
							controllers.delete(controller);
						}
					})();
					tasks.add(task);
					void task.then(() => tasks.delete(task));
					return new ReadableStream<Uint8Array>(
						{
							async pull(output) {
								try {
									const next = await reader.read();
									if (next.done) output.close();
									else output.enqueue(next.value);
								} catch (error) {
									output.error(error);
								}
							},
							async cancel(reason) {
								controller.abort(reason);
								await Promise.allSettled([reader.cancel(reason)]);
							},
						},
						{ highWaterMark: 0 },
					);
				},
			});
		}
		return { files, close };
	} catch (error) {
		await close();
		throw error;
	}
}
