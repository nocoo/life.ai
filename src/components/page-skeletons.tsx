import { LayerCard, StatStrip, Text } from "@nocoo/basalt";
import { SkeletonLine } from "@nocoo/basalt/components/skeleton-line";
import type { ReactNode } from "react";
import type { DayRecordKind } from "../viewmodels/day-records";
import "../views/data-overview.css";
import "../views/general-settings-page.css";

export function LoadingRegion({
	label,
	className,
	children,
}: {
	label: string;
	className?: string;
	children: ReactNode;
}) {
	return (
		<div role="status" aria-label={label} aria-busy="true" className={className}>
			{children}
		</div>
	);
}

function SkeletonCard({
	title,
	children,
	className,
}: {
	title: string;
	children: ReactNode;
	className?: string;
}) {
	return (
		<LayerCard>
			<LayerCard.Header>
				<Text as="h2" variant="heading" size="md">
					{title}
				</Text>
			</LayerCard.Header>
			<LayerCard.Body className={className ?? "space-y-4"}>{children}</LayerCard.Body>
		</LayerCard>
	);
}

function TextLines() {
	return (
		<div className="space-y-3" aria-hidden="true">
			<SkeletonLine minWidth={100} className="h-4" />
			<SkeletonLine minWidth={76} className="h-4" />
			<SkeletonLine className="h-4" />
		</div>
	);
}

export function FormSkeleton({ fields }: { fields: readonly string[] }) {
	return (
		<div className="space-y-4" aria-hidden="true">
			{fields.map((field) => (
				<div key={field} className="space-y-2">
					<Text as="p" size="sm">
						{field}
					</Text>
					<SkeletonLine minWidth={100} className="h-9 rounded-md" />
				</div>
			))}
			<SkeletonLine minWidth={100} className="h-9 max-w-28 rounded-md" />
		</div>
	);
}

export function PlaceListSkeleton() {
	return (
		<LoadingRegion label="正在读取常用地点" className="space-y-2">
			{["home", "work"].map((slot) => (
				<LayerCard.Well key={slot}>
					<div className="flex items-start justify-between gap-4" aria-hidden="true">
						<div className="min-w-0 flex-1 space-y-3">
							<SkeletonLine className="h-5 max-w-32" />
							<SkeletonLine minWidth={100} className="h-4 max-w-64" />
						</div>
						<SkeletonLine minWidth={100} className="h-8 max-w-24" />
					</div>
				</LayerCard.Well>
			))}
		</LoadingRegion>
	);
}

export function RoutineSkeleton() {
	return (
		<LoadingRegion label="正在读取惯常作息" className="space-y-4">
			<SkeletonLine minWidth={100} className="h-5" />
			<FormSkeleton fields={["入睡时间", "起床时间", "时区"]} />
		</LoadingRegion>
	);
}

export function GeneralSettingsSkeleton() {
	return (
		<div className="general-settings-layout">
			<SkeletonCard title="常用地点">
				<PlaceListSkeleton />
			</SkeletonCard>
			<SkeletonCard title="惯常作息">
				<RoutineSkeleton />
			</SkeletonCard>
		</div>
	);
}

export function AiSettingsSkeleton() {
	return (
		<LoadingRegion label="正在读取 AI 设置" className="max-w-xl space-y-4">
			<FormSkeleton fields={["提供方", "模型"]} />
			<SkeletonLine minWidth={100} className="h-4" />
		</LoadingRegion>
	);
}

export function DaySourcesSkeleton() {
	return (
		<LoadingRegion label="正在读取数据源" className="grid min-w-0 gap-6 xl:grid-cols-2">
			<SkeletonCard title="Gecko">
				<TextLines />
				<FormSkeleton fields={["Gecko API Key"]} />
			</SkeletonCard>
			<SkeletonCard title="Firefly">
				<TextLines />
				<Text as="p" size="sm" tone="muted">
					公开数据，无须账号或密钥。
				</Text>
				<SkeletonLine minWidth={100} className="h-9 max-w-28 rounded-md" />
			</SkeletonCard>
			<SkeletonCard title="GitHub">
				<TextLines />
				<FormSkeleton fields={["GitHub PAT"]} />
			</SkeletonCard>
		</LoadingRegion>
	);
}

export function ConnectListSkeleton() {
	return (
		<LoadingRegion label="正在加载令牌" className="space-y-3">
			{["first", "second"].map((slot) => (
				<LayerCard.Well key={slot}>
					<div className="space-y-4" aria-hidden="true">
						<div className="flex justify-between gap-4">
							<SkeletonLine className="h-5 max-w-48" />
							<SkeletonLine minWidth={100} className="h-8 max-w-16" />
						</div>
						<SkeletonLine className="h-4 max-w-64" />
						<div className="grid grid-cols-2 gap-4">
							<TextLines />
							<TextLines />
						</div>
					</div>
				</LayerCard.Well>
			))}
		</LoadingRegion>
	);
}

