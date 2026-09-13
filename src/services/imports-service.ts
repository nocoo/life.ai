import type { ImportRecord, ImportSourceId } from "../models/types";
import { apiSend } from "./http";

export interface ImportBatchResult {
	accepted: number;
}

export function postImportBatch(
	source: ImportSourceId,
	records: ImportRecord[],
	signal?: AbortSignal,
): Promise<ImportBatchResult> {
	return apiSend<ImportBatchResult>("/api/imports", "POST", { source, records }, signal);
}
