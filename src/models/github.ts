import { z } from "zod";
import type { DaySummaryQuery } from "./ai";
import type { LifeEvent } from "./types";

export const githubAccountSchema = z.object({
	id: z.number().int().positive().safe(),
	login: z.string().regex(/^[a-z\d][a-z\d-]{0,38}$/i),
});
export type GitHubAccount = z.infer<typeof githubAccountSchema>;

const instant = z.string().datetime({ offset: true });
const repositoryName = z
	.string()
	.regex(/^[a-z\d][a-z\d-]{0,38}\/(?!\.{1,2}$)[a-z\d_.-]+$/i)
	.max(240);
export const githubRepositorySchema = z.object({
	id: z.number().int().positive().safe(),
	full_name: repositoryName,
});
const githubUrl = z
	.string()
	.url()
	.refine((value) => {
		const url = new URL(value);
		return url.origin === "https://github.com" && !url.username && !url.password;
	});
export const githubCommitSchema = z.object({
	sha: z.string().regex(/^[a-f\d]{40,64}$/i),
	html_url: githubUrl,
	author: githubAccountSchema.nullable(),
	repository: z.object({ full_name: repositoryName }),
	commit: z.object({
		message: z.string().max(262144),
		author: z.object({ date: instant }),
	}),
});
export type GitHubCommit = z.infer<typeof githubCommitSchema>;
export const githubPullRequestSchema = z.object({
	id: z.number().int().positive().safe(),
	number: z.number().int().positive(),
	title: z.string().max(4096),
	body: z.string().max(262144).nullable().optional(),
	html_url: githubUrl,
	user: githubAccountSchema.nullable(),
	state: z.enum(["open", "closed"]),
	draft: z.boolean().optional(),
	created_at: instant,
	updated_at: instant,
	closed_at: instant.nullable(),
	pull_request: z.object({ merged_at: instant.nullable() }),
});
export type GitHubPullRequest = z.infer<typeof githubPullRequestSchema>;
export const githubIssueSchema = githubPullRequestSchema
	.omit({ draft: true, pull_request: true })
	.extend({ pull_request: z.never().optional() });
export type GitHubIssue = z.infer<typeof githubIssueSchema>;
export const githubReleaseSchema = z.object({
	id: z.number().int().positive().safe(),
	html_url: githubUrl,
	// Repository lists include automation accounts; only the verified PAT owner's ID is selected.
	author: githubAccountSchema.extend({ login: z.string().min(1).max(100) }).nullable(),
	tag_name: z.string().min(1).max(4096),
	name: z.string().max(4096).nullable(),
	body: z.string().max(262144).nullable().optional(),
	target_commitish: z.string().max(4096),
	draft: z.boolean(),
	prerelease: z.boolean(),
	published_at: instant.nullable(),
});
export type GitHubRelease = z.infer<typeof githubReleaseSchema>;
export interface RepositoryRelease {
	repository: string;
	release: GitHubRelease;
}

export const githubActivitySchema = z.object({
	type: z.literal("github-activity"),
	account: githubAccountSchema,
	repository: repositoryName,
	url: githubUrl,
	action: z.enum([
		"commit",
		"opened",
		"merged",
		"closed",
		"issue-opened",
		"issue-closed",
		"released",
	]),
	sha: z.string().optional(),
	number: z.number().int().positive().optional(),
	tag: z.string().optional(),
	target: z.string().optional(),
	state: z
		.enum([
			"open",
			"draft",
			"merged",
			"closed",
			"issue-open",
			"issue-closed",
			"released",
			"prerelease",
		])
		.optional(),
});
export type GitHubActivity = z.infer<typeof githubActivitySchema>;
export const GITHUB_ACTION_LABELS = {
	commit: "Commit",
	opened: "创建 PR",
	merged: "合并 PR",
	closed: "关闭 PR",
	"issue-opened": "创建 Issue",
	"issue-closed": "关闭 Issue",
	released: "发布 Release",
} as const;
export const GITHUB_STATE_LABELS = {
	open: "待合并",
	draft: "草稿",
	merged: "已合并",
	closed: "已关闭",
	"issue-open": "未关闭",
	"issue-closed": "已关闭",
	released: "正式版本",
	prerelease: "预发布",
} as const;

