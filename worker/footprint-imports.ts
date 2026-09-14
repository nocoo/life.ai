import { beginProviderImport, finishProviderImport, putProviderBatch } from "./provider-imports.js";
import type { WorkerEnv } from "./types.js";

export { dataTarget } from "./provider-imports.js";

export function beginFootprintImport(request: Request, env: WorkerEnv) {
	return beginProviderImport(request, env, "footprint");
}
export function putFootprintBatch(request: Request, env: WorkerEnv, id: string, batchId: number) {
	return putProviderBatch(request, env, id, batchId, "footprint");
}
export function finishFootprintImport(request: Request, env: WorkerEnv, id: string) {
	return finishProviderImport(request, env, id, "footprint");
}
