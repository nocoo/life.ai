import { z } from "zod";
import type { DaySummaryQuery } from "../src/models/ai.js";
import type { DaySourceStatus } from "../src/models/day-sources.js";
import {
	type GitHubAccount,
	githubAccountSchema,
	githubCommitSchema,
	githubDayEvents,
	githubIssueSchema,
	githubPullRequestSchema,
	githubReleaseSchema,
	githubRepositorySchema,
	type RepositoryRelease,
} from "../src/models/github.js";
import type { LifeEvent } from "../src/models/types.js";
import { decryptApiKey } from "./ai.js";
import { withD1Retry } from "./database.js";
import type { SettingsRow } from "./day-sources.js";
import { ApiError, type WorkerEnv } from "./types.js";
import { readJsonBody } from "./utils.js";

const GITHUB_ENDPOINT = "https://api.github.com";
const MAX_RESULTS = 1000;
const PAGE_SIZE = 100;

async function fetchGitHub(path: string, apiKey: string, signal: AbortSignal): Promise<unknown> {
	let response: Response;
	try {
		response = await fetch(`${GITHUB_ENDPOINT}${path}`, {
			redirect: "manual",
			signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
			headers: {
				Accept: "application/vnd.github+json",
				"User-Agent": "Life.ai",
				"X-GitHub-Api-Version": "2022-11-28",
				Authorization: `Bearer ${apiKey}`,
			},
		});
	} catch {
		throw new ApiError(502, "source_unavailable", "GitHub 暂时无法连接，请稍后重试。");
	}
	if (!response.ok) {
		await response.body?.cancel();
		throw new ApiError(
			502,
			"source_unavailable",
			response.status === 401 || response.status === 403
				? "GitHub 拒绝访问，请检查 PAT 的有效期、仓库权限或请求限额。"
				: response.status === 429
					? "GitHub 请求限额已用完，请稍后重试。"
					: `GitHub 暂时不可用（${response.status}），请稍后重试。`,
		);
	}
	try {
		return await readJsonBody(response, 4 * 1024 * 1024);
	} catch {
		throw new ApiError(502, "source_invalid_response", "GitHub 返回的数据格式无效或内容过大。");
	}
}

export async function fetchGitHubAccount(
	apiKey: string,
	signal: AbortSignal,
): Promise<GitHubAccount> {
	const parsed = githubAccountSchema.safeParse(await fetchGitHub("/user", apiKey, signal));
	if (!parsed.success)
		throw new ApiError(502, "source_invalid_response", "GitHub 返回的账号信息无效。");
	return parsed.data;
}

async function search<T>(
	kind: "commits" | "issues",
	filter: string,
	schema: z.ZodType<T>,
	key: (item: T) => string,
	apiKey: string,
	signal: AbortSignal,
): Promise<T[]> {
	const pageSchema = z.object({
		total_count: z.number().int().nonnegative(),
		incomplete_results: z.boolean(),
		items: z.array(schema).max(PAGE_SIZE),
	});
	const items = new Map<string, T>();
	let total: number | undefined;
	for (let page = 1; ; page++) {
		const params = new URLSearchParams({
			q: filter,
			per_page: String(PAGE_SIZE),
			page: String(page),
			sort: kind === "commits" ? "author-date" : "created",
			order: "asc",
		});
		const parsed = pageSchema.safeParse(
			await fetchGitHub(`/search/${kind}?${params}`, apiKey, signal),
		);
		if (!parsed.success)
			throw new ApiError(502, "source_invalid_response", "GitHub 返回的活动格式无效。");
		const data = parsed.data;
		if (
			data.incomplete_results ||
			data.total_count > MAX_RESULTS ||
			(total !== undefined && total !== data.total_count) ||
			data.items.length !==
				Math.min(PAGE_SIZE, Math.max(0, data.total_count - (page - 1) * PAGE_SIZE))
		)
			throw new ApiError(
				502,
				"source_incomplete",
				"GitHub 搜索结果不完整或超过 1,000 条，本次未缓存，请稍后重试。",
			);
		total = data.total_count;
		for (const item of data.items) {
			const id = key(item);
			if (items.has(id))
				throw new ApiError(
					502,
					"source_incomplete",
					"GitHub 分页结果正在变化，本次未缓存，请重试。",
				);
			items.set(id, item);
		}
		if (items.size === total) return [...items.values()];
	}
}

