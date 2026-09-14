import { describe, expect, it } from "vitest";
import {
	githubActivitySchema,
	githubCommitSchema,
	githubDayEvents,
	githubPullRequestSchema,
} from "../../../src/models/github";
import { formatDaySourceEvidence } from "../../../worker/diary-evidence";
import {
	githubFixtureAccount as account,
	githubCommit,
	githubPull,
	githubFixtureQuery as query,
} from "../../github-fixture";

describe("GitHub daily events", () => {
	it("clips to the local day, preserves author instants and deduplicates by repository and commit SHA", () => {
		const a = githubCommit(1, query.start);
		const b = {
			...githubCommit(2, "2026-09-10T08:12:13+08:00"),
			commit: { message: "", author: { date: "2026-09-10T08:12:13+08:00" } },
		};
		const events = githubDayEvents(
			account,
			[
				a,
				a,
				b,
				githubCommit(3, query.end),
				githubCommit(4, "2026-09-09T15:59:59Z"),
				{ ...githubCommit(5), author: null },
				{ ...githubCommit(6), author: { ...account, id: 999 } },
				{ ...a, repository: { full_name: "life-fixture/fork" } },
			],
			[],
			query,
		);
		expect(events).toHaveLength(3);
		expect(events[0]?.occurredAt).toBe(query.start);
		expect(events.at(-1)).toMatchObject({
			title: "Commit",
			occurredAt: "2026-09-10T00:12:13.000Z",
			precision: "second",
			sourceId: "github",
		});
		expect(new Set(events.map((event) => event.id)).size).toBe(3);
	});
	it("shows distinct PR actions without mistaking later edits for activity or another user's PR for this account", () => {
		const merged = githubPull(1, {
			state: "closed",
			closed_at: "2026-09-10T04:00:00Z",
			pull_request: { merged_at: "2026-09-10T04:00:00Z" },
		});
		const events = githubDayEvents(
			account,
			[],
			[
				merged,
				merged,
				githubPull(2, { draft: true }),
				githubPull(3),
				githubPull(4, {
					created_at: "2026-09-08T00:00:00Z",
					closed_at: "2026-09-10T05:00:00Z",
					state: "closed",
				}),
				githubPull(5, { created_at: "2026-09-08T00:00:00Z" }),
				githubPull(6, { user: null }),
				githubPull(7, { user: { ...account, id: 999 } }),
				githubPull(8, { html_url: "https://github.com/" }),
			],
			query,
		);
		expect(events).toHaveLength(5);
		const data = events.map((event) => githubActivitySchema.parse(event.data));
		expect(data.filter((item) => item.action === "opened")).toHaveLength(3);
		expect(data.find((item) => item.number === 1)).toMatchObject({
			state: "merged",
			repository: "life-fixture/app",
		});
		expect(data.find((item) => item.number === 2)?.state).toBe("draft");
		expect(data.find((item) => item.number === 3)?.state).toBe("open");
		expect(data.find((item) => item.number === 4)?.action).toBe("closed");
	});
	it("uses a DST day's real UTC window and rejects credential-bearing links and malformed instants", () => {
		const dst = {
			date: "2026-11-01",
			timeZone: "America/New_York",
			start: "2026-11-01T04:00:00.000Z",
			end: "2026-11-02T05:00:00.000Z",
		};
		const events = githubDayEvents(
			account,
			[
				githubCommit(1, dst.start),
				githubCommit(2, "2026-11-02T04:59:59Z"),
				githubCommit(3, dst.end),
			],
			[],
			dst,
		);
		expect(events).toHaveLength(2);
		for (const url of [
			"javascript:alert(1)",
			"https://user:secret@github.com/a/b",
			"http://github.com/a/b",
			"https://github.com.evil.test/a/b",
		])
			expect(githubCommitSchema.safeParse({ ...githubCommit(), html_url: url }).success).toBe(
				false,
			);
		expect(
			githubPullRequestSchema.safeParse({ ...githubPull(), created_at: "2026-09-10" }).success,
		).toBe(false);
	});
	it("feeds repository, action and time to diary evidence without asserting work duration or merger identity", () => {
		const events = githubDayEvents(account, [githubCommit()], [githubPull()], query);
		const text = formatDaySourceEvidence(events, "Asia/Shanghai").join("\n");
		expect(text).toContain("09:02:03");
		expect(text).toContain("life-fixture/app");
		expect(text).toContain("创建 PR");
		expect(text).toContain("合并或关闭不证明由本人操作");
	});
});
