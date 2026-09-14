import {
	Button,
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
	DescriptionList,
	StatStrip,
	Text,
} from "@nocoo/basalt";
import {
	ANIMATION_PROPS,
	AXIS_CONFIG,
	BAR_RADIUS,
	chartTooltipProps,
	GRID_PROPS,
	getChartColor,
} from "@nocoo/basalt/charts/config";
import { ChartFrame } from "@nocoo/basalt/charts/frame";
import { ChartLegend } from "@nocoo/basalt/charts/legend";
import { ChartTooltipContent } from "@nocoo/basalt/charts/tooltip";
import { Banner } from "@nocoo/basalt/components/banner";
import { LayerCard } from "@nocoo/basalt/components/layer-card";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import { ScrollArea } from "@nocoo/basalt/components/scroll-area";
import { SectionRule } from "@nocoo/basalt/components/section-rule";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@nocoo/basalt/components/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@nocoo/basalt/components/table";
import { RefreshCw, Upload } from "lucide-react";
import { useEffect, useMemo } from "react";
import { Link } from "react-router";
import { Bar, BarChart, CartesianGrid, LabelList, Tooltip, XAxis, YAxis } from "recharts";
import { useStore } from "zustand";
import type { ProviderOverview } from "../models/data-management";
import {
	compareProviders,
	coverageCellLabel,
	dataOverviewStore,
	dataTargetLabel,
	formatOverviewMetric,
	groupCoverageMonths,
	importChannelLabel,
	monthlyRecordCounts,
	OVERVIEW_METRICS,
	type OverviewMetric,
	storageLabel,
	summarizeProviders,
	timelineDayHref,
	utcDayKey,
} from "../viewmodels/data-overview-view-model";
import { formatAbsoluteTime } from "../viewmodels/format";
import "./data-overview.css";

