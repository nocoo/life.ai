import { afterEach, describe, expect, it, vi } from "vitest";
import {
	createConnect,
	fetchConnects,
	revokeConnect,
} from "../../../../src/services/connects-service";
import { connectFixture, createdConnectFixture, jsonResponse, stubFetch } from "../helpers";

describe("connects service", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("lists connects", async () => {
		const connects = [connectFixture()];
		stubFetch(
			vi.fn(async (input: RequestInfo | URL) => {
				expect(String(input)).toBe("/api/connects");
				return jsonResponse(200, { data: connects });
			}),
		);
		await expect(fetchConnects()).resolves.toEqual(connects);
	});

	it("creates a connect", async () => {
		const created = createdConnectFixture();
		stubFetch(
			vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
				expect(init?.body).toBe(JSON.stringify({ name: "Mac mini" }));
				return jsonResponse(201, { data: created });
			}),
		);
		await expect(createConnect("Mac mini")).resolves.toEqual(created);
	});

	it("revokes by encoded id", async () => {
		const revoked = connectFixture({ revokedAt: "2026-09-13T02:00:00Z" });
		stubFetch(
			vi.fn(async (input: RequestInfo | URL) => {
				expect(String(input)).toBe("/api/connects/c%2F1");
				return jsonResponse(200, { data: revoked });
			}),
		);
		await expect(revokeConnect("c/1")).resolves.toEqual(revoked);
	});
});
