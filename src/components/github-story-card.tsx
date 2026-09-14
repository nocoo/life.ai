import {
	Button,
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
	LayerCard,
} from "@nocoo/basalt";
import {
	ArrowUpRight,
	CircleCheck,
	CircleDot,
	GitCommitHorizontal,
	GitFork,
	GitMerge,
	GitPullRequest,
	GitPullRequestClosed,
	Tag,
	X,
} from "lucide-react";
import { GITHUB_ACTION_LABELS, GITHUB_STATE_LABELS } from "../models/github";
import type { StoryBranch } from "../viewmodels/day-story";
import { formatLocalClock } from "../viewmodels/format";
import { StoryMetrics } from "./day-insights";
import { StoryCardInfo } from "./story-card-info";

const ACTION_ICONS = {
	commit: GitCommitHorizontal,
	opened: GitPullRequest,
	merged: GitMerge,
	closed: GitPullRequestClosed,
	"issue-opened": CircleDot,
	"issue-closed": CircleCheck,
	released: Tag,
};

export function GitHubStoryCard({ branch }: { branch: StoryBranch }) {
	return (
		<Dialog>
			<LayerCard className="story-branch story-github" data-story-kind="github">
				<StoryCardInfo
					label="GitHub"
					notes={[
						"同一时间段的 GitHub 记录合并展示。PR、Issue 按仓库和编号去重计数，详情保留每次动作。",
						"Commit 使用作者时间，PR、Issue 使用创建或关闭时间，Release 使用发布时间。状态与说明来自首次查询时的快照。",
						"Release 来自该账号当前有访问权限的自有、协作及组织仓库，仅包含该账号署名的已发布版本。",
						"同一账号当天首次查询的结果会保留，不自动刷新。旧缓存可能尚无 Issue、Release 或完整说明，可在右上角缓存管理中清除后重新查询。",
					]}
				/>
				<div className="story-branch-eyebrow">
					<span className="story-card-icon" aria-hidden="true">
						<GitFork size={17} strokeWidth={1.6} />
					</span>
					<span>GitHub</span>
					<span className="story-period">{branch.period}</span>
				</div>
				<h3 className="story-branch-title">{branch.title}</h3>
				<StoryMetrics items={branch.metrics} />
				<DialogTrigger asChild>
					<Button variant="outline" size="sm" className="mt-4">
						查看详情 <ArrowUpRight size={14} aria-hidden="true" />
					</Button>
				</DialogTrigger>
			</LayerCard>
			<DialogContent size="xl" className="github-detail-dialog story-github">
				<DialogClose asChild>
					<Button
						variant="ghost"
						size="icon"
						className="absolute right-3 top-3"
						aria-label="关闭 GitHub 详情"
					>
						<X size={18} aria-hidden="true" />
					</Button>
				</DialogClose>
				<DialogHeader className="pr-8">
					<DialogTitle>GitHub · {branch.period ?? "全天"}</DialogTitle>
					<DialogDescription>{branch.title}，按发生时间排列。</DialogDescription>
				</DialogHeader>
				<ol className="github-detail-records">
					{branch.github?.map(({ event, activity }) => {
						const Icon = ACTION_ICONS[activity.action];
						return (
							<li key={event.id} className="github-detail-record">
								<div className="github-detail-eyebrow">
									<span>
										<Icon size={16} aria-hidden="true" />
										{GITHUB_ACTION_LABELS[activity.action]}
									</span>
									<time dateTime={event.occurredAt}>
										{formatLocalClock(event.occurredAt, event.precision)}
									</time>
								</div>
								<p className="story-github-repository">
									{activity.repository} · @{activity.account.login}
								</p>
								<h3 className="story-branch-title">
									<a
										href={activity.url}
										target="_blank"
										rel="noopener noreferrer"
										className="story-article-link"
									>
										{event.title}
										<ArrowUpRight size={15} aria-hidden="true" />
									</a>
								</h3>
								<div className="story-github-meta">
									{activity.sha ? (
										<code className="break-all">{activity.sha}</code>
									) : activity.number ? (
										<span>#{activity.number}</span>
									) : null}
									{activity.tag ? <code className="break-all">{activity.tag}</code> : null}
									{activity.target ? <span>目标：{activity.target}</span> : null}
									{activity.state ? (
										<span className="github-state" data-state={activity.state}>
											{GITHUB_STATE_LABELS[activity.state]}
										</span>
									) : null}
								</div>
								{event.content ? <p className="github-detail-body">{event.content}</p> : null}
							</li>
						);
					})}
				</ol>
			</DialogContent>
		</Dialog>
	);
}
