import {
	Button,
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
	DescriptionList,
	LayerCard,
	StatStrip,
	Text,
} from "@nocoo/basalt";
import { Banner } from "@nocoo/basalt/components/banner";
import { FileDropzone } from "@nocoo/basalt/components/file-dropzone";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@nocoo/basalt/components/table";
import { type UploadFile, UploadQueue } from "@nocoo/basalt/components/upload-queue";
import { ArrowUpRight } from "lucide-react";
import { useEffect } from "react";
import { Link } from "react-router";
import { useStore } from "zustand";
import { TargetSkeleton } from "../components/page-skeletons";
import { dataTargetLabel, utcDayKey } from "../viewmodels/data-overview-view-model";
import { footprintParsePercent, footprintStore } from "../viewmodels/footprint-view-model";
import { formatAbsoluteTime, formatByteSize } from "../viewmodels/format";

export function FootprintPage() {
	const state = useStore(footprintStore);
	const {
		fileName,
		fileSize,
		target,
		targetStatus,
		targetError,
		status,
		progress,
		preview,
		receipt,
		error,
		rejection,
	} = state;
	const busy = status === "reading" || status === "uploading";
	const queue: UploadFile[] = fileName
		? [
				{
					id: "footprint",
					name: fileName,
					size: fileSize ?? undefined,
					status: busy
						? "uploading"
						: status === "success"
							? "success"
							: status === "error"
								? "error"
								: status === "cancelled"
									? "cancelled"
									: "queued",
					progress:
						status === "reading"
							? footprintParsePercent(progress)
							: status === "uploading" && preview
								? Math.round(((receipt?.committedDays ?? 0) / preview.days.length) * 100)
								: undefined,
					error: error ?? undefined,
				},
			]
		: [];
	useEffect(() => {
		void footprintStore.getState().loadTarget();
		return () => {
			void footprintStore.getState().reset();
		};
	}, []);
	return (
		<div className="data-page space-y-6">
			<PageHeader
				title="Footprint"
				description="导入 GPS 足迹，在每日实录中回看走过的地方。"
				actions={
					<Button variant="outline" asChild>
						<Link to="/data">
							查看数据概览 <ArrowUpRight size={16} strokeWidth={1.5} aria-hidden="true" />
						</Link>
					</Button>
				}
			/>
			<div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.8fr)]">
				<div className="min-w-0 space-y-6">
					<LayerCard>
						<LayerCard.Header>
							<div className="space-y-1">
								<Text as="h2" variant="heading" size="md">
									选择 GPX
								</Text>
								<Text as="p" size="sm" tone="muted">
									先整理并预览文件，确认后再上传。
								</Text>
							</div>
						</LayerCard.Header>
						<LayerCard.Body className="space-y-5">
							<FileDropzone
								label="选择 footprint GPX"
								description="拖入 Footprint 导出的 GPX，或从本机选择文件。"
								accept=".gpx,application/gpx+xml,application/xml,text/xml"
								multiple={false}
								maxFiles={1}
								fileCount={fileName ? 1 : 0}
								disabled={busy}
								browseLabel="浏览文件"
								dropLabel="放到这里"
								formatRejection={(item) => `${item.file.name} 无法使用（${item.code}）`}
								onFilesAccepted={(files) => {
									const file = files[0];
									if (file) void state.selectFile(file);
								}}
								onFilesRejected={(items) => {
									const item = items[0];
									state.rejectFile(
										item ? `${item.file.name} 无法使用（${item.code}）` : "文件未被接受。",
									);
								}}
							/>
							{rejection ? (
								<Banner variant="alert" title="文件未接受" description={rejection} />
							) : null}
							<UploadQueue
								label="Footprint 导入进度"
								files={queue}
								emptyLabel="支持完整备份，也可以导入部分日期。"
								onCancel={() => state.cancel()}
								onRetry={() => void state.retry()}
								onRemove={() => void state.clear()}
								labels={{
									queued: "待上传",
									uploading: status === "reading" ? "整理中" : "上传中",
									success: "已完成",
									error: "失败",
									cancelled: "已取消",
									cancel: "取消",
									retry: "重试",
									remove: "清除",
								}}
							/>
							{progress ? (
								<Text as="p" size="sm" tone="muted">
									已读 {formatByteSize(progress.bytesRead)}
									{progress.totalBytes > 0 ? ` / ${formatByteSize(progress.totalBytes)}` : ""} ·{" "}
									{progress.pointCount.toLocaleString()} 个点
								</Text>
							) : null}
						</LayerCard.Body>
					</LayerCard>
					{status === "error" && error ? (
						<Banner
							variant="error"
							title={preview ? "提交失败" : "解析失败"}
							description={error}
							action={<Banner.Action onClick={() => void state.retry()}>重试</Banner.Action>}
						/>
					) : null}
					{status === "cancelled" ? (
						<Banner
							variant="secondary"
							title="已取消"
							description="未完成的解析或提交已停止。已提交的日期会保留，可以重新导入。"
						/>
					) : null}
					{preview ? (
						<LayerCard>
							<LayerCard.Header>
								<div className="space-y-1">
									<Text as="h2" variant="heading" size="md">
										本次预览
									</Text>
									<Text as="p" size="sm" tone="muted">
										{formatAbsoluteTime(new Date(preview.firstAt).toISOString())} —{" "}
										{formatAbsoluteTime(new Date(preview.lastAt).toISOString())}
									</Text>
								</div>
							</LayerCard.Header>
							<LayerCard.Body className="space-y-5">
								<StatStrip
									items={[
										{ label: "UTC 日期", value: preview.days.length.toLocaleString() },
										{ label: "位置点", value: preview.pointCount.toLocaleString() },
										{ label: "整理后大小", value: formatByteSize(preview.payloadBytes) },
									]}
								/>
								<Collapsible defaultOpen={preview.days.length <= 12}>
									<CollapsibleTrigger>查看 {preview.days.length} 个 UTC 日</CollapsibleTrigger>
									<CollapsibleContent unstyled>
										<div className="max-h-72 overflow-auto">
											<Table>
												<TableHeader>
													<TableRow>
														<TableHead scope="col">日期（UTC）</TableHead>
														<TableHead scope="col">位置点</TableHead>
														<TableHead scope="col">数据大小</TableHead>
													</TableRow>
												</TableHeader>
												<TableBody>
													{preview.days.map((day) => (
														<TableRow key={day.utcDay}>
															<TableCell>{utcDayKey(day.utcDay)}</TableCell>
															<TableCell>{day.recordCount.toLocaleString()}</TableCell>
															<TableCell>{formatByteSize(day.payloadBytes)}</TableCell>
														</TableRow>
													))}
												</TableBody>
											</Table>
										</div>
									</CollapsibleContent>
								</Collapsible>
								{receipt ? (
									<Text as="p" size="sm" tone="muted">
										已写入 {receipt.committedDays} 日 · {receipt.committedPoints} 点
										{receipt.insertedDays ? ` · 新增 ${receipt.insertedDays}` : ""}
										{receipt.updatedDays ? ` · 更新 ${receipt.updatedDays}` : ""}
										{receipt.unchangedDays ? ` · 未变 ${receipt.unchangedDays}` : ""}
									</Text>
								) : null}
								{status === "success" ? (
									<Banner
										variant="default"
										title="导入完成"
										description="本次文件中的日期已更新，可以到每日实录中查看。"
									/>
								) : null}
							</LayerCard.Body>
							<LayerCard.Footer>
								<Button
									onClick={() => void state.startUpload()}
									loading={status === "uploading"}
									disabled={busy || status === "success" || !target}
								>
									开始上传
								</Button>
							</LayerCard.Footer>
						</LayerCard>
					) : null}
				</div>
				<div className="min-w-0 space-y-6">
					<LayerCard>
						<LayerCard.Header>
							<Text as="h2" variant="heading" size="md">
								写入位置
							</Text>
						</LayerCard.Header>
						{target ? (
							<LayerCard.Body>
								<Text as="p" size="sm">
									{dataTargetLabel(target)}
								</Text>
							</LayerCard.Body>
						) : targetStatus === "loading" ? (
							<LayerCard.Body>
								<TargetSkeleton />
							</LayerCard.Body>
						) : null}
						{targetStatus === "error" ? (
							<LayerCard.Body>
								<Banner
									variant="secondary"
									title="暂时无法确认数据环境"
									description={targetError ?? undefined}
									action={
										<Banner.Action onClick={() => void state.loadTarget()}>重新读取</Banner.Action>
									}
								/>
							</LayerCard.Body>
						) : null}
					</LayerCard>
					<LayerCard>
						<LayerCard.Header>
							<Text as="h2" variant="heading" size="md">
								按天更新足迹
							</Text>
						</LayerCard.Header>
						<LayerCard.Body className="space-y-4">
							<DescriptionList columns={1}>
								<DescriptionList.Item term="重复导入">
									同一 UTC 日以本次文件的完整内容覆盖；内容相同的日期保持不变。
								</DescriptionList.Item>
								<DescriptionList.Item term="部分日期">
									文件未包含的日期会保留。若只导入某一天的部分点，会替换这一天原有的全部点。
								</DescriptionList.Item>
								<DescriptionList.Item term="回看一天">
									时间线按你的当前时区展示，轨迹和采样点会自动落在对应时段。
								</DescriptionList.Item>
							</DescriptionList>
							<Text as="p" size="sm" tone="muted">
								累计覆盖天数、数据量和存储统计统一在数据概览查看。
							</Text>
						</LayerCard.Body>
					</LayerCard>
				</div>
			</div>
		</div>
	);
}
