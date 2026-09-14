import { Collapsible, CollapsibleContent, CollapsibleTrigger, LayerCard } from "@nocoo/basalt";
import {
	ArrowUpRight,
	GitCommitHorizontal,
	GitFork,
	GitMerge,
	GitPullRequest,
	GitPullRequestClosed,
	Monitor,
	Newspaper,
} from "lucide-react";
import { useState } from "react";
import { GITHUB_ACTION_LABELS, GITHUB_STATE_LABELS } from "../models/github";
import type { StoryBranch } from "../viewmodels/day-story";
import { formatDurationMinutes, formatLocalClock } from "../viewmodels/format";
import { StoryCardInfo } from "./story-card-info";

export function SourceStoryCard({ branch }: { branch: StoryBranch }) {
	const [failedImage, setFailedImage] = useState<string | null>(null);
	const { computer, article, github } = branch;
	const event = branch.events[0];
	const Icon = github ? GitFork : computer ? Monitor : Newspaper;
	const GitHubIcon =
		github?.action === "commit"
			? GitCommitHorizontal
			: github?.action === "merged"
				? GitMerge
				: github?.action === "closed"
					? GitPullRequestClosed
					: GitPullRequest;
	return (
		<LayerCard className={`story-branch story-${branch.kind}`} data-story-kind={branch.kind}>
			<StoryCardInfo
				label={branch.title}
				notes={
					computer
						? [
								"来源：Gecko",
								"按小时汇总，已排除闲置、锁屏和屏保；重叠的活跃时间只计一次。",
								`${computer.sessionCount} 段应用活动`,
							]
						: github
							? [
									`来源：GitHub · @${github.account.login}`,
									"Commit 使用作者时间，PR 使用创建、合并或关闭时间；PR 状态为首次查询时的快照。",
									"提交范围为 GitHub 搜索收录的默认分支。同一账号与日期的完整结果已保存，不自动刷新。",
								]
							: ["来源：Firefly · lizheng.blog", "仅显示公开发表的文章，使用原始发表时间。"]
				}
			/>
			<div className="story-branch-eyebrow">
				<span className="story-card-icon" aria-hidden="true">
					<Icon size={17} strokeWidth={1.6} />
				</span>
				<span>
					{computer
						? "电脑活动"
						: github
							? `GitHub · ${GITHUB_ACTION_LABELS[github.action]}`
							: "发表文章"}
				</span>
				<time dateTime={event?.occurredAt} className="story-period">
					{computer ? branch.period : event ? formatLocalClock(event.occurredAt, "second") : null}
				</time>
			</div>
			{github ? (
				<>
					<p className="story-github-repository">{github.repository}</p>
					<h3 className="story-branch-title">
						<a
							href={github.url}
							target="_blank"
							rel="noopener noreferrer"
							className="story-article-link"
						>
							{branch.title}
							<ArrowUpRight size={15} aria-hidden="true" />
						</a>
					</h3>
					<div className="story-github-meta">
						<GitHubIcon size={16} aria-hidden="true" />
						<span>{github.sha ? github.sha.slice(0, 7) : `#${github.number}`}</span>
						{github.state ? (
							<span className="github-state" data-state={github.state}>
								{GITHUB_STATE_LABELS[github.state]}
							</span>
						) : null}
					</div>
					{event?.content && event.content !== branch.title ? (
						<Collapsible className="story-event-details">
							<CollapsibleTrigger>提交说明</CollapsibleTrigger>
							<CollapsibleContent>
								<p className="story-article-excerpt whitespace-pre-wrap">{event.content}</p>
							</CollapsibleContent>
						</Collapsible>
					) : null}
				</>
			) : null}
			{computer ? (
				<>
					<h3 className="story-branch-title">
						活动{" "}
						{computer.activeSeconds < 60
							? `${computer.activeSeconds} 秒`
							: formatDurationMinutes(computer.activeSeconds / 60)}
					</h3>
					<ul className="story-app-list">
						{computer.apps.slice(0, 4).map((app) => (
							<li key={app.name}>
								<div>
									<strong>{app.name}</strong>
									<span>
										{app.seconds < 60
											? `${app.seconds} 秒`
											: formatDurationMinutes(app.seconds / 60)}
									</span>
								</div>
								{app.titles[0] ? <p>{app.titles[0]}</p> : null}
							</li>
						))}
					</ul>
					<Collapsible className="story-event-details">
						<CollapsibleTrigger>应用与窗口详情 · {computer.apps.length} 个应用</CollapsibleTrigger>
						<CollapsibleContent>
							<ul className="story-app-list">
								{computer.apps.map((app) => (
									<li key={app.name}>
										<strong>{app.name}</strong>
										{app.titles.map((title) => (
											<p key={title}>{title}</p>
										))}
									</li>
								))}
							</ul>
						</CollapsibleContent>
					</Collapsible>
				</>
			) : null}
			{article ? (
				<>
					{article.image && failedImage !== article.image ? (
						<img
							className="story-article-image"
							src={article.image}
							alt={`文章封面：${branch.title}`}
							loading="lazy"
							referrerPolicy="no-referrer"
							onError={() => setFailedImage(article.image)}
						/>
					) : null}
					<h3 className="story-branch-title">
						<a
							href={article.url}
							target="_blank"
							rel="noopener noreferrer"
							className="story-article-link"
						>
							{branch.title}
							<ArrowUpRight size={15} aria-hidden="true" />
						</a>
					</h3>
					{event?.content ? <p className="story-article-excerpt">{event.content}</p> : null}
					{article.author ? <p className="story-article-author">{article.author}</p> : null}
				</>
			) : null}
		</LayerCard>
	);
}
