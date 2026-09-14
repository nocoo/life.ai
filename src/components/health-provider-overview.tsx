import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
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
import { ChartTooltipContent } from "@nocoo/basalt/charts/tooltip";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@nocoo/basalt/components/table";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import type { HealthProviderStats } from "../models/data-management";
import { formatByteSize } from "../viewmodels/format";
import { healthDimensionLabel } from "../viewmodels/health-format";

export function HealthProviderOverview({ health }: { health: HealthProviderStats }) {
	const routes = health.files.find((file) => file.kind === "route");
	const ecgs = health.files.find((file) => file.kind === "ecg");
	const chart = health.dimensions
		.slice(0, 10)
		.map((row) => ({ ...row, name: healthDimensionLabel(row.id) }));
	return (
		<section className="space-y-5" aria-label="健康维度与附件完整性">
			<StatStrip
				items={[
					{ label: "健康维度", value: health.dimensions.length },
					{ label: "锻炼路线", value: routes?.fileCount ?? 0 },
					{ label: "心电图", value: ecgs?.fileCount ?? 0 },
				]}
			/>
			{chart.length ? (
				<ChartFrame ariaLabel="健康指标覆盖天数" size="md">
					<BarChart
						data={chart}
						layout="vertical"
						margin={{ top: 0, right: 20, bottom: 0, left: 0 }}
					>
						<CartesianGrid {...GRID_PROPS} horizontal={false} />
						<XAxis {...AXIS_CONFIG} type="number" allowDecimals={false} />
						<YAxis {...AXIS_CONFIG} type="category" dataKey="name" width={120} interval={0} />
						<Tooltip {...chartTooltipProps({ cursor: "bar" })} content={<ChartTooltipContent />} />
						<Bar
							{...ANIMATION_PROPS}
							dataKey="coverageDays"
							name="覆盖天数"
							fill={getChartColor(1)}
							radius={BAR_RADIUS.horizontal}
							maxBarSize={18}
						/>
					</BarChart>
				</ChartFrame>
			) : null}
			<Collapsible>
				<CollapsibleTrigger>查看全部 {health.dimensions.length} 个维度</CollapsibleTrigger>
				<CollapsibleContent unstyled>
					<div className="max-h-96 overflow-auto">
						<Table aria-label="健康数据各维度统计">
							<TableHeader>
								<TableRow>
									<TableHead>维度</TableHead>
									<TableHead>原始记录</TableHead>
									<TableHead>覆盖日</TableHead>
									<TableHead>序列行</TableHead>
									<TableHead>存储大小</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{health.dimensions.map((row) => (
									<TableRow key={row.id}>
										<TableCell title={row.id}>{healthDimensionLabel(row.id)}</TableCell>
										<TableCell>{row.recordCount.toLocaleString()}</TableCell>
										<TableCell>{row.coverageDays.toLocaleString()}</TableCell>
										<TableCell>{row.dataRows.toLocaleString()}</TableCell>
										<TableCell>{formatByteSize(row.payloadBytes)}</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				</CollapsibleContent>
			</Collapsible>
			<Text as="p" size="sm" tone="muted">
				{(routes?.recordCount ?? 0).toLocaleString()} 个路线原始点 ·{" "}
				{(ecgs?.recordCount ?? 0).toLocaleString()} 个心电波形样本
			</Text>
			<Text as="p" size="xs" tone="muted">
				附加信息随原始记录保留；路线点与波形样本另计，不重复累加到健康记录。数据行包括每日目录、维度序列与原始附件。
			</Text>
			{health.dimensions.some((row) => row.id === "HKDataTypeSleepDurationGoal") ? (
				<Text as="p" size="xs" tone="muted">
					睡眠目标等系统设置完整保留在原始记录中，不计入生活记录的日期覆盖和月度图表。
				</Text>
			) : null}
			{health.epochRecordCount > 0 ? (
				<Text as="p" size="xs" tone="muted">
					{health.epochRecordCount.toLocaleString()} 条记录的原始日期为
					1970-01-01，完整保留在原始记录中；该日不计入日期覆盖和月度图表。
				</Text>
			) : null}
		</section>
	);
}
