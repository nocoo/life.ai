import type { GitHubCommit, GitHubPullRequest } from "../src/models/github";

// Synthetic fixture credentials, never accepted by GitHub.
export const githubFixtureKey = "life_fixture_github_credential";
export const githubFixtureAccount = { id: 7123, login: "life-fixture" };
export const githubFixtureQuery = {
	date: "2026-09-10",
	timeZone: "Asia/Shanghai",
	start: "2026-09-09T16:00:00.000Z",
	end: "2026-09-10T16:00:00.000Z",
};
export function githubCommit(id = 1, date = "2026-09-10T01:02:03Z"): GitHubCommit {
	const sha = id.toString(16).padStart(40, "0");
	return {
		sha,
		html_url: `https://github.com/life-fixture/app/commit/${sha}`,
		author: githubFixtureAccount,
		repository: { full_name: "life-fixture/app" },
		commit: {
			message: "feat: read GitHub activity\n\nPreserve the selected date.",
			author: { date },
		},
	};
}
export function githubPull(id = 1, overrides: Partial<GitHubPullRequest> = {}): GitHubPullRequest {
	return {
		id,
		number: id,
		title: `GitHub daily activity ${id}`,
		html_url: `https://github.com/life-fixture/app/pull/${id}`,
		user: githubFixtureAccount,
		state: "open",
		draft: false,
		created_at: "2026-09-10T02:10:00Z",
		updated_at: "2026-09-10T05:00:00Z",
		closed_at: null,
		pull_request: { merged_at: null },
		...overrides,
	};
}
export function githubFixtureResponse(url: URL, authorization: string | null): Response {
	if (authorization !== `Bearer ${githubFixtureKey}`)
		return Response.json({ message: "invalid fixture credential" }, { status: 401 });
	if (url.pathname.endsWith("/user")) return Response.json(githubFixtureAccount);
	const q = url.searchParams.get("q") ?? "";
	const isDay = q.includes("2026-09-09T16:00:00Z..2026-09-10T15:59:59Z");
	const merged = githubPull(1, {
		state: "closed",
		closed_at: "2026-09-10T04:00:00Z",
		pull_request: { merged_at: "2026-09-10T04:00:00Z" },
	});
	const items = !isDay
		? []
		: url.pathname.endsWith("/commits")
			? [githubCommit()]
			: q.includes("created:")
				? [merged, githubPull(2, { draft: true })]
				: [
						merged,
						githubPull(3, {
							created_at: "2026-09-08T00:00:00Z",
							state: "closed",
							closed_at: "2026-09-10T05:00:00Z",
						}),
					];
	return Response.json({ total_count: items.length, incomplete_results: false, items });
}
