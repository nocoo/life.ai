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
import { Sparkles } from "lucide-react";
import { useNavigate } from "react-router";
import { useStore } from "zustand";
import type { DaySummaryQuery } from "../models/ai";
import {
	daySummaryStore,
	sameSummaryQuery,
	splitSummaryParagraphs,
} from "../viewmodels/day-summary-view-model";
import { formatAbsoluteTime } from "../viewmodels/format";
import { StoryCardHeading } from "./story-card-heading";

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
	if (!sameSummaryQuery(activeQuery, query)) {
		return (
			<LayerCard className="story-summary story-card">
				<LayerCard.Loading label="正在读取摘要" />
			</LayerCard>
		);
	}

	return (
		<LayerCard className="story-summary story-card">
			<LayerCard.Header>
				<StoryCardHeading
					icon={Sparkles}
					title="当日日记"
					subtitle="用当天全部来源写成故事，不受来源筛选影响。"
				/>
			</LayerCard.Header>
			<LayerCard.Body className="space-y-4">
				{status === "loading" && !result ? <LayerCard.Loading label="正在读取摘要" /> : null}
				{status === "error" ? (
					<Banner
						variant="error"
						title={expired ? "会话已过期" : "无法读取摘要"}
						description={expired ? "请重新登录后再试。" : (error ?? "请重试。")}
						action={
							expired ? (
								<Banner.Action onClick={() => window.location.reload()}>重新登录</Banner.Action>
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
				{summary ? (
					<Collapsible className="story-summary-meta">
						<CollapsibleTrigger>生成信息</CollapsibleTrigger>
						<CollapsibleContent>
							<Text as="p" size="xs" tone="muted">
								{summary.provider} · {summary.model} · {formatAbsoluteTime(summary.generatedAt)}
							</Text>
						</CollapsibleContent>
					</Collapsible>
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
								onChange={(event) => daySummaryStore.getState().setRevisionText(event.target.value)}
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
			</LayerCard.Body>
		</LayerCard>
	);
}
