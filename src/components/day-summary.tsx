import {
	Button,
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	Field,
	LayerCard,
	Text,
} from "@nocoo/basalt";
import { Banner } from "@nocoo/basalt/components/banner";
import { GitFork, Monitor, NotebookPen, Sparkles } from "lucide-react";
import { useNavigate } from "react-router";
import { useStore } from "zustand";
import type { DaySummaryQuery } from "../models/ai";
import {
	daySummaryStore,
	sameSummaryQuery,
	splitSummaryParagraphs,
} from "../viewmodels/day-summary-view-model";
import { formatAbsoluteTime } from "../viewmodels/format";
import { DiarySkeleton } from "./page-skeletons";
import { StoryCardHeading } from "./story-card-heading";
import { StoryCardInfo } from "./story-card-info";

const SECTIONS = [
	{
		key: "development",
		title: "开发信息",
		icon: Monitor,
		className: "story-computer",
		note: "根据 Gecko 电脑前台活动分析主题，已过滤闲置。机器与 AI 活动不等于本人持续工作。",
	},
	{
		key: "writing",
		title: "文章创作",
		icon: NotebookPen,
		className: "story-article",
		note: "根据 Firefly 当天实际发表的文章理解创作主题；发表时间不代表开始或完成写作的时间。",
	},
	{
		key: "github",
		title: "GitHub 信息",
		icon: GitFork,
		className: "story-github",
		note: "根据当天 GitHub 仓库活动归纳。提交使用作者时间；合并、关闭和自动化操作不证明由本人执行或投入同等工时。",
	},
] as const;

