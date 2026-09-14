import { Button, LayerCard, Text } from "@nocoo/basalt";
import { DataTable, type DataTableColumn } from "@nocoo/basalt/components/data-table";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@nocoo/basalt/components/dialog";
import { useCallback, useId, useMemo, useRef, useState } from "react";
import { EMPTY_NAMED_PLACES, type NamedPlace } from "../models/general-settings";
import { PIXIU_COLUMNS } from "../models/pixiu";
import type { DayTimeline, LifeEvent } from "../models/types";
import {
	buildDayRecords,
	type DayRecordKind,
	type DayRecordRow,
	dayRecordField,
	dayRecordSummary,
	dayRecordTime,
} from "../viewmodels/day-records";
import { sourceKindLabel } from "../viewmodels/event-details";
import { healthRecordSource, healthRecordTitle } from "../viewmodels/health-format";

const PRECISION = {
	day: { label: "天", order: 0 },
	hour: { label: "小时", order: 1 },
	minute: { label: "分钟", order: 2 },
	second: { label: "秒", order: 3 },
};
const getRowId = (row: DayRecordRow) => row.event.id;

export default function DayRecords({
	timeline,
	kind,
	namedPlaces = EMPTY_NAMED_PLACES,
}: {
	timeline: DayTimeline;
	kind: DayRecordKind;
	namedPlaces?: readonly NamedPlace[];
}) {
	const rows = useMemo(
		() => buildDayRecords(timeline, kind, namedPlaces),
		[timeline, kind, namedPlaces],
	);
	const [selected, setSelected] = useState<{ event: LifeEvent; json: string } | null>(null);
	const returnFocus = useRef<HTMLButtonElement | null>(null);
	const descriptionId = useId();
	const isLocation = kind === "locations";
	const isFinance = kind === "finance";
	const title = isLocation ? "位置记录" : isFinance ? "账目记录" : "其他记录";
	const openDetails = useCallback((event: LifeEvent, trigger: HTMLButtonElement) => {
		returnFocus.current = trigger;
		setSelected({ event, json: JSON.stringify(event, null, 2) });
	}, []);
	const columns = useMemo<DataTableColumn<DayRecordRow>[]>(() => {
		const common: DataTableColumn<DayRecordRow>[] = [
			{
				id: "time",
				header: "时间",
				accessor: dayRecordTime,
				sortValue: (row) => row.instant,
				cellClassName: "whitespace-nowrap tabular-nums",
			},
			{
				id: "precision",
				header: "精度",
				accessor: (row) => PRECISION[row.event.precision].label,
				sortValue: (row) => PRECISION[row.event.precision].order,
				cellClassName: "whitespace-nowrap",
			},
			{
				id: "source",
				header: "来源",
				accessor: (row) => (
					<div className="space-y-1">
						<Text as="p" size="sm" className="max-w-48 break-words">
							{healthRecordSource(row.event)}
						</Text>
						<Text as="p" size="xs" tone="muted">
							{sourceKindLabel(row.event.sourceKind)}
						</Text>
					</div>
				),
				sortValue: (row) => row.event.sourceName,
			},
			{
				id: "title",
				header: "标题",
				accessor: (row) => (
					<div className="max-w-64 space-y-1">
						<Text as="p" size="sm" className="line-clamp-2 break-words">
							{healthRecordTitle(row.event)}
						</Text>
						{isLocation && row.pointCount !== null ? (
							<Text as="p" size="xs" tone="muted">
								{row.pointCount.toLocaleString()} 个轨迹点
							</Text>
						) : null}
					</div>
				),
				sortValue: (row) => row.event.title,
			},
		];
		if (isFinance) {
			common.splice(
				0,
				common.length,
				...PIXIU_COLUMNS.map((field) => ({
					id: field,
					header: field,
					accessor: (row: DayRecordRow) => dayRecordField(row, field) || "—",
					sortValue: (row: DayRecordRow) => dayRecordField(row, field),
					headerClassName: "whitespace-nowrap",
					cellClassName:
						field === "备注"
							? "max-w-sm whitespace-pre-wrap break-words"
							: "whitespace-nowrap tabular-nums",
				})),
			);
		} else if (isLocation) {
			common.push({
				id: "placeLabel",
				header: "地点",
				accessor: (row) => row.placeLabel ?? "—",
				sortValue: (row) => row.placeLabel ?? "",
				cellClassName: "max-w-48 break-words",
			});
			for (const [id, header] of [
				["latitude", "纬度"],
				["longitude", "经度"],
				["elevation", "海拔"],
				["speed", "原始速度"],
				["course", "原始航向"],
			] as const) {
				common.push({
					id,
					header,
					accessor: (row) => row[id] ?? "—",
					sortValue: (row) => row[id] ?? Infinity,
					headerClassName: "whitespace-nowrap",
					cellClassName: "whitespace-nowrap tabular-nums",
				});
			}
		} else {
			common.push({
				id: "summary",
				header: "摘要",
				sortable: false,
				accessor: (row) => (
					<Text as="p" size="sm" tone="muted" className="max-w-xl line-clamp-2 break-words">
						{dayRecordSummary(row.event)}
					</Text>
				),
			});
		}
		common.push({
			id: "details",
			header: "详情",
			sortable: false,
			accessor: (row) => (
				<Button
					variant="ghost"
					size="sm"
					aria-label={`查看完整记录：${healthRecordTitle(row.event)}`}
					onClick={(event) => openDetails(row.event, event.currentTarget)}
				>
					详情
				</Button>
			),
		});
		return common;
	}, [isLocation, isFinance, openDetails]);

	return (
		<>
			<LayerCard className="min-w-0">
				<LayerCard.Header>
					<div className="space-y-1">
						<Text as="h2" variant="heading" size="md">
							{title}
						</Text>
						<Text as="p" size="sm" tone="muted" id={descriptionId}>
							{rows.length.toLocaleString()} 条记录 · 每页 50 条 ·{" "}
							{isFinance ? "北京时间记账日，保留原始九列" : `时间显示为 ${timeline.timezone}`}
						</Text>
					</div>
				</LayerCard.Header>
				<LayerCard.Body className="min-w-0 space-y-3">
					{isLocation ? (
						<Text as="p" size="xs" tone="muted">
							Footprint 导出未注明速度单位；这里保留速度与航向原值，包括 0 和
							-1。整段轨迹的全部点可在详情查看。
						</Text>
					) : null}
					<DataTable
						aria-label={title}
						aria-describedby={descriptionId}
						data={rows}
						columns={columns}
						getRowId={getRowId}
						pageSize={50}
						defaultSort={{ id: isFinance ? "日期" : "time", dir: "asc" }}
						className={isLocation ? "min-w-[68rem]" : "min-w-[48rem]"}
						empty={`这一天没有${title}。`}
					/>
				</LayerCard.Body>
			</LayerCard>
			{selected ? (
				<Dialog open onOpenChange={(open) => !open && setSelected(null)}>
					<DialogContent
						size="xl"
						onCloseAutoFocus={(event) => {
							event.preventDefault();
							returnFocus.current?.focus();
						}}
					>
						<DialogHeader>
							<DialogTitle>{healthRecordTitle(selected.event)}</DialogTitle>
							<DialogDescription>
								{selected.event.sourceName} · 完整原始记录，时间字段保留原值。
							</DialogDescription>
						</DialogHeader>
						<Text as="pre" variant="mono" size="xs" className="whitespace-pre-wrap break-all">
							{selected.json}
						</Text>
					</DialogContent>
				</Dialog>
			) : null}
		</>
	);
}
