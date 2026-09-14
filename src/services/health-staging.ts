import type { HealthNode, HealthStaging } from "../models/health-types";

function result<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error ?? new Error("临时存储读取失败。"));
	});
}

export async function deleteHealthStaging(name: string): Promise<void> {
	await result(indexedDB.deleteDatabase(name));
}

export async function createHealthStaging(name: string): Promise<HealthStaging> {
	const request = indexedDB.open(name, 1);
	request.onupgradeneeded = () => {
		request.result.createObjectStore("chunks", { autoIncrement: true }).createIndex("day", "day");
	};
	const db = await result(request);
	return {
		async append(groups) {
			const transaction = db.transaction("chunks", "readwrite");
			const done = new Promise<void>((resolve, reject) => {
				transaction.oncomplete = () => resolve();
				transaction.onabort = transaction.onerror = () =>
					reject(transaction.error ?? new Error("临时存储空间不足。"));
			});
			for (const [day, nodes] of groups)
				transaction.objectStore("chunks").add({ day, json: JSON.stringify(nodes) });
			await done;
		},
		async days() {
			const cursor = db
				.transaction("chunks")
				.objectStore("chunks")
				.index("day")
				.openKeyCursor(null, "nextunique");
			return new Promise<number[]>((resolve, reject) => {
				const days: number[] = [];
				cursor.onerror = () => reject(cursor.error);
				cursor.onsuccess = () => {
					if (!cursor.result) {
						resolve(days);
						return;
					}
					days.push(Number(cursor.result.key));
					cursor.result.continue();
				};
			});
		},
		async read(day) {
			const chunks = (await result(
				db.transaction("chunks").objectStore("chunks").index("day").getAll(day),
			)) as { json: string }[];
			return chunks.flatMap((chunk) => JSON.parse(chunk.json) as HealthNode[]);
		},
		async clear() {
			db.close();
			await deleteHealthStaging(name);
		},
	};
}