/** Use the recorded author/action instants, never a push time or a PR's later update time. */
export function githubDayEvents(
	account: GitHubAccount,
	commits: GitHubCommit[],
	pulls: GitHubPullRequest[],
	query: DaySummaryQuery,
	extra: { issues: GitHubIssue[]; releases: RepositoryRelease[] } = { issues: [], releases: [] },
): LifeEvent[] {
	const events = new Map<string, LifeEvent>();
	const start = Date.parse(query.start),
		end = Date.parse(query.end);
	const add = (id: string, at: string, title: string, content: string, data: GitHubActivity) => {
		const time = Date.parse(at);
		if (time < start || time >= end) return;
		const occurredAt = new Date(time).toISOString();
		events.set(id, {
			id,
			sourceId: "github",
			sourceName: "GitHub",
			sourceKind: "external",
			occurredAt,
			endAt: null,
			precision: "second",
			title,
			content,
			data,
			updatedAt: occurredAt,
		});
	};
	for (const commit of commits) {
		if (commit.author?.id !== account.id) continue;
		const message = commit.commit.message;
		add(
			`github:${account.id}:commit:${commit.repository.full_name}:${commit.sha}`,
			commit.commit.author.date,
			message.split("\n")[0]?.slice(0, 1000) || "Commit",
			message,
			{
				type: "github-activity",
				account,
				repository: commit.repository.full_name,
				url: commit.html_url,
				action: "commit",
				sha: commit.sha,
			},
		);
	}
	for (const pr of pulls) {
		if (pr.user?.id !== account.id) continue;
		const repository = new URL(pr.html_url).pathname.split("/").slice(1, 3).join("/");
		if (!repositoryName.safeParse(repository).success) continue;
		const mergedAt = pr.pull_request.merged_at;
		const data: GitHubActivity = {
			type: "github-activity",
			account,
			repository,
			url: pr.html_url,
			number: pr.number,
			action: "opened",
			state: mergedAt ? "merged" : pr.state === "closed" ? "closed" : pr.draft ? "draft" : "open",
		};
		add(`github:${account.id}:pr:${pr.id}:opened`, pr.created_at, pr.title, pr.body ?? "", data);
		if (mergedAt || pr.closed_at) {
			const action = mergedAt ? "merged" : "closed";
			add(
				`github:${account.id}:pr:${pr.id}:${action}`,
				(mergedAt ?? pr.closed_at) as string,
				pr.title,
				pr.body ?? "",
				{ ...data, action },
			);
		}
	}
	for (const issue of extra.issues) {
		if (issue.user?.id !== account.id) continue;
		const repository = new URL(issue.html_url).pathname.split("/").slice(1, 3).join("/");
		if (!repositoryName.safeParse(repository).success) continue;
		const data: GitHubActivity = {
			type: "github-activity",
			account,
			repository,
			url: issue.html_url,
			number: issue.number,
			action: "issue-opened",
			state: issue.state === "closed" ? "issue-closed" : "issue-open",
		};
		add(
			`github:${account.id}:issue:${issue.id}:opened`,
			issue.created_at,
			issue.title,
			issue.body ?? "",
			data,
		);
		if (issue.closed_at)
			add(
				`github:${account.id}:issue:${issue.id}:closed`,
				issue.closed_at,
				issue.title,
				issue.body ?? "",
				{ ...data, action: "issue-closed" },
			);
	}
	for (const { repository, release } of extra.releases) {
		if (
			release.author?.id !== account.id ||
			release.draft ||
			!release.published_at ||
			!repositoryName.safeParse(repository).success
		)
			continue;
		add(
			`github:${account.id}:release:${release.id}`,
			release.published_at,
			release.name || release.tag_name,
			release.body ?? "",
			{
				type: "github-activity",
				account,
				repository,
				url: release.html_url,
				action: "released",
				tag: release.tag_name,
				target: release.target_commitish,
				state: release.prerelease ? "prerelease" : "released",
			},
		);
	}
	return [...events.values()].sort(
		(a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id),
	);
}
