import { Collapsible, CollapsibleContent, CollapsibleTrigger, LayerCard } from "@nocoo/basalt";
import { ArrowUpRight, Monitor, Newspaper } from "lucide-react";
import { useState } from "react";
import type { StoryBranch } from "../viewmodels/day-story";
import { formatDurationMinutes, formatLocalClock } from "../viewmodels/format";
import { StoryCardInfo } from "./story-card-info";

export function SourceStoryCard({ branch }: { branch: StoryBranch }) {
	const [failedImage, setFailedImage] = useState<string | null>(null);
	const { computer, article } = branch;
	const event = branch.events[0];
	const Icon = computer ? Monitor : Newspaper;
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
						: ["来源：Firefly · lizheng.blog", "仅显示公开发表的文章，使用原始发表时间。"]
				}
			/>
			<div className="story-branch-eyebrow">
				<span className="story-card-icon" aria-hidden="true">
					<Icon size={17} strokeWidth={1.6} />
				</span>
				<span>{computer ? "电脑活动" : "发表文章"}</span>
				<time dateTime={event?.occurredAt} className="story-period">
					{computer ? branch.period : event ? formatLocalClock(event.occurredAt, "second") : null}
				</time>
			</div>
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
