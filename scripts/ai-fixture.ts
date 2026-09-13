/** Loopback-only upstream for real Worker HTTP tests; never calls an external model. */
export function startAiFixture() {
	const apiKey = crypto.randomUUID();
	const requests: { model: string; input: string }[] = [];
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		async fetch(request) {
			const url = new URL(request.url);
			if (url.pathname === "/requests") return Response.json(requests);
			if (request.method !== "POST" || !["/v1/messages", "/v1/responses"].includes(url.pathname))
				return new Response(null, { status: 404 });
			if (
				request.headers.get("x-api-key") !== apiKey &&
				request.headers.get("Authorization") !== `Bearer ${apiKey}`
			)
				return Response.json(
					{ error: { message: "Fixture authentication failed" } },
					{ status: 401 },
				);
			const body = (await request.json()) as {
				model: string;
				messages?: unknown;
				input?: unknown;
				system?: unknown;
			};
			const input = JSON.stringify(body.messages ?? body.input ?? "");
			requests.push({ model: body.model, input: `${JSON.stringify(body.system ?? "")} ${input}` });
			if (body.model === "life-test-failure")
				return Response.json(
					{
						type: "error",
						error: { type: "overloaded_error", message: "Fixture upstream unavailable" },
					},
					{ status: 503 },
				);
			if (body.model === "life-test-slow") await Bun.sleep(800);
			const text =
				body.model === "life-test-empty"
					? ""
					: /收到|exactly: OK/.test(input)
						? "收到"
						: "今天记录了晨间阅读和步行，健康与收支数据已汇入实录。现有记录呈现了这一天的活动，未记录的时段保持留白。";
			if (url.pathname === "/v1/responses")
				return Response.json({
					id: "resp_life_fixture",
					object: "response",
					created_at: Math.floor(Date.now() / 1000),
					status: "completed",
					model: body.model,
					output: [
						{
							id: "msg_life_fixture",
							type: "message",
							role: "assistant",
							status: "completed",
							content: [{ type: "output_text", text, annotations: [] }],
						},
					],
					usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
				});
			return Response.json({
				id: "msg_life_fixture",
				type: "message",
				role: "assistant",
				model: body.model,
				content: [{ type: "text", text }],
				stop_reason: "end_turn",
				stop_sequence: null,
				usage: { input_tokens: 10, output_tokens: 20 },
			});
		},
	});
	return { url: `http://127.0.0.1:${server.port}/v1`, apiKey, stop: () => server.stop(true) };
}
