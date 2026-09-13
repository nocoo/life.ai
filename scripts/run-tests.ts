import {
	closeSync,
	mkdirSync,
	mkdtempSync,
	openSync,
	readdirSync,
	readFileSync,
	rmSync,
} from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { assertMarker, executeLocalSql, testEnvironment } from "./local-db";
import { verifyLocalBindings } from "./verify-test-bindings";

const tier = process.argv[2];
if (tier !== "l2" && tier !== "l3") throw new Error("Use run-tests.ts l2|l3");
const port = tier === "l2" ? 17011 : 27011;
const base = `http://127.0.0.1:${port}`;
await new Promise<void>((resolve, reject) => {
	const probe = createServer();
	probe.once("error", () => reject(new Error(`Test port ${port} is already in use`)));
	probe.listen(port, "127.0.0.1", () => probe.close(() => resolve()));
});
mkdirSync(".wrangler/tests", { recursive: true });
mkdirSync(`test-results/${tier}`, { recursive: true });
const state = mkdtempSync(resolve(".wrangler/tests", `${tier}-`));
process.env.CLOUDFLARE_ENV = "local";
verifyLocalBindings(state);

// A new key for each isolated run exercises real signature/claims verification without Access credentials.
const { publicKey, privateKey } = await generateKeyPair("RS256");
const publicJwk = {
	...(await exportJWK(publicKey)),
	alg: "RS256",
	kid: "life-isolated-test",
	use: "sig",
};
async function token(
	options: {
		subject?: string;
		audience?: string;
		expiry?: number;
		omitExpiry?: boolean;
		issuer?: string;
		notBefore?: number;
	} = {},
) {
	let jwt = new SignJWT({ email: "reader@example.test" })
		.setProtectedHeader({ alg: "RS256", kid: publicJwk.kid })
		.setSubject(options.subject ?? "life-isolated-reader")
		.setIssuer(options.issuer ?? "https://nocoo.cloudflareaccess.com")
		.setAudience(options.audience ?? "life-local-only")
		.setIssuedAt();
	if (!options.omitExpiry)
		jwt = jwt.setExpirationTime(options.expiry ?? Math.floor(Date.now() / 1000) + 1800);
	if (options.notBefore) jwt = jwt.setNotBefore(options.notBefore);
	return jwt.sign(privateKey);
}
const env = {
	...testEnvironment(state),
	LIFE_TEST_STATE: state,
	LIFE_TEST_URL: base,
	LIFE_TEST_JWKS: JSON.stringify({ keys: [publicJwk] }),
	LIFE_TEST_TOKEN: await token(),
	LIFE_TEST_OTHER_TOKEN: await token({ subject: "life-other-access-subject" }),
	LIFE_TEST_EXPIRED_TOKEN: await token({ expiry: 1 }),
	LIFE_TEST_WRONG_AUD_TOKEN: await token({ audience: "different-app" }),
	LIFE_TEST_NO_EXP_TOKEN: await token({ omitExpiry: true }),
	LIFE_TEST_WRONG_ISSUER_TOKEN: await token({ issuer: "https://untrusted.example.test" }),
	LIFE_TEST_FUTURE_TOKEN: await token({ notBefore: Math.floor(Date.now() / 1000) + 3600 }),
};
let server: ReturnType<typeof Bun.spawn> | undefined;
let marked = false;
let log: number | undefined;
try {
	// The only unmarked write is initialization of this freshly created local directory.
	await executeLocalSql(
		state,
		"CREATE TABLE _test_marker(key TEXT PRIMARY KEY, value TEXT); INSERT INTO _test_marker VALUES ('env','test');",
	);
	marked = true;
	await assertMarker(state);
	for (const file of readdirSync("worker/migrations")
		.filter((file) => file.endsWith(".sql"))
		.sort()) {
		await executeLocalSql(state, readFileSync(`worker/migrations/${file}`, "utf8"));
	}
	log = openSync(`test-results/${tier}/server.log`, "w");
	server = Bun.spawn(
		["node", "node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(port)],
		{ env, stdout: log, stderr: log },
	);
	const started = Date.now();
	while (true) {
		if (server.exitCode !== null)
			throw new Error(readFileSync(`test-results/${tier}/server.log`, "utf8"));
		try {
			const response = await fetch(`${base}/api/session`, {
				headers: { "Cf-Access-Jwt-Assertion": env.LIFE_TEST_TOKEN },
				signal: AbortSignal.timeout(1000),
			});
			const body = (await response.json()) as { data?: { subject: string; mode: string } };
			if (
				response.ok &&
				body.data?.subject === "life-isolated-reader" &&
				body.data.mode === "access"
			)
				break;
		} catch {
			// Wait for this process's Worker and its isolated SQLite binding.
		}
		if (Date.now() - started > 45_000)
			throw new Error(`Local Worker did not become ready. See test-results/${tier}/server.log`);
		await Bun.sleep(200);
	}
	console.log(
		`${tier.toUpperCase()}: real Worker HTTP at ${base}; isolated SQLite + cache at ${state}`,
	);
	const command =
		tier === "l2"
			? ["bun", "tests/http/api.ts"]
			: ["node", "node_modules/@playwright/test/cli.js", "test"];
	const test = Bun.spawn(command, { env, stdout: "inherit", stderr: "inherit" });
	const code = await test.exited;
	if (code) throw new Error(`${tier.toUpperCase()} failed with exit ${code}`);
} finally {
	if (server) {
		server.kill("SIGTERM");
		await Promise.race([server.exited, Bun.sleep(5000)]);
		if (server.exitCode === null) {
			server.kill("SIGKILL");
			await server.exited;
		}
	}
	if (log !== undefined) closeSync(log);
	if (marked) {
		await assertMarker(state);
		rmSync(state, { recursive: true });
	}
}
