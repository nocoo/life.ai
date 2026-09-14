import { describe, expect, it } from "vitest";
import {
	githubActivitySchema,
	githubCommitSchema,
	githubDayEvents,
	githubIssueSchema,
	githubPullRequestSchema,
	githubReleaseSchema,
} from "../../../src/models/github";
import { formatDaySourceEvidence } from "../../../worker/diary-evidence";
import {
	githubFixtureAccount as account,
	githubCommit,
	githubIssue,
	githubPull,
	githubRelease,
	githubFixtureQuery as query,
} from "../../github-fixture";

describe("GitHub daily events", () => {
	it("retains distinct Issue actions and full published Release notes, including historical dates", () => {
		const issue = githubIssue();
		const release = githubRelease(41, {
			body: `## Notes\n${"Full release details.\n".repeat(400)}Final note.`,
		});
		const repository = "life-fixture/app";
		const events = githubDayEvents(account, [], [], query, {
			issues: [
				issue,
				issue,
				githubIssue(32, { state: "open", closed_at: null, body: null }),
				githubIssue(33, { created_at: "2020-01-01T00:00:00Z", body: null }),
				githubIssue(34, { user: null }),
				githubIssue(35, { user: { id: 1, login: "other" } }),
				githubIssue(36, { html_url: "https://github.com/" }),
			],
			releases: [
				release,
				release,
				githubRelease(42, { name: null, body: null, prerelease: true }),
				githubRelease(43, { author: null }),
				githubRelease(44, { draft: true }),
				githubRelease(45, { published_at: null }),
				githubRelease(46, { published_at: query.end }),
			]
				.map((item) => ({ repository, release: item }))
				.concat([{ repository: "invalid", release }]),
		});
		expect(events).toHaveLength(6);
		const records = events.map((event) => ({
			...event,
			data: githubActivitySchema.parse(event.data),
		}));
		expect(records.filter((event) => event.data.action === "issue-opened")).toHaveLength(2);
		expect(records.filter((event) => event.data.action === "issue-closed")).toHaveLength(2);
		expect(records.find((event) => event.data.number === 31)?.content).toBe(issue.body);
		expect(records.find((event) => event.data.number === 32)?.data.state).toBe("issue-open");
		expect(records.find((event) => event.data.tag === "v2.0.41")).toMatchObject({
			content: release.body,
			data: { state: "released", target: "main" },
		});
		expect(records.find((event) => event.data.tag === "v2.0.42")).toMatchObject({
			title: "v2.0.42",
			content: "",
			data: { state: "prerelease" },
		});
		expect(githubIssueSchema.safeParse(githubPull()).success).toBe(false);
		expect(
			githubReleaseSchema.safeParse(
				githubRelease(99, { author: { id: 999, login: "github-actions[bot]" } }),
			).success,
		).toBe(true);
		expect(
			githubReleaseSchema.safeParse({ ...release, html_url: "https://user:secret@github.com/a/b" })
				.success,
		).toBe(false);
		const evidence = formatDaySourceEvidence(events, query.timeZone).join("\n");
		expect(evidence).toContain('"创建 Issue":2');
		expect(evidence).toContain('"发布 Release":2');
	});
	it("retains complete commit messages and PR descriptions beyond the old preview limit", () => {
		const message = `feat: preserve details\n\n${"commit details\n".repeat(500)}complete ending\n`;
		const body = `## Changes\n${"PR explanation\n".repeat(400)}final PR note`;
		const commit = githubCommit();
		commit.commit.message = message;
		const events = githubDayEvents(account, [commit], [githubPull(1, { body })], query);
		expect(events.map((event) => event.content)).toEqual([message, body]);
		expect(events[0]?.title).toBe("feat: preserve details");
	});
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

	it("reduces busy repositories to counts and representative records while retaining rare PR signals", () => {
		const commits = Array.from({ length: 600 }, (_, index) => ({
			...githubCommit(index + 1, new Date(Date.parse(query.start) + index * 60_000).toISOString()),
			commit: {
				message: `自动提交 ${index}`,
				author: { date: new Date(Date.parse(query.start) + index * 60_000).toISOString() },
			},
		}));
		const events = githubDayEvents(
			account,
			commits,
			[githubPull(1, { title: "少量但重要的 PR", created_at: "2026-09-10T00:10:00Z" })],
			query,
		);
		const original = JSON.stringify(events);
		const text = formatDaySourceEvidence(events, query.timeZone).join("\n");
		expect(text).toContain("601 条活动");
		expect(text).toContain('"Commit":600');
		expect(text).toContain("少量但重要的 PR");
		expect(text).toContain("自动提交 0");
		expect(text).toContain("自动提交 599");
		expect(text.length).toBeLessThan(2_000);
		expect(JSON.stringify(events)).toBe(original);
	});

	it("bounds the auxiliary evidence even across hundreds of repositories and declares omitted coverage", () => {
		const commits = Array.from({ length: 200 }, (_, index) => ({
			...githubCommit(index + 1),
			repository: { full_name: `life-fixture/project-${index}` },
		}));
		const text = formatDaySourceEvidence(
			githubDayEvents(account, commits, [], query),
			query.timeZone,
		).join("\n");
		expect(text).toContain("200 个仓库");
		expect(text).toContain("未展示不代表没有活动");
		expect(text.length).toBeLessThan(13_000);
		expect(formatDaySourceEvidence([], query.timeZone)).toEqual([]);
	});
});
