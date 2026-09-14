import { BlobReader, BlobWriter, TextReader, ZipReader, ZipWriter } from "@zip.js/zip.js";
import { describe, expect, it, vi } from "vitest";
import { parseHealthExport } from "../../../../src/models/apple-health";
import type { HealthNode, HealthStaging } from "../../../../src/models/health-types";
import { openHealthZip } from "../../../../src/services/health-archive";

async function archive(files: Record<string, string>, symlink = false): Promise<Blob> {
	const writer = new ZipWriter(new BlobWriter(), { useWebWorkers: false });
	await writer.add("apple_health_export/", undefined, { directory: true });
	for (const [path, text] of Object.entries(files)) {
		await writer.add(path, new TextReader(text), {
			level: 0,
			...(symlink ? { unixMode: 0o120777 } : {}),
		});
	}
	return writer.close();
}

function staging(): HealthStaging {
	const rows = new Map<number, HealthNode[]>();
	return {
		async append(groups) {
			for (const [day, nodes] of groups) rows.set(day, [...(rows.get(day) ?? []), ...nodes]);
		},
		async days() {
			return [...rows.keys()];
		},
		async read(day) {
			return rows.get(day) ?? [];
		},
		async clear() {
			rows.clear();
		},
	};
}

describe("health ZIP reader", () => {
	it("keeps UTF-8 Chinese names even when macOS leaves the UTF-8 flag unset", async () => {
		const blob = await archive({
			"apple_health_export/导出.xml":
				'<HealthData><Record startDate="2026-01-02" type="Height"/></HealthData>',
		});
		const bytes = new Uint8Array(await blob.arrayBuffer());
		const view = new DataView(bytes.buffer);
		for (let i = 0; i < bytes.length - 12; i++) {
			const signature = view.getUint32(i, true);
			const field = signature === 0x04034b50 ? i + 6 : signature === 0x02014b50 ? i + 8 : -1;
			if (field >= 0) view.setUint16(field, view.getUint16(field, true) & ~0x0800, true);
		}
		const opened = await openHealthZip(new Blob([bytes]));
		try {
			expect(opened.files.map((file) => file.path)).toEqual(["apple_health_export/导出.xml"]);
			const plan = await parseHealthExport(opened.files, staging());
			expect(plan).toMatchObject({ recordCount: 1, xmlRecordCount: 1 });
		} finally {
			await opened.close();
		}
	});

	it("supports repeatable streaming reads and close without retaining a whole uncompressed file", async () => {
		const content = "data\n".repeat(100000);
		const opened = await openHealthZip(await archive({ "a.txt": content }));
		const file = opened.files[0];
		expect(file?.size).toBe(content.length);
		for (let i = 0; i < 2; i++) expect(await new Response(file?.stream()).text()).toBe(content);
		await opened.close();
		await opened.close();
		expect(() => file?.stream()).toThrow("已关闭");
	});

	it("propagates a late content CRC failure instead of exposing successful EOF", async () => {
		const blob = await archive({ "a.txt": "uncompressed-content-to-corrupt" });
		const bytes = new Uint8Array(await blob.arrayBuffer());
		const token = new TextEncoder().encode("uncompressed-content-to-corrupt");
		const offset = bytes.findIndex((_, index) =>
			token.every((byte, n) => bytes[index + n] === byte),
		);
		expect(offset).toBeGreaterThan(0);
		bytes[offset] = 65;
		const opened = await openHealthZip(new Blob([bytes]));
		try {
			await expect(new Response(opened.files[0]?.stream()).arrayBuffer()).rejects.toThrow();
		} finally {
			await opened.close();
		}
	});

	it("rejects path traversal, symlinks and invalid archives", async () => {
		const blob = await archive({ safe1: "data" });
		const bytes = new Uint8Array(await blob.arrayBuffer());
		const name = new TextEncoder().encode("safe1");
		for (let i = 0; i < bytes.length - name.length; i++) {
			if (name.every((byte, n) => bytes[i + n] === byte))
				bytes.set(new TextEncoder().encode("../a1"), i);
		}
		await expect(openHealthZip(new Blob([bytes]))).rejects.toThrow();
		await expect(openHealthZip(await archive({ link: "target" }, true))).rejects.toThrow(
			"符号链接",
		);
		await expect(openHealthZip(new Blob([new Uint8Array([1, 2, 3])]))).rejects.toThrow();
	});

	it("rejects duplicate paths and invalid sizes before opening entry streams", async () => {
		const blob = await archive({ "a.txt": "data" });
		const zip = new ZipReader(new BlobReader(blob));
		const entry = (await zip.getEntries()).find((entry) => !entry.directory);
		await zip.close();
		if (!entry) throw new Error("missing test entry");
		const spy = vi.spyOn(ZipReader.prototype, "getEntries");
		try {
			for (const size of [-1, NaN, 1.5]) {
				spy.mockResolvedValueOnce([{ ...entry, uncompressedSize: size }]);
				await expect(openHealthZip(blob)).rejects.toThrow("大小无效");
			}
			spy.mockResolvedValueOnce([entry, entry]);
			await expect(openHealthZip(blob)).rejects.toThrow("路径重复");
		} finally {
			spy.mockRestore();
		}
	});

	it("cancels decompression when a consumer stops early or closes a blocked stream", async () => {
		const opened = await openHealthZip(await archive({ "a.txt": "data".repeat(500000) }));
		const file = opened.files[0];
		const reader = file?.stream().getReader();
		expect((await reader?.read())?.done).toBe(false);
		await reader?.cancel("cancel preview");
		const blocked = file?.stream().getReader();
		await opened.close();
		await expect(blocked?.read()).rejects.toThrow();
	});
});