const TABLE_COLUMNS = Array.from({ length: 11 }, (_, column) => column);

function TableSkeleton({ columns, minWidth }: { columns: number; minWidth: string }) {
	return (
		<div className="min-w-0 overflow-x-auto" aria-hidden="true">
			<div className="divide-y divide-basalt-border" style={{ minWidth }}>
				{["heading", "first", "second", "third", "fourth", "fifth"].map((row) => (
					<div
						key={row}
						className="grid gap-5 px-3 py-4"
						style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
					>
						{TABLE_COLUMNS.slice(0, columns).map((column) => (
							<SkeletonLine key={column} minWidth={100} className="h-4" />
						))}
					</div>
				))}
			</div>
		</div>
	);
}

export function RecordsSkeleton({ kind }: { kind: DayRecordKind }) {
	const title = kind === "locations" ? "位置记录" : kind === "finance" ? "账目记录" : "其他记录";
	return (
		<LoadingRegion label={`正在加载${title}`}>
			<SkeletonCard title={title}>
				<SkeletonLine className="h-4 max-w-80" />
				<TableSkeleton
					columns={kind === "locations" ? 11 : kind === "finance" ? 10 : 6}
					minWidth={kind === "locations" ? "68rem" : "48rem"}
				/>
				<SkeletonLine minWidth={100} className="h-8 max-w-48" />
			</SkeletonCard>
		</LoadingRegion>
	);
}

export function DataOverviewSkeleton() {
	return (
		<LoadingRegion label="正在读取数据概览" className="space-y-6">
			<div className="space-y-3">
				<StatStrip
					aria-busy="true"
					items={["覆盖天数", "原始记录", "D1 数据行", "JSON 正文"].map((label) => ({
						label,
						value: <SkeletonLine className="my-0.5 h-6 bg-basalt-muted-foreground/15" />,
					}))}
				/>
				<SkeletonLine className="h-5 max-w-xl" />
			</div>
			<SkeletonCard title="按月记录量">
				<SkeletonLine minWidth={100} className="h-5" />
				<SkeletonLine minWidth={100} className="data-overview-history-plot rounded-md" />
				<SkeletonLine className="h-4 max-w-80" />
			</SkeletonCard>
			<SkeletonCard title="来源对照" className="data-overview-comparison-layout">
				<SkeletonLine minWidth={100} className="data-overview-plot rounded-md" />
				<TableSkeleton columns={5} minWidth="520px" />
			</SkeletonCard>
		</LoadingRegion>
	);
}

export function DiarySkeleton() {
	return (
		<LoadingRegion label="正在读取 AI 总结" className="space-y-5">
			<TextLines />
			<TextLines />
			<SkeletonLine minWidth={100} className="h-8 max-w-28 rounded-md" />
		</LoadingRegion>
	);
}

export function WeatherSkeleton() {
	return (
		<LoadingRegion label="正在读取天气" className="space-y-5">
			<div className="flex items-center gap-3" aria-hidden="true">
				<SkeletonLine minWidth={100} className="size-8 max-w-8 rounded-full" />
				<div className="flex-1 space-y-2">
					<SkeletonLine className="h-6" />
					<SkeletonLine className="h-4" />
				</div>
			</div>
			<div className="grid grid-cols-2 gap-4">
				<TextLines />
				<TextLines />
			</div>
			<SkeletonLine className="h-3" />
		</LoadingRegion>
	);
}

export function SolarSkeleton() {
	return (
		<LoadingRegion label="正在读取日出日落" className="space-y-3">
			<div className="grid grid-cols-2 gap-6">
				<SkeletonLine minWidth={100} className="h-5" />
				<SkeletonLine minWidth={100} className="h-5" />
			</div>
			<SkeletonLine className="h-4" />
		</LoadingRegion>
	);
}

export function TargetSkeleton() {
	return (
		<LoadingRegion label="正在确认数据环境" className="py-1">
			<SkeletonLine minWidth={100} className="h-3 max-w-64" />
		</LoadingRegion>
	);
}

export function MapSkeleton() {
	return (
		<LoadingRegion label="正在读取运动路线" className="story-map story-card">
			<SkeletonCard title="运动路线">
				<SkeletonLine minWidth={100} className="story-map-canvas story-map-compact rounded-md" />
			</SkeletonCard>
		</LoadingRegion>
	);
}

