import type {
	GitHubCommit,
	GitHubIssue,
	GitHubPullRequest,
	GitHubRelease,
} from "../src/models/github";

// Synthetic fixture credentials, never accepted by GitHub.
export const githubFixtureKey = "life_fixture_github_credential";
export const githubFixtureAccount = { id: 7123, login: "life-fixture" };
export const githubFixtureCommitMessage = `feat: read GitHub activity\n\n${"Preserve the selected date and the full description.\n".repeat(100)}End of full commit message.`;
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
		body: "Keep all PR details in the activity dialog.",
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
export function githubIssue(id = 31, overrides: Partial<GitHubIssue> = {}): GitHubIssue {
	return {
		id,
		number: id,
		title: `Track daily activity ${id}`,
		body: "## Issue details\nKeep the complete issue description.",
		html_url: `https://github.com/life-fixture/app/issues/${id}`,
		user: githubFixtureAccount,
		state: "closed",
		created_at: "2026-09-10T01:20:00Z",
		updated_at: "2026-09-10T01:45:00Z",
		closed_at: "2026-09-10T01:45:00Z",
		...overrides,
	};
}
export function githubRelease(id = 41, overrides: Partial<GitHubRelease> = {}): GitHubRelease {
	return {
		id,
		html_url: `https://github.com/life-fixture/app/releases/tag/v2.0.${id}`,
		author: githubFixtureAccount,
		tag_name: `v2.0.${id}`,
		name: "Daily activity release",
		body: "## Release notes\nKeep every line of the release notes.",
		target_commitish: "main",
		draft: false,
		prerelease: false,
		published_at: "2026-09-10T02:40:00Z",
		...overrides,
	};
}
export function githubFixtureResponse(url: URL, authorization: string | null): Response {
	if (authorization !== `Bearer ${githubFixtureKey}`)
		return Response.json({ message: "invalid fixture credential" }, { status: 401 });
	if (url.pathname.endsWith("/user")) return Response.json(githubFixtureAccount);
	if (url.pathname.endsWith("/user/repos"))
		return Response.json([{ id: 1, full_name: "life-fixture/app" }]);
	if (url.pathname.endsWith("/repos/life-fixture/app/releases"))
		return Response.json([
			githubRelease(42, { author: { id: 99999, login: "github-actions[bot]" } }),
			githubRelease(),
		]);
	const q = url.searchParams.get("q") ?? "";
	const isDay = q.includes("2026-09-09T16:00:00Z..2026-09-10T15:59:59Z");
	const merged = githubPull(1, {
		state: "closed",
		closed_at: "2026-09-10T04:00:00Z",
		pull_request: { merged_at: "2026-09-10T04:00:00Z" },
	});
	const commit = githubCommit();
	commit.commit.message = githubFixtureCommitMessage;
	const items = !isDay
		? []
		: url.pathname.endsWith("/commits")
			? [commit]
			: q.includes("is:issue")
				? [githubIssue()]
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
