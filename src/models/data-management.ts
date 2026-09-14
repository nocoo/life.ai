import type { FootprintDay } from "./footprint";
import type { ImportSourceId } from "./types";

export type DataTarget = "local" | "production" | "test";
export type ImportChannel = "web" | "cli";

export const FOOTPRINT_LIMITS = {
	batchDays: 32,
	batchBytes: 768 * 1024,
	leaseMs: 5 * 60 * 1000,
} as const;

export interface ProviderCoverageDay {
	utcDay: number;
	recordCount: number;
}

export interface ProviderOverview {
	id: ImportSourceId;
	name: string;
	storage: "daily-json" | "day-dimension" | "events";
	coverageDays: number;
	recordCount: number;
	dataRows: number;
	payloadBytes: number;
	firstAt: string | null;
	lastAt: string | null;
	lastImportedAt: string | null;
	lastChangedAt: string | null;
	lastImportChannel: ImportChannel | null;
	coverage: ProviderCoverageDay[];
	health?: HealthProviderStats;
}

export interface HealthProviderStats {
	epochRecordCount: number;
	dimensions: {
		id: string;
		recordCount: number;
		coverageDays: number;
		dataRows: number;
		payloadBytes: number;
	}[];
	files: { kind: string; fileCount: number; recordCount: number; rawBytes: number }[];
}

export interface DataOverview {
	target: DataTarget;
	providers: ProviderOverview[];
	computedAt: string;
}

export interface FootprintImportRequest {
	fileName: string;
	totalDays: number;
	totalPoints: number;
	channel: ImportChannel;
	target: DataTarget;
}

export interface FootprintImportSession {
	id: string;
	expiresAt: string;
	target: DataTarget;
	totalDays: number;
	totalPoints: number;
}

export interface FootprintImportReceipt {
	sessionId: string;
	status: "running" | "complete" | "cancelled";
	committedDays: number;
	committedPoints: number;
	insertedDays: number;
	updatedDays: number;
	unchangedDays: number;
}

export interface FootprintBatchReceipt extends FootprintImportReceipt {
	batchId: number;
	days: {
		utcDay: number;
		recordCount: number;
		contentHash: string;
		status: "inserted" | "updated" | "unchanged";
	}[];
}

export interface FootprintDaysResult {
	days: (FootprintDay & { updatedAt: number })[];
}
