import { Button, Field, LayerCard, SegmentControl, Text } from "@nocoo/basalt";
import { Banner } from "@nocoo/basalt/components/banner";
import { FileDropzone } from "@nocoo/basalt/components/file-dropzone";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import { type UploadFile, UploadQueue } from "@nocoo/basalt/components/upload-queue";
import { useStore } from "zustand";
import { formatByteSize } from "../viewmodels/format";
import {
	IMPORT_SOURCES,
	importProgressPercent,
	importSourceMeta,
	importStore,
} from "../viewmodels/import-view-model";

function queueEntry(): UploadFile[] {
	const state = importStore.getState();
	if (!state.fileName) {
		return [];
	}
	const status =
		state.status === "running"
			? "uploading"
			: state.status === "success"
				? "success"
				: state.status === "error"
					? "error"
					: state.status === "cancelled"
						? "cancelled"
						: "queued";
	return [
		{
			id: "current",
			name: state.fileName,
			size: state.fileSize ?? undefined,
			status,
			progress: importProgressPercent(state.progress),
			error: state.error ?? undefined,
		},
	];
}

export function ImportsPage() {
	const source = useStore(importStore, (state) => state.source);
	const fileName = useStore(importStore, (state) => state.fileName);
	const fileSize = useStore(importStore, (state) => state.fileSize);
	const status = useStore(importStore, (state) => state.status);
	const progress = useStore(importStore, (state) => state.progress);
	const processed = useStore(importStore, (state) => state.processed);
	const accepted = useStore(importStore, (state) => state.accepted);
	const error = useStore(importStore, (state) => state.error);
	const rejection = useStore(importStore, (state) => state.rejection);
	const meta = importSourceMeta(source);
	const running = status === "running";

	return (
		<div className="space-y-6">
			<PageHeader
				title="导入"
				description="选择来源与导出文件。同一文件再导一次会更新已有记录，不会重复。可随时取消。"
			/>
			<LayerCard>
				<LayerCard.Header>
					<Text as="h2" variant="heading" size="md">
						来源与文件
					</Text>
				</LayerCard.Header>
				<LayerCard.Body className="space-y-4">
					<SegmentControl
						legend="导入来源"
						value={source}
						onValueChange={(value) => importStore.getState().setSource(value as typeof source)}
						disabled={running}
						options={IMPORT_SOURCES.map((item) => ({ value: item.id, label: item.label }))}
					/>
					<FileDropzone
						label={`选择 ${meta.label} 文件`}
						description={meta.hint}
						accept={meta.accept}
						multiple={false}
						maxFiles={1}
						fileCount={fileName ? 1 : 0}
						disabled={running}
						browseLabel="浏览文件"
						dropLabel="放到这里"
						formatRejection={(rejection) => `${rejection.file.name} 无法使用（${rejection.code}）`}
						onFilesAccepted={(files) => {
							const file = files[0];
							if (file) {
								importStore.getState().selectFile(file);
							}
						}}
						onFilesRejected={(rejections) => {
							const first = rejections[0];
							importStore
								.getState()
								.rejectFile(
									first ? `${first.file.name} 无法使用（${first.code}）` : "文件未被接受。",
								);
						}}
					/>
					{rejection ? <Banner variant="alert" title="文件未接受" description={rejection} /> : null}
					{fileName ? (
						<Field label="待导入文件" hint={meta.hint}>
							<Text as="p">
								{fileName}
								{fileSize !== null ? ` · ${formatByteSize(fileSize)}` : ""}
							</Text>
						</Field>
					) : null}
					<div className="flex flex-wrap gap-2">
						<Button
							onClick={() => void importStore.getState().start()}
							loading={running}
							disabled={!fileName || running}
						>
							开始导入
						</Button>
						<Button
							variant="outline"
							onClick={() => importStore.getState().cancel()}
							disabled={!running}
						>
							取消
						</Button>
						<Button
							variant="ghost"
							onClick={() => importStore.getState().clear()}
							disabled={running}
						>
							清除
						</Button>
					</div>
				</LayerCard.Body>
			</LayerCard>
			<LayerCard>
				<LayerCard.Header>
					<Text as="h2" variant="heading" size="md">
						进度
					</Text>
				</LayerCard.Header>
				<LayerCard.Body className="space-y-4">
					{status === "error" && error ? (
						<Banner
							variant="error"
							title="导入失败"
							description={error}
							action={
								<Banner.Action onClick={() => void importStore.getState().retry()}>
									重试
								</Banner.Action>
							}
						/>
					) : null}
					{status === "success" ? (
						<Banner
							variant="default"
							title="导入完成"
							description={`已处理 ${processed} 条，接受 ${accepted} 条。再次导入同一文件会更新已有记录。`}
						/>
					) : null}
					{status === "cancelled" ? (
						<Banner variant="secondary" title="已取消" description="未完成的导入已停止。" />
					) : null}
					<UploadQueue
						label="导入队列"
						files={queueEntry()}
						emptyLabel="还没有选择文件。"
						onCancel={() => importStore.getState().cancel()}
						onRetry={() => void importStore.getState().retry()}
						onRemove={() => importStore.getState().clear()}
						labels={{
							queued: "待开始",
							uploading: "导入中",
							success: "完成",
							error: "失败",
							cancelled: "已取消",
							cancel: "取消",
							retry: "重试",
							remove: "移除",
						}}
					/>
					{progress ? (
						<Text as="p" size="sm" tone="muted">
							已读 {formatByteSize(progress.bytesRead)} / {formatByteSize(progress.totalBytes)} ·
							处理 {progress.processed} · 接受 {progress.accepted}
						</Text>
					) : null}
				</LayerCard.Body>
			</LayerCard>
		</div>
	);
}