function MonthlyRecords({ providers }: { providers: ProviderOverview[] }) {
	const history = useMemo(() => monthlyRecordCounts(providers), [providers]);
	if (history.data.length === 0) return null;
	const color = getChartColor(0);
	const formatRecords = (value: number) => formatOverviewMetric(value, "recordCount");
	return (
		<LayerCard>
			<LayerCard.Header>
				<div className="space-y-1">
					<Text as="h2" variant="heading" size="md">
						按月记录量
					</Text>
					<Text as="p" size="sm" tone="muted">
						按 UTC 月汇总每日记录，首尾之间没有记录的月份为 0。Footprint 的一个 GPS 点计为一条记录。
					</Text>
				</div>
			</LayerCard.Header>
			<LayerCard.Body className="space-y-3">
				<ScrollArea
					className="data-overview-history-scroll"
					orientation="horizontal"
					type="auto"
					viewportClassName="overscroll-x-contain"
					aria-label="按月记录量，可横向滚动查看月份"
				>
					<div style={{ minWidth: history.data.length * 12 + 72 }}>
						<ChartFrame
							ariaLabel="每月记录量（UTC）"
							size="data-overview-history-plot"
							summary={<span className="sr-only">{history.summary}</span>}
						>
							<BarChart data={history.data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
								<CartesianGrid {...GRID_PROPS} />
								<XAxis
									{...AXIS_CONFIG}
									dataKey="month"
									minTickGap={24}
									interval="preserveStartEnd"
								/>
								<YAxis
									{...AXIS_CONFIG}
									width={72}
									allowDecimals={false}
									tickFormatter={formatRecords}
								/>
								<Tooltip
									{...chartTooltipProps({ cursor: "bar" })}
									content={<ChartTooltipContent formatter={formatRecords} />}
								/>
								<Bar
									{...ANIMATION_PROPS}
									dataKey="recordCount"
									name="记录量"
									fill={color}
									radius={BAR_RADIUS.vertical}
									maxBarSize={20}
								/>
							</BarChart>
						</ChartFrame>
					</div>
				</ScrollArea>
				<ChartLegend items={[{ key: "recordCount", label: "每日记录汇总", color }]} shape="bar" />
				<Text as="p" size="xs" tone="muted">
					跨日的区间记录在每个覆盖日各计一次；概览中的原始记录总数按保存的记录计数。
				</Text>
			</LayerCard.Body>
		</LayerCard>
	);
}

function CoverageCalendar({ provider }: { provider: ProviderOverview }) {
	const months = useMemo(() => groupCoverageMonths(provider.coverage), [provider.coverage]);
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
			<CollapsibleContent unstyled className="data-overview-coverage-content">
				<Text as="p" size="sm" tone="muted">
					有色日期表示已有记录。点击日期，打开按当前时区展示的每日时间线和地图。
				</Text>
				<div className="data-coverage-months">
					{months.map((month) => (
						<section
							key={month.key}
							className="data-coverage-month"
							aria-label={`${provider.name} ${month.label} UTC 覆盖`}
						>
							<Text as="h3" size="sm" bold>
								{month.label}
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
									const label = coverageCellLabel(cell.utcDay, cell.recordCount, provider.id);
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

function ProviderComparison({
	providers,
	metric,
	hasData,
}: {
	providers: ProviderOverview[];
	metric: OverviewMetric;
	hasData: boolean;
}) {
	const comparison = compareProviders(providers, metric);
	const selected = OVERVIEW_METRICS[metric];
	const color = getChartColor(0);
	const formatValue = (value: number) => formatOverviewMetric(value, metric);
	return (
		<LayerCard>
			<LayerCard.Header className="data-overview-card-heading">
				<div className="space-y-1">
					<Text as="h2" variant="heading" size="md">
						来源对照
					</Text>
					<Text as="p" size="sm" tone="muted">
						{selected.description}
					</Text>
				</div>
				<Select
					value={metric}
					onValueChange={(value) => dataOverviewStore.getState().setMetric(value as OverviewMetric)}
					disabled={!hasData}
				>
					<SelectTrigger aria-label="来源对照指标" className="w-36">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{Object.entries(OVERVIEW_METRICS).map(([key, option]) => (
							<SelectItem key={key} value={key}>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</LayerCard.Header>
			<LayerCard.Body className="data-overview-comparison-layout">
				{hasData ? (
					<div className="data-overview-chart">
						<ChartFrame
							ariaLabel={`${selected.label}来源对比`}
							size="data-overview-plot"
							summary={<span className="sr-only">{comparison.summary}</span>}
						>
							<BarChart
								data={comparison.data}
								layout="vertical"
								margin={{ top: 8, right: 72, bottom: 0, left: 0 }}
							>
								<CartesianGrid {...GRID_PROPS} horizontal={false} vertical />
								<XAxis
									{...AXIS_CONFIG}
									type="number"
									allowDecimals={false}
									tickCount={4}
									tickFormatter={formatValue}
								/>
								<YAxis {...AXIS_CONFIG} type="category" dataKey="name" width={88} interval={0} />
								<Tooltip
									{...chartTooltipProps({ cursor: "bar" })}
									content={<ChartTooltipContent formatter={formatValue} />}
								/>
								<Bar
									{...ANIMATION_PROPS}
									dataKey="value"
									name={selected.label}
									fill={color}
									radius={BAR_RADIUS.horizontal}
									maxBarSize={26}
								>
									<LabelList
										dataKey="value"
										position="right"
										formatter={(value) => formatValue(Number(value))}
										fill="hsl(var(--basalt-foreground))"
										fontSize={12}
									/>
								</Bar>
							</BarChart>
						</ChartFrame>
						<ChartLegend items={[{ key: metric, label: selected.label, color }]} shape="bar" />
					</div>
				) : (
					<LayerCard.Empty
						title="还没有导入数据"
						description="从一份 Footprint GPX 开始，把走过的路放回每天的故事里。"
						action={
							<Button asChild variant="outline">
								<Link to="/data/footprint">导入 Footprint</Link>
							</Button>
						}
					/>
				)}
				<div className="data-overview-table-scroll">
					<Table aria-label="各来源数据量" className="data-overview-table">
						<TableHeader>
							<TableRow>
								<TableHead scope="col">来源</TableHead>
								<TableHead scope="col">覆盖日</TableHead>
								<TableHead scope="col">原始记录</TableHead>
								<TableHead scope="col">数据行</TableHead>
								<TableHead scope="col">正文大小</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{providers.map((provider) => (
								<TableRow key={provider.id}>
									<TableHead scope="row" className="data-overview-source">
										{provider.id === "footprint" ? (
											<Link to="/data/footprint" className="data-overview-link">
												{provider.name}
											</Link>
										) : (
											provider.name
										)}
										<Text as="p" size="xs" tone="muted">
											{provider.dataRows > 0 ? storageLabel(provider.storage) : "尚未导入"}
										</Text>
									</TableHead>
									<TableCell>
										{formatOverviewMetric(provider.coverageDays, "coverageDays")}
									</TableCell>
									<TableCell>{formatOverviewMetric(provider.recordCount, "recordCount")}</TableCell>
									<TableCell>{formatOverviewMetric(provider.dataRows, "dataRows")}</TableCell>
									<TableCell title={`${provider.payloadBytes.toLocaleString("zh-CN")} 字节`}>
										{formatOverviewMetric(provider.payloadBytes, "payloadBytes")}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			</LayerCard.Body>
			<LayerCard.Footer>
				<Text as="p" size="xs" tone="muted">
					数据行数不等于计费写入次数；JSON 正文大小不包含索引等数据库开销。
				</Text>
			</LayerCard.Footer>
		</LayerCard>
	);
}

function ProviderDetails({ provider }: { provider: ProviderOverview }) {
	return (
		<LayerCard className="data-provider-card">
			<LayerCard.Header className="data-overview-card-heading">
				<div className="space-y-1">
					<Text as="h2" variant="heading" size="md">
						{provider.name}
					</Text>
					<Text as="p" size="sm" tone="muted">
						{storageLabel(provider.storage)} · 原始记录{" "}
						{formatOverviewMetric(provider.recordCount, "recordCount")} · 数据行{" "}
						{formatOverviewMetric(provider.dataRows, "dataRows")}
					</Text>
				</div>
				{provider.id === "footprint" ? (
					<Button asChild variant="outline" size="sm">
						<Link to="/data/footprint">管理 Footprint</Link>
					</Button>
				) : null}
			</LayerCard.Header>
			<LayerCard.Body className="space-y-6">
				<DescriptionList columns={3}>
					<DescriptionList.Item term="时间范围">
						{provider.firstAt && provider.lastAt
							? `${formatAbsoluteTime(provider.firstAt)} — ${formatAbsoluteTime(provider.lastAt)}`
							: "暂无记录"}
					</DescriptionList.Item>
					<DescriptionList.Item term="最近导入">
						{provider.lastImportedAt
							? `${formatAbsoluteTime(provider.lastImportedAt)} · ${importChannelLabel(provider.lastImportChannel)}`
							: "尚未导入"}
					</DescriptionList.Item>
					<DescriptionList.Item term="最近内容变更">
						{provider.lastChangedAt ? formatAbsoluteTime(provider.lastChangedAt) : "尚未变更"}
					</DescriptionList.Item>
				</DescriptionList>
				<CoverageCalendar provider={provider} />
			</LayerCard.Body>
			{provider.id === "footprint" ? (
				<LayerCard.Footer>
					<Text as="p" size="sm" tone="muted">
						重复导入时，文件包含的 UTC 日会整日替换，未包含的日期保留；内容相同的日期不重复累计。
					</Text>
				</LayerCard.Footer>
			) : null}
		</LayerCard>
	);
}

export function DataOverviewPage() {
	const overview = useStore(dataOverviewStore, (state) => state.overview);
	const target = useStore(dataOverviewStore, (state) => state.target);
	const status = useStore(dataOverviewStore, (state) => state.status);
	const error = useStore(dataOverviewStore, (state) => state.error);
	const expired = useStore(dataOverviewStore, (state) => state.expired);
	const metric = useStore(dataOverviewStore, (state) => state.metric);
	const summary = useMemo(() => summarizeProviders(overview?.providers ?? []), [overview]);
	const loading = status === "loading";

	useEffect(() => {
		void dataOverviewStore.getState().load();
	}, []);

	return (
		<div className="data-overview-page space-y-8">
			<PageHeader
				title="数据概览"
				description="汇总每一种来源留下的记录，回看它们覆盖的日子。"
				actions={
					<>
						<Button
							variant="outline"
							loading={loading}
							disabled={expired}
							icon={<RefreshCw className="size-4" aria-hidden="true" />}
							onClick={() => void dataOverviewStore.getState().load()}
						>
							刷新概览
						</Button>
						<Button asChild icon={<Upload className="size-4" aria-hidden="true" />}>
							<Link to="/data/footprint">导入 Footprint</Link>
						</Button>
					</>
				}
			/>
			<div className="data-overview-meta">
				<Text as="p" size="sm" tone="muted">
					{target ? dataTargetLabel(target) : loading ? "正在读取数据概览。" : null}
				</Text>
				<Text as="p" size="xs" tone="muted" role="status" aria-live="polite">
					{loading && overview
						? "正在刷新，以下保留上次读取的结果。"
						: overview
							? `统计更新于 ${formatAbsoluteTime(overview.computedAt)}`
							: null}
				</Text>
			</div>
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
			{loading && !overview ? (
				<LayerCard>
					<LayerCard.Loading label="正在读取数据概览" />
				</LayerCard>
			) : null}
			{overview ? (
				<>
					<div className="space-y-3">
						<StatStrip
							aria-label="全部来源的数据规模"
							items={[
								{
									label: "覆盖天数",
									value: formatOverviewMetric(summary.coverageDays, "coverageDays"),
								},
								{
									label: "原始记录",
									value: formatOverviewMetric(summary.recordCount, "recordCount"),
								},
								{
									label: "D1 数据行",
									value: formatOverviewMetric(summary.dataRows, "dataRows"),
								},
								{
									label: "JSON 正文",
									value: (
										<span title={`${summary.payloadBytes.toLocaleString("zh-CN")} 字节`}>
											{formatOverviewMetric(summary.payloadBytes, "payloadBytes")}
										</span>
									),
								},
							]}
						/>
						<Text as="p" size="sm" tone="muted">
							已收录 {summary.importedProviders.length} 个来源。总体覆盖按 UTC
							日期去重，同一天不重复计数。
						</Text>
					</div>
					<MonthlyRecords providers={overview.providers} />
					<ProviderComparison
						providers={overview.providers}
						metric={metric}
						hasData={summary.importedProviders.length > 0}
					/>
					{summary.importedProviders.length > 0 ? (
						<SectionRule
							title="覆盖日与导入记录"
							hint="覆盖按 UTC 日统计；记录时间和导入时间按当前时区展示。"
						>
							<div className="data-overview-provider-grid">
								{summary.importedProviders.map((provider) => (
									<ProviderDetails key={provider.id} provider={provider} />
								))}
							</div>
						</SectionRule>
					) : null}
				</>
			) : null}
		</div>
	);
}
