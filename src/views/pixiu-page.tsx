import { Badge, Button, DescriptionList, LayerCard, StatStrip, Text } from "@nocoo/basalt";
import { Banner } from "@nocoo/basalt/components/banner";
import { FileDropzone } from "@nocoo/basalt/components/file-dropzone";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import { type UploadFile, UploadQueue } from "@nocoo/basalt/components/upload-queue";
import { ArrowUpRight, CalendarDays, Wallet } from "lucide-react";
import { useEffect } from "react";
import { Link } from "react-router";
import { useStore } from "zustand";
import { dataTargetLabel, timelineDayHref } from "../viewmodels/data-overview-view-model";
import { formatByteSize } from "../viewmodels/format";
import { pixiuStore } from "../viewmodels/pixiu-view-model";

export function PixiuPage() {
	const state = useStore(pixiuStore);
	const { files, plan, status, target, targetError, error, receipt } = state;
	const busy = status === "reading" || status === "uploading";
	const queue: UploadFile[] = files.map((file, index) => ({
		id: String(index),
		name: file.name,
		size: file.size,
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
			status === "uploading" && plan
				? Math.round(((receipt?.committedDays ?? 0) / plan.days.length) * 100)
				: undefined,
	}));
	useEffect(() => {
		void pixiuStore.getState().loadTarget();
		return () => pixiuStore.getState().reset();
	}, []);
	return (
		<div className="data-page space-y-6">
			<PageHeader
				title="貔貅记账"
				description="把一日的花费与收获，放回生活的故事里。"
				actions={
					<Button variant="outline" asChild>
						<Link to="/data">
							查看数据概览 <ArrowUpRight size={16} aria-hidden="true" />
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
									选择 CSV
								</Text>
								<Text as="p" size="sm" tone="muted">
									可以一次选择多个年度导出，先预览再导入。
								</Text>
							</div>
						</LayerCard.Header>
						<LayerCard.Body className="space-y-5">
							<FileDropzone
								label="选择貔貅 CSV"
								description="拖入貔貅导出的 CSV，或从本机选择文件。"
								accept=".csv,text/csv"
								multiple
								maxFiles={32}
								fileCount={0}
								disabled={busy}
								browseLabel="浏览文件"
								dropLabel="放到这里"
								onFilesAccepted={(files) => void state.selectFiles(files)}
								onFilesRejected={() => state.reject("请选择貔貅导出的 CSV 文件，每次最多 32 个。")}
							/>
							<UploadQueue
								label="貔貅导入进度"
								files={queue}
								emptyLabel="支持完整导出，也可以导入包含完整日期的部分文件。"
								onCancel={() => state.cancel()}
								onRetry={() => void (plan ? state.upload() : state.selectFiles(files))}
								onRemove={() => state.clear()}
								labels={{
									queued: "已选",
									uploading: status === "reading" ? "整理中" : "导入中",
									success: "已完成",
									error: "失败",
									cancelled: "已取消",
									cancel: "取消",
									retry: "重试",
									remove: "清除",
								}}
							/>
						</LayerCard.Body>
					</LayerCard>
					{error ? <Banner variant="error" title="导入未完成" description={error} /> : null}
					{status === "cancelled" ? (
						<Banner
							variant="secondary"
							title="已取消"
							description="已提交的日期会保留，可以重新导入同一批文件继续完成。"
						/>
					) : null}
					{plan ? (
						<LayerCard>
							<LayerCard.Header>
								<div className="space-y-1">
									<Text as="h2" variant="heading" size="md">
										本次预览
									</Text>
									<Text as="p" size="sm" tone="muted">
										{plan.firstDate} — {plan.lastDate} · 北京时间记账日
									</Text>
								</div>
							</LayerCard.Header>
							<LayerCard.Body className="space-y-5">
								<StatStrip
									items={[
										{ label: "记账天数", value: plan.days.length.toLocaleString() },
										{ label: "原始记录", value: plan.recordCount.toLocaleString() },
										{ label: "保存行数", value: plan.days.length.toLocaleString() },
										{ label: "整理后大小", value: formatByteSize(plan.payloadBytes) },
									]}
								/>
								<Text as="p" size="sm" tone="muted">
									完整保留分类、类型、金额、币种、账户、标签和备注。同一天以本次导入为准。
								</Text>
								{receipt ? (
									<Text as="p" size="sm">
										已处理 {receipt.committedDays.toLocaleString()} 天 ·{" "}
										{receipt.committedPoints.toLocaleString()} 条；新增 {receipt.insertedDays}{" "}
										天，更新 {receipt.updatedDays} 天，未变 {receipt.unchangedDays} 天。
									</Text>
								) : null}
								{status === "success" ? (
									<Banner
										variant="default"
										title="导入完成"
										description="账目已汇入每日实录的全天区域，累计统计可在数据概览查看。"
									/>
								) : null}
							</LayerCard.Body>
							<LayerCard.Footer className="flex flex-wrap gap-3">
								<Button
									onClick={() => void state.upload()}
									loading={status === "uploading"}
									disabled={busy || !target || status === "success"}
								>
									<Wallet size={16} aria-hidden="true" />
									开始导入
								</Button>
								{status === "success" ? (
									<Button variant="outline" asChild>
										<Link to={timelineDayHref(Date.parse(plan.lastDate), "pixiu")}>
											<CalendarDays size={16} aria-hidden="true" />
											回看这一天
										</Link>
									</Button>
								) : null}
							</LayerCard.Footer>
						</LayerCard>
					) : null}
				</div>
				<div className="min-w-0 space-y-6">
					<LayerCard>
						<LayerCard.Header>
							<Text as="h2" variant="heading" size="md">
								按记账日整理
							</Text>
						</LayerCard.Header>
						<LayerCard.Body className="space-y-5">
							<Badge>北京时间 · UTC+8</Badge>
							<DescriptionList columns={1}>
								<DescriptionList.Item term="一天一份">
									同一天的新记录整日覆盖旧记录；相同内容不重复写入。文件未包含的日期保留。
								</DescriptionList.Item>
								<DescriptionList.Item term="仅有日期">
									账目没有时分秒，会放在每日实录的全天区域，陪伴这一天的故事。
								</DescriptionList.Item>
								<DescriptionList.Item term="保留原貌">
									重复项目、零金额和不同币种都会保留。转账、还款和投资等按原始分类区分。
								</DescriptionList.Item>
							</DescriptionList>
						</LayerCard.Body>
					</LayerCard>
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
						) : targetError ? (
							<LayerCard.Body>
								<Banner
									variant="error"
									title="无法确认数据环境"
									description={targetError}
									action={
										<Banner.Action onClick={() => void state.loadTarget()}>重新读取</Banner.Action>
									}
								/>
							</LayerCard.Body>
						) : (
							<LayerCard.Loading label="正在确认数据环境" />
						)}
					</LayerCard>
				</div>
			</div>
		</div>
	);
}
