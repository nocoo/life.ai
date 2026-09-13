export const AUTHOR_PROFILE_ENDPOINT = "https://lizheng.blog/api/authors/profile";

export const MAX_AUTHOR_PROFILE_BYTES = 16 * 1024; // 16 KiB limit
export const AUTHOR_PROFILE_TIMEOUT_MS = 2500; // 2.5s timeout

export interface AuthorProfile {
	name: string | null;
	avatar: string | null;
}

const EMPTY_PROFILE: AuthorProfile = { name: null, avatar: null };

/**
 * Normalizes email by trimming whitespace and lowercasing.
 */
export function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

/**
 * Computes SHA-256 hex digest of normalized email.
 */
export async function hashEmail(email: string): Promise<string> {
	const bytes = new TextEncoder().encode(normalizeEmail(email));
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Validates that an avatar URL is a valid, absolute HTTPS URL.
 */
function isSafeHttpsUrl(urlStr: string): boolean {
	try {
		const parsed = new URL(urlStr);
		return parsed.protocol === "https:" && !parsed.username && !parsed.password;
	} catch {
		return false;
	}
}

/**
 * Safely parses profile payload and extracts name and safe HTTPS avatar.
 */
function readProfile(data: unknown): AuthorProfile {
	if (!data || typeof data !== "object" || Array.isArray(data)) {
		return EMPTY_PROFILE;
	}
	const rec = data as { name?: unknown; avatar?: unknown };
	const name = typeof rec.name === "string" && rec.name.trim().length > 0 ? rec.name.trim() : null;
	let avatar: string | null = null;
	if (typeof rec.avatar === "string" && rec.avatar.trim().length > 0) {
		const trimmedAvatar = rec.avatar.trim();
		if (isSafeHttpsUrl(trimmedAvatar)) {
			avatar = trimmedAvatar;
		}
	}
	return { name, avatar };
}

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/**
 * Reads stream with an upper byte limit to prevent unbounded memory usage.
 */
async function readBoundedText(response: Response, maxBytes: number): Promise<string | null> {
	const contentLength = response.headers.get("content-length");
	if (contentLength && Number.parseInt(contentLength, 10) > maxBytes) {
		await response.body?.cancel();
		return null;
	}

	const reader = response.body?.getReader();
	if (!reader) {
		return null;
	}

	const chunks: Uint8Array[] = [];
	let receivedBytes = 0;

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			receivedBytes += value.byteLength;
			if (receivedBytes > maxBytes) {
				await reader.cancel();
				return null;
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}

	if (receivedBytes === 0) {
		return null;
	}

	const total = new Uint8Array(receivedBytes);
	let offset = 0;
	for (const chunk of chunks) {
		total.set(chunk, offset);
		offset += chunk.byteLength;
	}

	return new TextDecoder("utf-8").decode(total);
}

/**
 * Fetches author profile from lizheng.blog given an authenticated email.
 * Fail-soft: always returns { name: null, avatar: null } on any network error,
 * non-200 response, invalid JSON, payload > 16KiB, or timeout.
 */
export async function fetchAuthorProfile(
	email: string,
	fetchFn: FetchLike = fetch,
): Promise<AuthorProfile> {
	if (!email.trim()) {
		return EMPTY_PROFILE;
	}

	try {
		const hash = await hashEmail(email);
		const targetUrl = `${AUTHOR_PROFILE_ENDPOINT}?hash=${hash}`;
		const res = await fetchFn(targetUrl, {
			redirect: "manual",
			signal: AbortSignal.timeout(AUTHOR_PROFILE_TIMEOUT_MS),
			headers: { Accept: "application/json" },
		});

		if (!res.ok) {
			await res.body?.cancel();
			return EMPTY_PROFILE;
		}

		const text = await readBoundedText(res, MAX_AUTHOR_PROFILE_BYTES);
		if (!text) {
			return EMPTY_PROFILE;
		}

		const data = JSON.parse(text);
		return readProfile(data);
	} catch {
		return EMPTY_PROFILE;
	}
}
