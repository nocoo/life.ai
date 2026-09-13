import { createLocalJWKSet, createRemoteJWKSet, jwtVerify } from "jose";
import { ApiError, type AuthContext, type ConnectAuthContext, type WorkerEnv } from "./types.js";

let remoteJWKSCache: ReturnType<typeof createRemoteJWKSet> | null = null;
let cachedDomain: string | null = null;

function getRemoteJWKS(teamDomain: string) {
	if (remoteJWKSCache && cachedDomain === teamDomain) {
		return remoteJWKSCache;
	}
	remoteJWKSCache = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
	cachedDomain = teamDomain;
	return remoteJWKSCache;
}

/**
 * Checks whether the hostname is recognized as local (loopback or local dev host).
 */
export function isLocalHost(hostname: string): boolean {
	return (
		hostname === "localhost" ||
		hostname === "127.0.0.1" ||
		hostname === "::1" ||
		hostname === "life.dev.hexly.ai"
	);
}

/**
 * Verifies if isolated test bypass is physically allowed in the database.
 * Table `_test_marker` schema: (key TEXT PRIMARY KEY, value TEXT).
 * Looks for row WHERE key = 'env' AND value = 'test'.
 */
export async function verifyTestMarker(db: D1Database): Promise<boolean> {
	try {
		const row = await db
			.prepare("SELECT value FROM _test_marker WHERE key = 'env' LIMIT 1")
			.first<{ value: string }>();
		return row?.value === "test";
	} catch {
		return false;
	}
}

/**
 * Authenticates Cloudflare Access requests.
 * Production NEVER bypasses from Host or forged header.
 * Only development + recognized local host may use a local identity.
 * Isolated tests: RESOURCE_ENV === "test" && loopback host, verified by DB _test_marker table.
 * Both local test identity and local JWKS paths MUST verify the DB test marker first.
 * Production RS256 verification requires:
 * - algorithms: ["RS256"]
 * - fixed issuer and audience
 * - required 'exp' and 'sub' claims
 * - sanitized verification error message (never leaks internal detail)
 */
export async function authenticateAccess(
	request: Request,
	env: WorkerEnv,
	url: URL,
): Promise<AuthContext> {
	const host = url.hostname;
	const isProd = env.RESOURCE_ENV === "production";

	// 1. Check local dev bypass
	if (!isProd && env.RESOURCE_ENV === "development" && isLocalHost(host)) {
		return {
			email: "dev@local.hexly.ai",
			subject: "local-dev-user",
			mode: "local",
		};
	}

	// 2. Check isolated test candidate: RESOURCE_ENV === "test" && loopback
	const isLoopback = host === "127.0.0.1" || host === "localhost" || host === "::1";
	const isTestCandidate = !isProd && env.RESOURCE_ENV === "test" && isLoopback;

	let isTestVerified = false;
	if (isTestCandidate) {
		isTestVerified = await verifyTestMarker(env.DB);
	}

	// Local test identity path (no JWKS configured)
	if (isTestVerified && !env.TEST_ACCESS_JWKS) {
		return {
			email: "test@local.hexly.ai",
			subject: "local-test-user",
			mode: "local",
		};
	}

	// 3. Access JWT verification
	const jwt = request.headers.get("Cf-Access-Jwt-Assertion");
	if (!jwt) {
		throw new ApiError(401, "unauthorized", "Missing Access JWT");
	}

	const teamDomain = env.ACCESS_TEAM_DOMAIN;
	const aud = env.ACCESS_AUD;

	if (!teamDomain || !aud) {
		throw new ApiError(
			500,
			"auth_configuration_error",
			"Access authentication not configured. Set ACCESS_TEAM_DOMAIN and ACCESS_AUD.",
		);
	}

	try {
		let keySet: ReturnType<typeof createRemoteJWKSet> | ReturnType<typeof createLocalJWKSet>;

		// Local JWKS fixture path: ONLY allowed if DB test marker is verified
		if (isTestVerified && env.TEST_ACCESS_JWKS) {
			const jwksData = JSON.parse(env.TEST_ACCESS_JWKS);
			keySet = createLocalJWKSet(jwksData);
		} else {
			keySet = getRemoteJWKS(teamDomain);
		}

		const { payload } = await jwtVerify(jwt, keySet, {
			issuer: `https://${teamDomain}`,
			audience: aud,
			algorithms: ["RS256"],
			requiredClaims: ["exp", "sub"],
		});

		const email = typeof payload.email === "string" ? payload.email : null;
		const subject = payload.sub as string;

		return {
			email,
			subject,
			mode: "access",
		};
	} catch {
		// Sanitize error: never leak internal JOSE exceptions
		throw new ApiError(403, "forbidden", "Invalid Access JWT");
	}
}

/**
 * Computes SHA-256 hex digest of a string using Web Crypto API.
 */
export async function sha256(text: string): Promise<string> {
	const msgBuffer = new TextEncoder().encode(text);
	const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Connect token regex: exactly life_ followed by 64 lowercase/uppercase hex characters.
 */
export const CONNECT_TOKEN_REGEX = /^life_[0-9a-fA-F]{64}$/;

/**
 * Generates a random Connect token:
 * "life_" + 32 random bytes encoded as hex (total 69 chars: life_ + 64 hex chars).
 */
export function generateConnectToken(): { token: string; prefix: string } {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	const hex = Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
	const token = `life_${hex}`;
	const prefix = token.slice(0, 12);
	return { token, prefix };
}

/**
 * Authenticates a Connect token from the Authorization: Bearer <token> header.
 * Enforces exact token format (life_ + 64 hex characters).
 * Fences revoked tokens at write.
 * Note: last_used_at is updated ONLY after successful write operation to prevent
 * updating timestamps on rejected or revoked writes.
 */
export async function authenticateConnect(
	request: Request,
	db: D1Database,
): Promise<ConnectAuthContext> {
	const authHeader = request.headers.get("Authorization");
	if (!authHeader?.startsWith("Bearer ")) {
		throw new ApiError(401, "unauthorized", "Missing or invalid Authorization header");
	}

	const token = authHeader.slice(7).trim();
	if (!CONNECT_TOKEN_REGEX.test(token)) {
		throw new ApiError(401, "invalid_token", "Invalid token format");
	}

	const hash = await sha256(token);

	// Query connect
	const row = await db
		.prepare("SELECT id, name, prefix, revoked_at FROM connects WHERE token_hash = ?")
		.bind(hash)
		.first<{ id: string; name: string; prefix: string; revoked_at: number | null }>();

	if (!row) {
		throw new ApiError(401, "invalid_token", "Connect token not found or invalid");
	}

	if (row.revoked_at !== null) {
		throw new ApiError(403, "token_revoked", "Connect token has been revoked");
	}

	return {
		connectId: row.id,
		name: row.name,
		prefix: row.prefix,
	};
}
