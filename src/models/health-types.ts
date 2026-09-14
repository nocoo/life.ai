import type { DataTarget, ImportChannel } from "./data-management";

/** XML attribute values and child order are preserved, including unknown metadata. */
export interface HealthNode {
	name: string;
	attributes: Record<string, string>;
	children?: HealthNode[];
	text?: string;
}

export const HEALTH_DAY_MS = 86_400_000;
export const HEALTH_LIMITS = {
	seriesBytes: 512 * 1024,
	seriesRawBytes: 8 * 1024 * 1024,
	dayBytes: 4 * 1024 * 1024,
	seriesPerDay: 128,
	filePartRawBytes: 512 * 1024,
	filePartBytes: 768 * 1024,
	leaseMs: 5 * 60 * 1000,
} as const;

export interface HealthSeries {
	dimension: string;
	part: number;
	recordCount: number;
	firstAt: number;
	lastAt: number;
	rawBytes: number;
	payloadBytes: number;
	/** SHA-256 of canonical decoded JSON, independent of gzip implementation. */
	contentHash: string;
	/** Gzip-compressed UTF-8 JSON array of HealthNode, then base64. */
	body: string;
}

export interface HealthDaySummary {
	dimensions: Record<string, number>;
	sources: string[];
	nestedNodes: Record<string, number>;
	routePaths: string[];
}

export interface HealthDay {
	utcDay: number;
	recordCount: number;
	firstAt: number;
	lastAt: number;
	payloadBytes: number;
	contentHash: string;
	summary: HealthDaySummary;
	data: { v: 1; series: HealthSeries[] };
}

export interface StoredHealthSeries extends HealthSeries {
	utcDay: number;
	updatedAt: number;
}

export interface HealthFilePart {
	part: number;
	rawBytes: number;
	payloadBytes: number;
	/** SHA-256 of the original, uncompressed bytes of this part. */
	contentHash: string;
	body: string;
}

export interface HealthFile {
	path: string;
	kind: "route" | "ecg" | "cda" | "metadata";
	firstAt: number | null;
	lastAt: number | null;
	recordCount: number;
	rawBytes: number;
	/** SHA-256 of the ordered [part, rawBytes, contentHash] manifest. */
	contentHash: string;
	parts: HealthFilePart[];
}

export type HealthFileManifest = Omit<HealthFile, "parts"> & {
	parts: Omit<HealthFilePart, "body">[];
};

export interface HealthPlan {
	days: HealthDay[];
	files: HealthFile[];
	recordCount: number;
	xmlRecordCount: number;
	dimensionCount: number;
	seriesCount: number;
	routePointCount: number;
	ecgSampleCount: number;
	payloadBytes: number;
	warnings: string[];
}

export interface HealthProgress {
	phase: "analyzing" | "packing" | "uploading" | "complete";
	bytesRead: number;
	totalBytes: number;
	recordCount: number;
	completed: number;
	total: number;
}

export interface HealthInputFile {
	path: string;
	size: number;
	stream: () => ReadableStream<Uint8Array>;
}

/** Browser IndexedDB and local disk implementations keep the 850 MB export out of RAM. */
export interface HealthStaging {
	append: (groups: Map<number, HealthNode[]>) => Promise<void>;
	days: () => Promise<number[]>;
	read: (utcDay: number) => Promise<HealthNode[]>;
	clear: () => Promise<void>;
}

export interface HealthImportRequest {
	fileName: string;
	totalDays: number;
	totalRecords: number;
	files: HealthFileManifest[];
	channel: ImportChannel;
	target: DataTarget;
}

export interface HealthImportReceipt {
	sessionId: string;
	status: "running" | "complete" | "cancelled";
	committedDays: number;
	committedRecords: number;
	insertedDays: number;
	updatedDays: number;
	unchangedDays: number;
}
