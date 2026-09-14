import type { Plugin } from "vite";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Test-only upstream substitution; production Worker logic and D1 remain real. */
export function isolatedPublicContext(origin: string): Plugin {
	if (new URL(origin).hostname !== "127.0.0.1")
		throw new Error("Public API fixture must be loopback");
	return {
		name: "life-isolated-public-context",
		enforce: "pre",
		transform(code, id) {
			if (id.split("?")[0]?.endsWith("/worker/day-sources.ts")) {
				for (const [upstream, path] of [
					["https://gecko.hexly.ai/api/v1/snapshot", "/gecko"],
					["https://lizheng.blog/api/posts", "/firefly"],
				]) {
					if (!code.includes(upstream as string))
						throw new Error(`Missing isolated upstream: ${path}`);
					code = code.replaceAll(upstream as string, `${origin}${path}`);
				}
				return { code, map: null };
			}
			if (id.split("?")[0]?.endsWith("/worker/index.ts")) {
				return {
					code: code.replace(
						"return errorResponse(err);",
						"console.error(err); return errorResponse(err);",
					),
					map: null,
				};
			}
			if (!id.split("?")[0]?.endsWith("/worker/public-context.ts")) return;
			for (const [upstream, path] of [
				["https://api.sunrise-sunset.org/v2", "/sun"],
				["https://archive-api.open-meteo.com/v1/archive", "/archive"],
				["https://api.open-meteo.com/v1/forecast", "/weather"],
				["https://nominatim.openstreetmap.org/reverse", "/place"],
			] as const) {
				if (!code.includes(upstream)) throw new Error(`Missing isolated upstream: ${path}`);
				code = code.replaceAll(upstream, `${origin}${path}`);
			}
			return { code, map: null };
		},
	};
}

export function startPublicContextFixture() {
	const requests: { path: string; query: string }[] = [];
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		fetch(request) {
			const url = new URL(request.url);
			if (url.pathname === "/requests") return Response.json(requests);
			requests.push({ path: url.pathname, query: url.search });
			if (url.pathname === "/gecko") {
				if (request.headers.get("Authorization") !== `Bearer gk_${"a".repeat(64)}`)
					return Response.json({ error: "invalid fixture key" }, { status: 401 });
				const date = url.searchParams.get("date");
				const at = Date.parse(`${date}T01:50:00Z`) / 1000;
				return Response.json({
					date,
					timezone: "Asia/Shanghai",
					stats: {
						sessions: [
							{
								id: `${date}-editor`,
								appName: "Editor",
								bundleId: "test.editor",
								windowTitle: "Life.ai 出行记录",
								startTime: at,
								duration: 1200,
							},
							{
								id: `${date}-browser`,
								appName: "Browser",
								bundleId: "test.browser",
								windowTitle: "文章资料",
								startTime: at + 300,
								duration: 300,
							},
							{
								id: `${date}-idle`,
								appName: "loginwindow",
								bundleId: "com.apple.loginwindow",
								windowTitle: "idle",
								startTime: at + 4200,
								duration: 3600,
							},
						],
					},
				});
			}
			if (url.pathname === "/firefly") {
				if (request.headers.has("Authorization"))
					return Response.json(
						{ error: "public endpoint must not receive secrets" },
						{ status: 400 },
					);
				const posts = [11, 10].map((day) => ({
					id: `fixture-article-${day}`,
					title: "记录一段通勤",
					slug: `commute-${day}`,
					status: "published",
					published_at: Date.parse(`2026-09-${day}T02:23:45Z`) / 1000,
					updated_at: Date.parse("2026-09-14T00:00:00Z") / 1000,
					excerpt: "从行迹理解一天。",
					human_name: "测试作者",
					agent_name: null,
					featured_image: "https://lizheng.blog/fixture-cover.svg",
				}));
				const page = Number(url.searchParams.get("page"));
				return Response.json({
					posts: posts.slice((page - 1) * 20, page * 20),
					total: posts.length,
				});
			}
			if (url.pathname === "/sun") {
				const start = Date.parse(url.searchParams.get("date_start") ?? "");
				const end = Date.parse(url.searchParams.get("date_end") ?? "");
				return Response.json({
					days: Array.from({ length: (end - start) / DAY + 1 }, (_, i) => {
						const at = start + i * DAY;
						return {
							date: new Date(at).toISOString().slice(0, 10),
							sunrise: (at - 2.5 * HOUR) / 1000,
							sunset: (at + 10.25 * HOUR) / 1000,
							sun_status: "normal",
						};
					}),
				});
			}
			if (url.pathname === "/weather" || url.pathname === "/archive") {
				const start = Date.parse(url.searchParams.get("start_date") ?? "");
				const end = Date.parse(url.searchParams.get("end_date") ?? "") + DAY;
				const time = Array.from(
					{ length: (end - start) / HOUR },
					(_, i) => (start + i * HOUR) / 1000,
				);
				return Response.json({
					hourly: {
						time,
						temperature_2m: time.map((_, i) => 15 + (i % 10)),
						weather_code: time.map(() => 1),
						precipitation: time.map(() => 0.1),
						wind_speed_10m: time.map(() => 12),
					},
				});
			}
			if (url.pathname === "/place")
				return Response.json({ address: { city: "测试城市", suburb: "河畔区域" } });
			return new Response(null, { status: 404 });
		},
	});
	return { url: `http://127.0.0.1:${server.port}`, stop: () => server.stop(true) };
}