async function list<T extends { id: number }>(
	path: string,
	schema: z.ZodType<T>,
	apiKey: string,
	signal: AbortSignal,
	include: (item: T) => boolean = () => true,
): Promise<T[]> {
	const pageSchema = z.array(schema).max(PAGE_SIZE);
	const seen = new Set<number>();
	const items: T[] = [];
	const url = new URL(path, GITHUB_ENDPOINT);
	url.searchParams.set("per_page", String(PAGE_SIZE));
	for (let page = 1; ; page++) {
		url.searchParams.set("page", String(page));
		const parsed = pageSchema.safeParse(
			await fetchGitHub(`${url.pathname}${url.search}`, apiKey, signal),
		);
		if (!parsed.success)
			throw new ApiError(502, "source_invalid_response", "GitHub 返回的仓库或 Release 格式无效。");
		for (const item of parsed.data) {
			if (seen.has(item.id) || seen.size >= MAX_RESULTS)
				throw new ApiError(
					502,
					"source_incomplete",
					"GitHub 仓库或 Release 分页不完整，或超过 1,000 条，本次未缓存。",
				);
			seen.add(item.id);
			if (include(item)) items.push(item);
		}
		if (parsed.data.length < PAGE_SIZE) return items;
	}
}

export async function fetchGitHubDay(
	account: GitHubAccount,
	query: DaySummaryQuery,
	apiKey: string,
	signal: AbortSignal,
): Promise<LifeEvent[]> {
	const from = new Date(query.start).toISOString().replace(".000Z", "Z");
	const through = new Date(Date.parse(query.end) - 1000).toISOString().replace(".000Z", "Z");
	const range = `${from}..${through}`;
	// GitHub search is rate-limited: paginate sequentially, then persist only the complete day.
	const commits = await search(
		"commits",
		`author:${account.login} author-date:${range}`,
		githubCommitSchema,
		(item) => `${item.repository.full_name}:${item.sha}`,
		apiKey,
		signal,
	);
	const opened = await search(
		"issues",
		`is:pr author:${account.login} created:${range}`,
		githubPullRequestSchema,
		(item) => String(item.id),
		apiKey,
		signal,
	);
	const closed = await search(
		"issues",
		`is:pr author:${account.login} closed:${range}`,
		githubPullRequestSchema,
		(item) => String(item.id),
		apiKey,
		signal,
	);
	const openedIssues = await search(
		"issues",
		`is:issue author:${account.login} created:${range}`,
		githubIssueSchema,
		(item) => String(item.id),
		apiKey,
		signal,
	);
	const closedIssues = await search(
		"issues",
		`is:issue author:${account.login} closed:${range}`,
		githubIssueSchema,
		(item) => String(item.id),
		apiKey,
		signal,
	);
	// Releases have no global author/date search. Read all pages from accessible repositories;
	// recent user events alone cannot establish that an older day had no releases.
	const repositories = await list(
		"/user/repos?sort=full_name&direction=asc",
		githubRepositorySchema,
		apiKey,
		signal,
	);
	const releases: RepositoryRelease[] = [];
	for (let index = 0; index < repositories.length; index += 6) {
		const batch = await Promise.allSettled(
			repositories.slice(index, index + 6).map(async (repository) => {
				const selected = await list(
					`/repos/${repository.full_name}/releases`,
					githubReleaseSchema,
					apiKey,
					signal,
					(release) => {
						const at = Date.parse(release.published_at ?? "");
						return (
							release.author?.id === account.id &&
							!release.draft &&
							at >= Date.parse(query.start) &&
							at < Date.parse(query.end)
						);
					},
				);
				return selected.map((release) => ({ repository: repository.full_name, release }));
			}),
		);
		for (const result of batch) {
			if (result.status === "rejected") throw result.reason;
			releases.push(...result.value);
		}
	}
	return githubDayEvents(account, commits, [...opened, ...closed], query, {
		issues: [...openedIssues, ...closedIssues],
		releases,
	});
}

