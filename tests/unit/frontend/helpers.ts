import { vi } from "vitest";
import type {
	Connect,
	CreatedConnect,
	ImportRecord,
	LifeEvent,
	Session,
	Source,
} from "../../../src/models/types";

export function jsonResponse(
	status: number,
	body: unknown,
	statusText = status >= 400 ? "Error" : "OK",
): Response {
	return new Response(JSON.stringify(body), {
		status,
		statusText,
		headers: { "Content-Type": "application/json" },
	});
}

export function textResponse(status: number, body: string): Response {
	return new Response(body, { status, statusText: "Error" });
}

export function abortError(): Error {
	const error = new Error("aborted");
	error.name = "AbortError";
	return error;
}

export function sessionFixture(overrides: Partial<Session> = {}): Session {
	return {
		email: "zheng@hexly.ai",
		subject: "access-subject",
		mode: "access",
		...overrides,
	};
}

export function sourceFixture(overrides: Partial<Source> = {}): Source {
	return {
		id: "src-health",
		name: "Apple Health",
		kind: "import",
		provider: "apple-health",
		recordCount: 12,
		lastEventAt: "2026-09-13T01:00:00Z",
		...overrides,
	};
}

export function eventFixture(overrides: Partial<LifeEvent> = {}): LifeEvent {
	return {
		id: "evt-1",
		sourceId: "src-health",
		sourceName: "Apple Health",
		sourceKind: "import",
		occurredAt: "2026-09-13T01:00:00Z",
		endAt: null,
		precision: "hour",
		title: "步数",
		content: "",
		data: { type: "HKQuantityTypeIdentifierStepCount", value: 8000, unit: "count" },
		updatedAt: "2026-09-13T01:05:00Z",
		...overrides,
	};
}

export function connectFixture(overrides: Partial<Connect> = {}): Connect {
	return {
		id: "c-1",
		name: "Mac mini",
		prefix: "life_ab",
		createdAt: "2026-09-01T00:00:00Z",
		lastUsedAt: null,
		revokedAt: null,
		recordCount: 3,
		...overrides,
	};
}

export function createdConnectFixture(overrides: Partial<CreatedConnect> = {}): CreatedConnect {
	return {
		connect: connectFixture(),
		token: "life_secret_token",
		...overrides,
	};
}

export function importRecordFixture(overrides: Partial<ImportRecord> = {}): ImportRecord {
	return {
		key: "health-1",
		occurredAt: "2026-09-13T01:00:00Z",
		title: "步数",
		...overrides,
	};
}

export function stubFetch(handler: typeof fetch): void {
	vi.stubGlobal("fetch", handler);
}
