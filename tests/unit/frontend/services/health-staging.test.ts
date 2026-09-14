import { IDBDatabase, IDBFactory, IDBIndex } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HealthNode } from "../../../../src/models/health-types";
import { createHealthStaging, deleteHealthStaging } from "../../../../src/services/health-staging";

const firstDay = Date.UTC(2026, 8, 12);
const nextDay = Date.UTC(2026, 8, 13);
const node: HealthNode = {
	name: "Record",
	attributes: {
		sourceName: "Apple Watch",
		startDate: "2026-09-12T23:00:00+00:00",
		value: "HKCategoryValueSleepAnalysisAsleepCore",
	},
	children: [{ name: "MetadataEntry", attributes: { key: "note", value: "睡眠 & 恢复" } }],
	text: "原始内容",
};
beforeEach(() => vi.stubGlobal("indexedDB", new IDBFactory()));

function failedRequest<T>(error: DOMException | null): IDBRequest<T> {
	const request = { error, onerror: null as ((event: Event) => void) | null };
	queueMicrotask(() => request.onerror?.(new Event("error")));
	return request as unknown as IDBRequest<T>;
}

describe("health IndexedDB staging", () => {
	it("keeps independent chunks in UTC order without losing duplicate samples or nested metadata", async () => {
		const staging = await createHealthStaging("health-test");
		expect(await staging.days()).toEqual([]);
		expect(await staging.read(firstDay)).toEqual([]);
		await staging.append(new Map());
		await staging.append(
			new Map([
				[nextDay, [{ ...node, text: "second day" }]],
				[firstDay, [node]],
			]),
		);
		await staging.append(new Map([[firstDay, [node, { ...node, text: "later chunk" }]]]));
		expect(await staging.days()).toEqual([firstDay, nextDay]);
		expect(await staging.read(firstDay)).toEqual([node, node, { ...node, text: "later chunk" }]);
		expect(await staging.read(nextDay)).toEqual([{ ...node, text: "second day" }]);
		await staging.clear();
		expect(await indexedDB.databases()).toEqual([]);
	});
	it("reopens an existing staging database and deletes it after closing all connections", async () => {
		const first = await createHealthStaging("resume");
		await first.append(new Map([[firstDay, [node]]]));
		const reopened = await createHealthStaging("resume");
		expect(await reopened.read(firstDay)).toEqual([node]);
		await Promise.all([first.clear(), reopened.clear()]);
		const fresh = await createHealthStaging("resume");
		expect(await fresh.days()).toEqual([]);
		await fresh.clear();
		await deleteHealthStaging("already-missing");
	});
	it.each([new DOMException("database denied", "SecurityError"), null])(
		"surfaces IndexedDB opening failures: %s",
		async (error) => {
			vi.spyOn(indexedDB, "open").mockReturnValue(
				failedRequest<IDBDatabase>(error) as IDBOpenDBRequest,
			);
			await expect(createHealthStaging("denied")).rejects.toThrow(
				error?.message ?? "临时存储读取失败",
			);
		},
	);
	it("reports deletion failures to the caller", async () => {
		vi.spyOn(indexedDB, "deleteDatabase").mockReturnValue(
			failedRequest<IDBDatabase>(
				new DOMException("cannot delete", "UnknownError"),
			) as IDBOpenDBRequest,
		);
		await expect(deleteHealthStaging("busy")).rejects.toThrow("cannot delete");
	});
	it("rejects an aborted append and leaves no partial day chunks", async () => {
		const staging = await createHealthStaging("rollback");
		const original = IDBDatabase.prototype.transaction;
		vi.spyOn(IDBDatabase.prototype, "transaction").mockImplementationOnce(function (
			this: IDBDatabase,
			...args
		) {
			const transaction = original.apply(this, args);
			queueMicrotask(() => transaction.abort());
			return transaction;
		});
		await expect(staging.append(new Map([[firstDay, [node]]]))).rejects.toThrow("临时存储空间不足");
		expect(await staging.days()).toEqual([]);
		await staging.clear();
	});
	it("preserves the underlying transaction failure instead of replacing it", async () => {
		const staging = await createHealthStaging("quota");
		const original = IDBDatabase.prototype.transaction;
		vi.spyOn(IDBDatabase.prototype, "transaction").mockImplementationOnce(function (
			this: IDBDatabase,
			...args
		) {
			const transaction = original.apply(this, args);
			Object.defineProperty(transaction, "error", {
				value: new DOMException("disk quota reached", "QuotaExceededError"),
				configurable: true,
			});
			queueMicrotask(() => transaction.abort());
			return transaction;
		});
		await expect(staging.append(new Map([[firstDay, [node]]]))).rejects.toThrow(
			"disk quota reached",
		);
		await staging.clear();
	});
	it("propagates read and cursor errors without reporting an empty successful import", async () => {
		const staging = await createHealthStaging("failed-reads");
		vi.spyOn(IDBIndex.prototype, "getAll").mockReturnValueOnce(
			failedRequest(new DOMException("read failed", "UnknownError")),
		);
		await expect(staging.read(firstDay)).rejects.toThrow("read failed");
		vi.spyOn(IDBIndex.prototype, "openKeyCursor").mockReturnValueOnce(
			failedRequest(new DOMException("cursor failed", "UnknownError")),
		);
		await expect(staging.days()).rejects.toThrow("cursor failed");
		await staging.clear();
	});
});
