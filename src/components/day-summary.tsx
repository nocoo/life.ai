import { Button, LayerCard, Text } from "@nocoo/basalt";
import { Banner } from "@nocoo/basalt/components/banner";
import { Empty } from "@nocoo/basalt/components/empty";
import { useNavigate } from "react-router";
import { useStore } from "zustand";
import type { DaySummaryQuery } from "../models/ai";
import {
	daySummaryStore,
	sameSummaryQuery,
	splitSummaryParagraphs,
} from "../viewmodels/day-summary-view-model";
import { formatAbsoluteTime } from "../viewmodels/format";

export function DaySummaryCard({ query }: { query: DaySummaryQuery }) {
	const navigate = useNavigate();
	const activeQuery = useStore(daySummaryStore, (state) => state.query);
	const result = useStore(daySummaryStore, (state) => state.result);
	const configured = useStore(daySummaryStore, (state) => state.configured);
	const status = useStore(daySummaryStore, (state) => state.status);
	const generating = useStore(daySummaryStore, (state) => state.generating);
	const error = useStore(daySummaryStore, (state) => state.error);
	const expired = useStore(daySummaryStore, (state) => state.expired);
	const eventCount = result?.eventCount ?? 0;
	const summary = result?.summary ?? null;
	const paragraphs = summary ? splitSummaryParagraphs(summary.content) : [];
	const canGenerate = status === "ready" && configured && eventCount > 0 && !generating;
	if (!sameSummaryQuery(activeQuery, query))
		return (
			<LayerCard>
				<LayerCard.Loading label="正在读取摘要" />
			</LayerCard>
		);

	return (
		<LayerCard>
			<LayerCard.Header>
				<Text as="h2" variant="heading" size="md">
					当日摘要
				</Text>
				<Text as="p" size="sm" tone="muted">
					使用当天全部来源生成，不受上方筛选影响。不会自动生成。
				</Text>
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
						description="当天记录已变化。可以重新生成，失败时会保留上一份摘要。"
					/>
				) : null}
				{status === "ready" && !configured ? (
					<Empty
						title="尚未配置 AI"
						description="默认 Workers AI 无需密钥。也可在设置里换用其他模型。"
						action={<Button onClick={() => navigate("/settings/ai")}>打开 AI 设置</Button>}
					/>
				) : null}
				{status === "ready" && configured && eventCount === 0 ? (
					<Empty title="这一天没有记录" description="没有事件时不能生成摘要。" />
				) : null}
				{paragraphs.length > 0 ? (
					<div className="space-y-3">
						{paragraphs.map((paragraph) => (
							<Text as="p" key={paragraph}>
								{paragraph}
							</Text>
						))}
						{summary ? (
							<Text as="p" size="xs" tone="muted">
								{summary.provider} · {summary.model} · {formatAbsoluteTime(summary.generatedAt)}
							</Text>
						) : null}
					</div>
				) : configured && eventCount > 0 && status === "ready" ? (
					<Empty title="还没有摘要" description="按一次生成，会保存成功的文本。" />
				) : null}
				<div className="flex flex-wrap gap-2">
					<Button
						onClick={() => void daySummaryStore.getState().generate()}
						loading={generating}
						disabled={!canGenerate}
					>
						{summary ? "重新生成" : "生成摘要"}
					</Button>
				</div>
			</LayerCard.Body>
		</LayerCard>
	);
}