export function EcgSkeleton() {
	return (
		<LoadingRegion label="正在读取心电波形" className="health-story-ecg-wrap">
			<SkeletonLine minWidth={100} className="health-story-ecg rounded-md" />
			<div className="health-story-ecg-nav" aria-hidden="true">
				<SkeletonLine minWidth={100} className="h-8 max-w-20 rounded-md" />
				<SkeletonLine className="h-4 max-w-32" />
				<SkeletonLine minWidth={100} className="h-8 max-w-20 rounded-md" />
			</div>
		</LoadingRegion>
	);
}

export function TimelineSkeleton() {
	return (
		<LoadingRegion label="正在加载当天记录" className="day-layout">
			<div className="day-story-column">
				<div className="story-ribbon" aria-hidden="true">
					{["night", "morning", "afternoon", "evening"].map((period) => (
						<div key={period} className="space-y-3">
							<SkeletonLine minWidth={100} className="h-7" />
							<SkeletonLine className="h-4" />
						</div>
					))}
				</div>
				<div className="story-tree space-y-7" aria-hidden="true">
					{["first", "second", "third"].map((hour) => (
						<div className="story-hour-block" key={hour}>
							<div className="story-hour-axis">
								<SkeletonLine minWidth={100} className="h-6 max-w-10" />
							</div>
							<div className="story-lane story-lane-left">
								<LayerCard className="min-h-40 space-y-4">
									<SkeletonLine className="h-5" />
									<TextLines />
								</LayerCard>
							</div>
							<div className="story-lane story-lane-right">
								<LayerCard className="min-h-32 space-y-4">
									<SkeletonLine className="h-5" />
									<TextLines />
								</LayerCard>
							</div>
						</div>
					))}
				</div>
			</div>
			<div className="day-meta">
				<SkeletonCard title="当天概况">
					<div className="grid grid-cols-2 gap-4">
						<TextLines />
						<TextLines />
					</div>
				</SkeletonCard>
				<SkeletonCard title="天气与天光">
					<WeatherSkeleton />
					<SolarSkeleton />
				</SkeletonCard>
				<SkeletonCard title="AI 总结">
					<DiarySkeleton />
				</SkeletonCard>
			</div>
		</LoadingRegion>
	);
}

export function ImportPageSkeleton({
	provider,
}: {
	provider: "footprint" | "apple-health" | "pixiu";
}) {
	const target = (
		<SkeletonCard title="写入位置">
			<TargetSkeleton />
		</SkeletonCard>
	);
	const rules = (
		<SkeletonCard
			title={
				provider === "pixiu"
					? "按记账日整理"
					: provider === "footprint"
						? "按天更新足迹"
						: "导入与保留规则"
			}
		>
			<TextLines />
			<TextLines />
			<TextLines />
		</SkeletonCard>
	);
	return (
		<LoadingRegion
			label="正在加载导入页面"
			className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.8fr)]"
		>
			<SkeletonCard
				title={
					provider === "footprint" ? "选择 GPX" : provider === "pixiu" ? "选择 CSV" : "选择导出文件"
				}
			>
				<SkeletonLine minWidth={100} className="h-44 rounded-md" />
				{provider === "apple-health" ? (
					<SkeletonLine minWidth={100} className="h-20 rounded-md" />
				) : null}
				<SkeletonLine className="h-5" />
			</SkeletonCard>
			<div className="min-w-0 space-y-6">
				{provider === "pixiu" ? (
					<>
						{rules}
						{target}
					</>
				) : (
					<>
						{target}
						{rules}
					</>
				)}
			</div>
		</LoadingRegion>
	);
}

export function JournalImportSkeleton() {
	return (
		<LoadingRegion label="正在加载日记导入" className="space-y-6">
			<SkeletonCard title="来源与文件">
				<SkeletonLine minWidth={100} className="h-44 rounded-md" />
				<SkeletonLine minWidth={100} className="h-9 max-w-64 rounded-md" />
			</SkeletonCard>
			<SkeletonCard title="进度">
				<SkeletonLine minWidth={100} className="h-16 rounded-md" />
			</SkeletonCard>
		</LoadingRegion>
	);
}

export function ConnectPageSkeleton() {
	return (
		<div className="space-y-6">
			<SkeletonCard title="签发令牌">
				<LoadingRegion label="正在加载签发令牌" className="max-w-xl">
					<FormSkeleton fields={["名称"]} />
				</LoadingRegion>
			</SkeletonCard>
			<SkeletonCard title="已签发">
				<ConnectListSkeleton />
			</SkeletonCard>
		</div>
	);
}
