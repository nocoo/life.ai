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
	.regex(/^[a-z\d_.-]+\/[a-z\d_.-]+$/i)
	.max(240);
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

export const githubActivitySchema = z.object({
	type: z.literal("github-activity"),
	account: githubAccountSchema,
	repository: repositoryName,
	url: githubUrl,
	action: z.enum(["commit", "opened", "merged", "closed"]),
	sha: z.string().optional(),
	number: z.number().int().positive().optional(),
	state: z.enum(["open", "draft", "merged", "closed"]).optional(),
});
export type GitHubActivity = z.infer<typeof githubActivitySchema>;
export const GITHUB_ACTION_LABELS = {
	commit: "Commit",
	opened: "创建 PR",
	merged: "合并 PR",
	closed: "关闭 PR",
} as const;
export const GITHUB_STATE_LABELS = {
	open: "待合并",
	draft: "草稿",
	merged: "已合并",
	closed: "已关闭",
} as const;

/** Use the recorded author/action instants, never a push time or a PR's later update time. */
export function githubDayEvents(
	account: GitHubAccount,
	commits: GitHubCommit[],
	pulls: GitHubPullRequest[],
	query: DaySummaryQuery,
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
		const message = commit.commit.message.trim();
		add(
			`github:${account.id}:commit:${commit.repository.full_name}:${commit.sha}`,
			commit.commit.author.date,
			message.split("\n")[0]?.slice(0, 1000) || "Commit",
			message.slice(0, 4000),
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
		add(`github:${account.id}:pr:${pr.id}:opened`, pr.created_at, pr.title, "", data);
		if (mergedAt || pr.closed_at) {
			const action = mergedAt ? "merged" : "closed";
			add(
				`github:${account.id}:pr:${pr.id}:${action}`,
				(mergedAt ?? pr.closed_at) as string,
				pr.title,
				"",
				{ ...data, action },
			);
		}
	}
	return [...events.values()].sort(
		(a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id),
	);
}