interface CacheRow {
	data_json: string | null;
}

/** Account identity and the validated local day are independent of PAT/settings versions. */
export async function readGitHubDay(
	env: WorkerEnv,
	row: SettingsRow,
	query: DaySummaryQuery,
	cachedOnly: boolean,
	signal: AbortSignal,
): Promise<{ events: LifeEvent[]; status: DaySourceStatus }> {
	if (!row.account_id || !row.account_login)
		throw new ApiError(503, "source_key_unavailable", "请在数据源设置中重新保存 GitHub PAT。");
	const bindings = [row.account_id, query.date, query.timeZone, query.start, query.end];
	const where = "account_id = ? AND date = ? AND timezone = ? AND start_at = ? AND end_at = ?";
	const readCache = () =>
		withD1Retry(() =>
			env.DB.prepare(`SELECT data_json FROM github_day_cache WHERE ${where}`)
				.bind(...bindings)
				.first<CacheRow>(),
		);
	const ready = (data: string) => ({
		events: JSON.parse(data) as LifeEvent[],
		status: { provider: "github", state: "ready", stale: false } satisfies DaySourceStatus,
	});
	const leaseToken = crypto.randomUUID();
	for (;;) {
		signal.throwIfAborted();
		const cached = await readCache();
		if (cached?.data_json !== null && cached?.data_json !== undefined)
			return ready(cached.data_json);
		if (cachedOnly)
			return { events: [], status: { provider: "github", state: "pending", stale: false } };
		const now = Date.now();
		const claimed = await withD1Retry(() =>
			env.DB.prepare(`INSERT INTO github_day_cache
			(account_id, date, timezone, start_at, end_at, lease_token, leased_until) VALUES (?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(account_id, date, timezone, start_at, end_at) DO UPDATE SET
			lease_token = excluded.lease_token, leased_until = excluded.leased_until
			WHERE github_day_cache.data_json IS NULL AND (github_day_cache.leased_until <= ? OR github_day_cache.lease_token = excluded.lease_token)
			RETURNING lease_token`)
				.bind(...bindings, leaseToken, now + 60000, now)
				.first(),
		);
		if (claimed) break;
		// Another Worker is loading this account/day. Wait for its D1 result without calling GitHub.
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	try {
		if (!row.encrypted_api_key || !env.AI_SETTINGS_KEY)
			throw new ApiError(
				503,
				"source_key_unavailable",
				"GitHub PAT 不可用，请在数据源设置中重新保存。",
			);
		let apiKey: string;
		try {
			apiKey = await decryptApiKey(row.encrypted_api_key, env.AI_SETTINGS_KEY);
		} catch {
			throw new ApiError(
				503,
				"source_key_unavailable",
				"GitHub PAT 不可用，请在数据源设置中重新保存。",
			);
		}
		const events = await fetchGitHubDay(
			{ id: row.account_id, login: row.account_login },
			query,
			apiKey,
			signal,
		);
		signal.throwIfAborted();
		const dataJson = JSON.stringify(events);
		if (new TextEncoder().encode(dataJson).byteLength > 1024 * 1024)
			throw new ApiError(502, "source_incomplete", "GitHub 当天记录超过保存上限，本次未缓存。");
		await withD1Retry(() =>
			env.DB.prepare(`UPDATE github_day_cache SET data_json = ?, fetched_at = ?, lease_token = NULL, leased_until = 0
			WHERE ${where} AND lease_token = ? AND EXISTS (SELECT 1 FROM day_source_settings
			WHERE provider = 'github' AND enabled = 1 AND account_id = ?)`)
				.bind(dataJson, Date.now(), ...bindings, leaseToken, row.account_id)
				.run(),
		);
		const saved = await readCache();
		if (saved?.data_json !== null && saved?.data_json !== undefined) return ready(saved.data_json);
		throw new ApiError(409, "source_changed", "GitHub 配置已改变，请重新读取当天。");
	} finally {
		await withD1Retry(() =>
			env.DB.prepare(
				`DELETE FROM github_day_cache WHERE ${where} AND data_json IS NULL AND lease_token = ?`,
			)
				.bind(...bindings, leaseToken)
				.run(),
		);
	}
}
