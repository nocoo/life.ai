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
import { type UploadFile, UploadQueue } from "@nocoo/basalt/components/upload-queue";
import { ArrowUpRight, FolderUp } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link } from "react-router";
import { useStore } from "zustand";
import { TargetSkeleton } from "../components/page-skeletons";
import { healthProgressPercent, healthStore } from "../viewmodels/apple-health-view-model";
import { dataTargetLabel } from "../viewmodels/data-overview-view-model";
import { formatAbsoluteTime, formatByteSize } from "../viewmodels/format";
import "./apple-health-page.css";

export function AppleHealthPage() {
	const state = useStore(healthStore);
	const folderInputRef = useRef<HTMLInputElement>(null);

	const {
		fileCount,
		totalSize,
		sourceSummary,
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

	const queue: UploadFile[] = sourceSummary
		? [
				{
					id: "apple-health-source",
					name: sourceSummary,
					size: totalSize ?? undefined,
					status: busy
						? "uploading"
						: status === "success"
							? "success"
							: status === "error"
								? "error"
								: status === "cancelled"
									? "cancelled"
									: "queued",
					progress: busy ? healthProgressPercent(progress) : undefined,
					error: error ?? undefined,
				},
			]
		: [];

	useEffect(() => {
		void healthStore.getState().loadTarget();
		return () => {
			void healthStore.getState().reset();
		};
	}, []);

	const handleFolderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const files = e.target.files ? Array.from(e.target.files) : [];
		if (files.length > 0) {
			void state.selectFiles(files);
		}
		// Reset input value so same folder can be reselected if needed
		e.target.value = "";
	};

	return (
		<div className="apple-health-page data-page space-y-6">
			<PageHeader
				title="Apple Health"
				description="导入 Apple 健康导出记录，完整保留体征、睡眠、锻炼及路线细节。"
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
									选择导出文件
								</Text>
								<Text as="p" size="sm" tone="muted">
									支持健康导出的 ZIP 压缩包，或直接选择解压后的完整导出文件夹。
								</Text>
							</div>
						</LayerCard.Header>
						<LayerCard.Body className="space-y-5">
							{/* Hidden input for folder selection */}
							<input
								ref={folderInputRef}
								type="file"
								// @ts-expect-error webkitdirectory is standard in WebKit/Blink/Gecko browsers for folder picker
								webkitdirectory=""
								directory=""
								multiple
								aria-label="选择完整 Apple 健康导出文件夹"
								className="sr-only"
								onChange={handleFolderChange}
								disabled={busy}
							/>

							<FileDropzone
								label="拖入 Apple Health 压缩包"
								description="拖入“导出.zip”或点击浏览。若已解压，也可使用下方按钮选择文件夹。"
								accept=".zip,application/zip,application/x-zip-compressed"
								multiple={false}
								maxFiles={1}
								fileCount={fileCount > 0 ? 1 : 0}
								disabled={busy}
								browseLabel="浏览 ZIP 文件"
								dropLabel="放到这里"
								formatRejection={(item) => `${item.file.name} 无法使用（${item.code}）`}
								onFilesAccepted={(files) => {
									if (files.length > 0) void state.selectFiles(files);
								}}
								onFilesRejected={(items) => {
									const item = items[0];
									state.rejectFiles(
										item ? `${item.file.name} 无法使用（${item.code}）` : "文件未被接受。",
									);
								}}
							/>

							<div className="apple-health-folder-action flex items-center justify-between gap-3 rounded-lg border border-dashed border-basalt-border p-3">
								<div className="space-y-0.5">
									<Text as="p" size="sm" bold>
										选择已解压的文件夹
									</Text>
									<Text as="p" size="xs" tone="muted">
										包含“导出.xml”、workout-routes 路线与 electrocardiograms 附件。
									</Text>
								</div>
								<Button
									type="button"
									variant="outline"
									size="sm"
									disabled={busy}
									onClick={() => folderInputRef.current?.click()}
								>
									<FolderUp size={16} strokeWidth={1.5} className="mr-1.5" aria-hidden="true" />
									选择文件夹
								</Button>
							</div>

							{rejection ? (
								<Banner variant="alert" title="文件提示" description={rejection} />
							) : null}

							<UploadQueue
								label="健康数据导入进度"
								files={queue}
								emptyLabel="未选择文件。请选择完整导出数据包或文件夹。"
								onCancel={() => state.cancel()}
								onRetry={() => void state.retry()}
								onRemove={() => void state.clear()}
								labels={{
									queued: "待处理",
									uploading: status === "reading" ? "整理分析中" : "提交写入中",
									success: "已完成",
									error: "处理中断",
									cancelled: "已取消",
									cancel: "取消",
									retry: "重试",
									remove: "清除",
								}}
							/>

							{progress ? (
								<div className="space-y-1">
									<Text as="p" size="sm" tone="muted">
										{progress.phase === "analyzing"
											? "正在读取与分析健康记录..."
											: progress.phase === "packing"
												? "正在按天整理并压缩维度日包..."
												: progress.phase === "uploading"
													? `已上传 ${progress.completed.toLocaleString()} / ${progress.total.toLocaleString()} 项`
													: "整理完成"}
									</Text>
									{progress.recordCount > 0 ? (
										<Text as="p" size="xs" tone="muted">
											已扫描 {progress.recordCount.toLocaleString()} 条健康记录
										</Text>
									) : null}
								</div>
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
							description="导入已停止。已提交的完整日期会保留，重新导入同一份文件即可继续完成。"
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
										{ label: "UTC 日包", value: `${preview.dayCount.toLocaleString()} 天` },
										{
											label: "健康记录",
											value: `${preview.recordCount.toLocaleString()} 条`,
										},
										{
											label: "运动轨迹点",
											value: `${preview.routePointCount.toLocaleString()} 点`,
										},
										{
											label: "心电采样",
											value: `${preview.ecgSampleCount.toLocaleString()} 点`,
										},
										{
											label: "紧凑包大小",
											value: formatByteSize(preview.payloadBytes),
										},
									]}
								/>

								<div className="space-y-2">
									<Text as="p" size="sm" tone="muted">
										包含 {preview.dimensionCount.toLocaleString()} 个健康维度、
										{preview.seriesCount.toLocaleString()} 个时序维度包，以及{" "}
										{preview.fileCount.toLocaleString()} 个附件资源。
									</Text>
								</div>

								{preview.warnings && preview.warnings.length > 0 ? (
									<Collapsible>
										<CollapsibleTrigger>
											查看数据提示（{preview.warnings.length} 条）
										</CollapsibleTrigger>
										<CollapsibleContent unstyled>
											<div className="mt-2 space-y-1 rounded bg-basalt-muted p-3 text-xs text-basalt-muted-foreground">
												{preview.warnings.map((w, idx) => (
													// biome-ignore lint/suspicious/noArrayIndexKey: warnings are static strings
													<div key={idx}>• {w}</div>
												))}
											</div>
										</CollapsibleContent>
									</Collapsible>
								) : null}

								{receipt ? (
									<div className="rounded-lg bg-basalt-muted p-4 space-y-2">
										<Text as="p" size="sm" bold>
											写入回执统计
										</Text>
										<Text as="p" size="sm" tone="muted">
											已提交 {receipt.committedDays.toLocaleString()} 日 ·{" "}
											{receipt.committedRecords.toLocaleString()} 条记录
											{receipt.insertedDays ? ` · 新增 ${receipt.insertedDays} 日` : ""}
											{receipt.updatedDays ? ` · 更新 ${receipt.updatedDays} 日` : ""}
											{receipt.unchangedDays ? ` · 未变 ${receipt.unchangedDays} 日` : ""}
										</Text>
									</div>
								) : null}

								{status === "success" ? (
									<Banner
										variant="default"
										title="导入完成"
										description="本次健康数据已完整写入。涉及的 UTC 日期维度已更新，可以到每日实录中查看。"
									/>
								) : null}
							</LayerCard.Body>

							<LayerCard.Footer>
								<Button
									onClick={() => void state.startUpload()}
									loading={status === "uploading"}
									disabled={busy || status === "success" || !target}
								>
									开始导入
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
								导入与保留规则
							</Text>
						</LayerCard.Header>
						<LayerCard.Body className="space-y-4">
							<DescriptionList columns={1}>
								<DescriptionList.Item term="原始细节完整保留">
									原始同步标识（UUID）、各类型元数据（Metadata）及运动事件完整保留，不因压缩截断。
								</DescriptionList.Item>
								<DescriptionList.Item term="按天维度替换">
									同一 UTC
									日的健康数据整日替换，包括移除该日此次未包含的维度；本次未包含的日期继续保留。
								</DescriptionList.Item>
								<DescriptionList.Item term="重叠与多设备">
									保留手表与手机各自上报的原始序列，不改变数据源原始记录。
								</DescriptionList.Item>
							</DescriptionList>
							<Text as="p" size="sm" tone="muted">
								累计覆盖天数、数据量和各来源细分统一在数据概览查看。
							</Text>
						</LayerCard.Body>
					</LayerCard>
				</div>
			</div>
		</div>
	);
}