export function DaySummaryCard({ query }: { query: DaySummaryQuery }) {
	const navigate = useNavigate();
	const activeQuery = useStore(daySummaryStore, (state) => state.query);
	const result = useStore(daySummaryStore, (state) => state.result);
	const configured = useStore(daySummaryStore, (state) => state.configured);
	const status = useStore(daySummaryStore, (state) => state.status);
	const generating = useStore(daySummaryStore, (state) => state.generating);
	const error = useStore(daySummaryStore, (state) => state.error);
	const expired = useStore(daySummaryStore, (state) => state.expired);
	const revisionOpen = useStore(daySummaryStore, (state) => state.revisionOpen);
	const revisionText = useStore(daySummaryStore, (state) => state.revisionText);
	const eventCount = result?.eventCount ?? 0;
	const summary = result?.summary ?? null;
	const paragraphs = summary ? splitSummaryParagraphs(summary.content) : [];
	const canGenerate = status === "ready" && configured && eventCount > 0 && !generating;
	const loading =
		!sameSummaryQuery(activeQuery, query) ||
		(!result && (status === "idle" || status === "loading"));

	return (
		<div className="story-diary">
			<LayerCard className="story-summary story-card">
				<StoryCardInfo
					label="当日日记"
					notes={[
						"以 GPS 和消费备注为生活主线，结合天气与健康；开发、文章和 GitHub 在下方单独分析。",
						"使用当天全部来源，不受时间线来源筛选影响。点击生成后保存，重新生成成功才会替换原文。",
						...(summary
							? [
									`生成：${summary.provider} · ${summary.model} · ${formatAbsoluteTime(summary.generatedAt)}`,
								]
							: []),
					]}
				/>
				<LayerCard.Header>
					<StoryCardHeading icon={Sparkles} title="当日日记" />
				</LayerCard.Header>
				<LayerCard.Body className="space-y-4">
					{loading ? (
						<DiarySkeleton />
					) : (
						<>
							{status === "error" ? (
								<Banner
									variant="error"
									title={expired ? "会话已过期" : "无法读取摘要"}
									description={expired ? "请重新登录后再试。" : (error ?? "请重试。")}
									action={
										expired ? (
											<Banner.Action onClick={() => window.location.reload()}>
												重新登录
											</Banner.Action>
										) : (
											<Banner.Action onClick={() => void daySummaryStore.getState().retry()}>
												重试
											</Banner.Action>
										)
									}
								/>
							) : null}
							{error && status !== "error" ? (
								<Banner variant="error" title="生成失败" description={error} />
							) : null}
							{result?.stale && summary ? (
								<Banner
									variant="alert"
									title="摘要可能过时"
									description="当天记录、通用设置或日记写法已更新。可以重新生成，失败时会保留上一份摘要。"
								/>
							) : null}
							{status === "ready" && !configured ? (
								<div className="story-summary-idle">
									<Text as="p" className="story-summary-title">
										尚未配置 AI
									</Text>
									<Text as="p" size="sm" tone="muted">
										默认 Workers AI 无需密钥。也可在设置里换用其他模型。
									</Text>
									<Button onClick={() => navigate("/settings/ai")}>打开 AI 设置</Button>
								</div>
							) : null}
							{status === "ready" && configured && eventCount === 0 ? (
								<div className="story-summary-idle">
									<Text as="p" className="story-summary-title">
										这一天没有记录
									</Text>
									<Text as="p" size="sm" tone="muted">
										没有事件时不能生成摘要。
									</Text>
								</div>
							) : null}
							{paragraphs.length > 0 ? (
								<div className="story-summary-body">
									{paragraphs.map((paragraph) => (
										<Text as="p" key={paragraph} className="story-summary-paragraph">
											{paragraph}
										</Text>
									))}
								</div>
							) : configured && eventCount > 0 && status === "ready" ? (
								<div className="story-summary-idle">
									<Text as="p" size="sm">
										把这些片刻写成这一天的日记。点击后生成并保存。
									</Text>
								</div>
							) : null}
							<div className="story-summary-actions">
								<Button
									variant="outline"
									size="sm"
									onClick={() => {
										if (summary) daySummaryStore.getState().openRevision();
										else void daySummaryStore.getState().generate();
									}}
									loading={generating}
									disabled={!canGenerate}
								>
									<Sparkles size={14} strokeWidth={1.6} aria-hidden="true" />
									{summary ? "再写一则" : "写日记"}
								</Button>
							</div>
							<Dialog
								open={revisionOpen}
								onOpenChange={(open) => {
									if (!open) daySummaryStore.getState().closeRevision();
								}}
							>
								<DialogContent>
									<DialogHeader>
										<DialogTitle>再写这一天</DialogTitle>
										<DialogDescription>
											可以留下修改意见。成功后会覆盖当前日记；失败则保留原文。
										</DialogDescription>
									</DialogHeader>
									<Field label="修改意见（可选）" htmlFor="diary-revision">
										<textarea
											id="diary-revision"
											className="min-h-24 w-full rounded-basalt-md border border-basalt-border bg-basalt-background px-3 py-2 text-sm"
											value={revisionText}
											onChange={(event) =>
												daySummaryStore.getState().setRevisionText(event.target.value)
											}
											maxLength={2000}
											placeholder="例如：少写步数，多写晚上在书店的事。"
										/>
									</Field>
									<div className="mt-4 flex justify-end gap-2">
										<Button
											variant="ghost"
											size="sm"
											onClick={() => daySummaryStore.getState().closeRevision()}
										>
											取消
										</Button>
										<Button
											size="sm"
											onClick={() => void daySummaryStore.getState().confirmRevision()}
											loading={generating}
										>
											生成
										</Button>
									</div>
								</DialogContent>
							</Dialog>
						</>
					)}
				</LayerCard.Body>
			</LayerCard>
			{!loading && summary?.sections
				? SECTIONS.map(({ key, title, icon, className, note }) => {
						const section = summary.sections?.[key];
						if (!section) return null;
						return (
							<Collapsible
								key={`${query.date}:${query.timeZone}:${summary.generatedAt}:${key}`}
								asChild
							>
								<LayerCard
									className={`story-card story-summary-section ${className}`}
									data-diary-section={key}
								>
									<StoryCardInfo label={title} notes={[note]} />
									<LayerCard.Header>
										<StoryCardHeading
											icon={icon}
											as="h3"
											title={<CollapsibleTrigger>{title}</CollapsibleTrigger>}
										/>
									</LayerCard.Header>
									<LayerCard.Body>
										<Text as="p" size="sm" className="story-summary-section-intro">
											{section.summary}
										</Text>
										<CollapsibleContent unstyled>
											<ul className="story-summary-highlights">
												{[...new Set(section.highlights)].map((highlight) => (
													<li key={highlight}>{highlight}</li>
												))}
											</ul>
										</CollapsibleContent>
									</LayerCard.Body>
								</LayerCard>
							</Collapsible>
						);
					})
				: null}
		</div>
	);
}
