import { ApiError } from "./types.js";

function isTransient(error: unknown): boolean {
	for (let depth = 0; depth < 3 && error instanceof Error; depth++, error = error.cause) {
		if (
			/Network connection lost|fetch failed|Replica disconnected from primary|storage caused object to be reset|reset because its code was updated|Cannot resolve D1 DB due to transient issue|^internal error(?:;|$)/i.test(
				error.message.replace(/^D1_ERROR:\s*/i, ""),
			)
		)
			return true;
	}
	return false;
}

/** Only wrap reads or explicitly idempotent writes. Never retry a whole request or AI call. */
export async function withD1Retry<T>(operation: () => Promise<T>): Promise<T> {
	for (let attempt = 0; ; attempt++) {
		try {
			return await operation();
		} catch (error) {
			if (!isTransient(error)) throw error;
			console.warn(
				JSON.stringify({ event: "database_retry", attempt: attempt + 1, exhausted: attempt === 2 }),
			);
			if (attempt === 2)
				throw new ApiError(503, "database_unavailable", "数据库连接暂时中断，请稍后重试。");
			await new Promise((resolve) => setTimeout(resolve, 150 * 2 ** attempt + Math.random() * 50));
		}
	}
}
