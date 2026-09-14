import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
	DescriptionList,
	StatStrip,
	Text,
} from "@nocoo/basalt";
import { Banner } from "@nocoo/basalt/components/banner";
import { LayerCard } from "@nocoo/basalt/components/layer-card";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import { useEffect } from "react";
import { Link } from "react-router";
import { useStore } from "zustand";
import type { ProviderOverview } from "../models/data-management";
import {
	coverageCellLabel,
	dataOverviewStore,
	dataTargetLabel,
	groupCoverageMonths,
	storageLabel,
	timelineDayHref,
	utcDayKey,
} from "../viewmodels/data-overview-view-model";
import { formatAbsoluteTime, formatByteSize } from "../viewmodels/format";

function channelLabel(channel: ProviderOverview["lastImportChannel"]): string {
	if (channel === "web") {
		return "网页";
	}
	if (channel === "cli") {
		return "本机";
	}
	return "尚未导入";
}

function CoverageCalendar({ provider }: { provider: ProviderOverview }) {
	const months = groupCoverageMonths(provider.coverage);
	if (months.length === 0) {
		return (
			<Text as="p" size="sm" tone="muted">
				还没有可展示的覆盖日期。
			</Text>
		);
	}
	return (
		<Collapsible className="data-coverage-fold">
			<CollapsibleTrigger>{`查看 ${provider.name} 的 ${provider.coverageDays} 个 UTC 覆盖日`}</CollapsibleTrigger>
			<CollapsibleContent>
				<div className="data-coverage-months">
					{months.map((month) => (
						<section
							key={month.key}
							className="data-coverage-month"
							aria-label={`${provider.name} ${month.label} UTC 覆盖`}
						>
							<Text as="h3" size="sm" bold>
								{provider.name} {month.label}
							</Text>
							<div className="data-coverage-weekdays" aria-hidden="true">
								<span>一</span>
								<span>二</span>
								<span>三</span>
								<span>四</span>
								<span>五</span>
								<span>六</span>
								<span>日</span>
							</div>
							<div className="data-coverage-grid">
								{month.cells.map((cell) => {
									if (cell.utcDay === null) {
										return <span key={cell.key} className="data-coverage-cell data-coverage-pad" />;
									}
									const label = coverageCellLabel(cell.utcDay, cell.recordCount);
									return cell.filled ? (
										<Link
											key={cell.key}
											to={timelineDayHref(cell.utcDay)}
											className="data-coverage-cell data-coverage-filled"
											aria-label={label}
											title={label}
										>
											<span className="sr-only">{utcDayKey(cell.utcDay)}</span>
										</Link>
									) : (
										<span key={cell.key} className="data-coverage-cell" title={label}>
											<span className="sr-only">{label}</span>
										</span>
									);
								})}
							</div>
						</section>
					))}
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}

export function DataOverviewPage() {
	const overview = useStore(dataOverviewStore, (state) => state.overview);
	const target = useStore(dataOverviewStore, (state) => state.target);
	const status = useStore(dataOverviewStore, (state) => state.status);
	const error = useStore(dataOverviewStore, (state) => state.error);
	const expired = useStore(dataOverviewStore, (state) => state.expired);

	useEffect(() => {
		void dataOverviewStore.getState().load();
	}, []);

	return (
		<div className="data-page space-y-6">
			<PageHeader
				title="数据概览"
				description="各来源的覆盖、体量和最近导入。覆盖天数按 UTC 日，不是首尾之间的日历跨度。"
			/>
			{target ? (
				<Text as="p" size="sm" tone="muted">
					{dataTargetLabel(target)}
				</Text>
			) : null}
			{status === "loading" && !overview ? (
				<LayerCard>
					<LayerCard.Loading label="正在读取数据概览" />
				</LayerCard>
			) : null}
			{status === "error" ? (
				<Banner
					variant="error"
					title={expired ? "会话已过期" : "无法读取概览"}
					description={expired ? "请重新登录后再试。" : (error ?? "请重试。")}
					action={
						expired ? (
							<Banner.Action onClick={() => window.location.reload()}>重新登录</Banner.Action>
						) : (
							<Banner.Action onClick={() => void dataOverviewStore.getState().retry()}>
								重试
							</Banner.Action>
						)
					}
				/>
			) : null}
			{overview && overview.providers.length === 0 ? (
				<LayerCard>
					<LayerCard.Empty title="还没有导入数据" description="轨迹请到 Footprint 页导入 GPX。" />
				</LayerCard>
			) : null}
			{overview && overview.providers.length > 0 ? (
				<LayerCard className="data-compare-card">
					<LayerCard.Header>
						<Text as="h2" variant="heading" size="md">
							来源对照
						</Text>
					</LayerCard.Header>
					<LayerCard.Body>
						<table className="data-compare-table">
							<thead>
								<tr>
									<th scope="col">来源</th>
									<th scope="col">保存方式</th>
									<th scope="col">覆盖天数</th>
									<th scope="col">原始记录</th>
									<th scope="col">数据行</th>
									<th scope="col">正文大小</th>
									<th scope="col">最近导入</th>
									<th scope="col">最近内容变更</th>
								</tr>
							</thead>
							<tbody>
								{overview.providers.map((provider) => (
									<tr key={provider.id}>
										<th scope="row">{provider.name}</th>
										<td>{storageLabel(provider.storage)}</td>
										<td>{provider.coverageDays}</td>
										<td>{provider.recordCount}</td>
										<td>{provider.dataRows}</td>
										<td>{formatByteSize(provider.payloadBytes)}</td>
										<td>
											{provider.lastImportedAt
												? `${formatAbsoluteTime(provider.lastImportedAt)} · ${channelLabel(provider.lastImportChannel)}`
												: "尚未导入"}
										</td>
										<td>
											{provider.lastChangedAt
												? formatAbsoluteTime(provider.lastChangedAt)
												: "尚未变更"}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</LayerCard.Body>
				</LayerCard>
			) : null}
			{overview ? (
				<div className="data-provider-grid">
					{overview.providers.map((provider) => (
						<LayerCard key={provider.id} className="data-provider-card">
							<LayerCard.Header>
								<Text as="h2" variant="heading" size="md">
									{provider.name}
								</Text>
								<Text as="p" size="sm" tone="muted">
									{storageLabel(provider.storage)} · 覆盖按 UTC 日计
								</Text>
							</LayerCard.Header>
							<LayerCard.Body className="space-y-4">
								<StatStrip
									items={[
										{ label: "覆盖天数", value: String(provider.coverageDays) },
										{ label: "原始记录", value: String(provider.recordCount) },
										{ label: "数据行", value: String(provider.dataRows) },
										{ label: "正文大小", value: formatByteSize(provider.payloadBytes) },
									]}
								/>
								<DescriptionList columns={2}>
									<DescriptionList.Item term="时间范围">
										{provider.firstAt && provider.lastAt
											? `${formatAbsoluteTime(provider.firstAt)} — ${formatAbsoluteTime(provider.lastAt)}`
											: "暂无记录"}
									</DescriptionList.Item>
									<DescriptionList.Item term="最近导入">
										{provider.lastImportedAt
											? `${formatAbsoluteTime(provider.lastImportedAt)} · ${channelLabel(provider.lastImportChannel)}`
											: "尚未导入"}
									</DescriptionList.Item>
									<DescriptionList.Item term="最近内容变更">
										{provider.lastChangedAt
											? formatAbsoluteTime(provider.lastChangedAt)
											: "尚未变更"}
									</DescriptionList.Item>
								</DescriptionList>
								<CoverageCalendar provider={provider} />
							</LayerCard.Body>
						</LayerCard>
					))}
				</div>
			) : null}
		</div>
	);
}
