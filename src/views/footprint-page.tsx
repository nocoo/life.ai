import {
	Button,
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
	Field,
	LayerCard,
	Text,
} from "@nocoo/basalt";
import { Banner } from "@nocoo/basalt/components/banner";
import { FileDropzone } from "@nocoo/basalt/components/file-dropzone";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import { useEffect } from "react";
import { useStore } from "zustand";
import { dataTargetLabel, utcDayKey } from "../viewmodels/data-overview-view-model";
import { footprintParsePercent, footprintStore } from "../viewmodels/footprint-view-model";
import { formatAbsoluteTime, formatByteSize } from "../viewmodels/format";

export function FootprintPage() {
	const fileName = useStore(footprintStore, (state) => state.fileName);
	const fileSize = useStore(footprintStore, (state) => state.fileSize);
	const target = useStore(footprintStore, (state) => state.target);
	const status = useStore(footprintStore, (state) => state.status);
	const progress = useStore(footprintStore, (state) => state.progress);
	const preview = useStore(footprintStore, (state) => state.preview);
	const receipt = useStore(footprintStore, (state) => state.receipt);
	const error = useStore(footprintStore, (state) => state.error);
	const rejection = useStore(footprintStore, (state) => state.rejection);
	const busy = status === "reading" || status === "uploading";
	const percent = footprintParsePercent(progress);

	useEffect(() => {
		void footprintStore.getState().loadTarget();
		return () => {
			footprintStore.getState().reset();
		};
	}, []);

	return (
		<div className="data-page space-y-6">
			<PageHeader
				title="Footprint"
				description="在浏览器整理完整 GPX 后再提交。同一 UTC 日整日替换；文件没有的日期保持原样。"
			/>
			{target ? (
				<Text as="p" size="sm" tone="muted">
					{dataTargetLabel(target)}
				</Text>
			) : null}
			<LayerCard>
				<LayerCard.Header>
					<Text as="h2" variant="heading" size="md">
						选择 GPX
					</Text>
				</LayerCard.Header>
				<LayerCard.Body className="space-y-4">
					<FileDropzone
						label="选择 footprint GPX"
						description="解析在后台进行。全部日期归并完成后才会出现预览。"
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
							if (file) {
								void footprintStore.getState().selectFile(file);
							}
						}}
						onFilesRejected={(rejections) => {
							const first = rejections[0];
							footprintStore
								.getState()
								.rejectFile(
									first ? `${first.file.name} 无法使用（${first.code}）` : "文件未被接受。",
								);
						}}
					/>
					{rejection ? <Banner variant="alert" title="文件未接受" description={rejection} /> : null}
					{fileName ? (
						<Field label="当前文件">
							<Text as="p">
								{fileName}
								{fileSize !== null ? ` · ${formatByteSize(fileSize)}` : ""}
							</Text>
						</Field>
					) : null}
					{progress ? (
						<Text as="p" size="sm" tone="muted">
							已读 {formatByteSize(progress.bytesRead)}
							{progress.totalBytes > 0 ? ` / ${formatByteSize(progress.totalBytes)}` : ""}
							{percent !== undefined ? ` · ${percent}%` : ""} · {progress.pointCount} 点
						</Text>
					) : null}
					<div className="flex flex-wrap gap-2">
						<Button
							variant="outline"
							onClick={() => footprintStore.getState().cancel()}
							disabled={!busy}
						>
							取消
						</Button>
						<Button
							variant="ghost"
							onClick={() => footprintStore.getState().clear()}
							disabled={busy}
						>
							清除
						</Button>
					</div>
				</LayerCard.Body>
			</LayerCard>
			{status === "error" && error ? (
				<Banner
					variant="error"
					title={preview ? "提交失败" : "解析失败"}
					description={error}
					action={
						<Banner.Action onClick={() => void footprintStore.getState().retry()}>
							重试
						</Banner.Action>
					}
				/>
			) : null}
			{status === "cancelled" ? (
				<Banner variant="secondary" title="已取消" description="未完成的解析或提交已停止。" />
			) : null}
			{preview ? (
				<LayerCard>
					<LayerCard.Header>
						<Text as="h2" variant="heading" size="md">
							本次预览
						</Text>
						<Text as="p" size="sm" tone="muted">
							此次文件包含的 UTC 日期将整日替换，文件未包含的日期保留。
						</Text>
					</LayerCard.Header>
					<LayerCard.Body className="space-y-4">
						<Text as="p">
							{preview.days.length} 个 UTC 日 · {preview.pointCount} 点 · 正文{" "}
							{formatByteSize(preview.payloadBytes)}
						</Text>
						<Text as="p" size="sm" tone="muted">
							{formatAbsoluteTime(new Date(preview.firstAt).toISOString())} —{" "}
							{formatAbsoluteTime(new Date(preview.lastAt).toISOString())}
						</Text>
						{preview.days.length <= 12 ? (
							<div className="data-preview-days">
								{preview.days.map((day) => (
									<div
										key={day.utcDay}
										className="data-preview-day"
										title={`${utcDayKey(day.utcDay)} UTC，${day.recordCount} 点`}
									>
										<span>{utcDayKey(day.utcDay)}</span>
										<span>{day.recordCount} 点</span>
									</div>
								))}
							</div>
						) : (
							<Collapsible>
								<CollapsibleTrigger>{`查看 ${preview.days.length} 个 UTC 日`}</CollapsibleTrigger>
								<CollapsibleContent>
									<div className="data-preview-days">
										{preview.days.map((day) => (
											<div
												key={day.utcDay}
												className="data-preview-day"
												title={`${utcDayKey(day.utcDay)} UTC，${day.recordCount} 点`}
											>
												<span>{utcDayKey(day.utcDay)}</span>
												<span>{day.recordCount} 点</span>
											</div>
										))}
									</div>
								</CollapsibleContent>
							</Collapsible>
						)}
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
								description="本次文件中的日期已按整日替换。"
							/>
						) : null}
						<Button
							onClick={() => void footprintStore.getState().startUpload()}
							loading={status === "uploading"}
							disabled={busy || status === "success"}
						>
							开始上传
						</Button>
					</LayerCard.Body>
				</LayerCard>
			) : null}
		</div>
	);
}
