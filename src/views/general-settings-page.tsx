import { Button, ConfirmDialog, Field, Input, LayerCard, Switch, Text } from "@nocoo/basalt";
import { Banner } from "@nocoo/basalt/components/banner";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import { MapPinned, Moon, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useStore } from "zustand";
import { PlaceListSkeleton, RoutineSkeleton } from "../components/page-skeletons";
import { PlaceRegionEditor } from "../components/place-region-editor";
import {
	MAX_NAMED_PLACES,
	type NamedPlace,
	routineDurationMinutes,
} from "../models/general-settings";
import { generalSettingsStore } from "../viewmodels/general-settings-view-model";
import { timelineStore } from "../viewmodels/timeline-view-model";
import "./general-settings-page.css";

export function GeneralSettingsPage() {
	const settings = useStore(generalSettingsStore, (state) => state.settings);
	const status = useStore(generalSettingsStore, (state) => state.status);
	const error = useStore(generalSettingsStore, (state) => state.error);
	const expired = useStore(generalSettingsStore, (state) => state.expired);
	const saving = useStore(generalSettingsStore, (state) => state.saving);
	const message = useStore(generalSettingsStore, (state) => state.message);
	const placeDraft = useStore(generalSettingsStore, (state) => state.placeDraft);
	const routineDraft = useStore(generalSettingsStore, (state) => state.routineDraft);
	const routineEnabled = useStore(generalSettingsStore, (state) => state.routineEnabled);
	const [pendingDelete, setPendingDelete] = useState<NamedPlace | null>(null);
	const busy = saving || status !== "ready";
	const loading = !settings && (status === "idle" || status === "loading");
	const places = settings?.places ?? [];
	const canAdd = places.length < MAX_NAMED_PLACES;
	const duration =
		routineEnabled && routineDraft.bedtime && routineDraft.wakeTime
			? routineDurationMinutes(routineDraft)
			: null;

	useEffect(() => {
		void generalSettingsStore.getState().load();
		return () => {
			const store = generalSettingsStore.getState();
			if (!store.saving) store.cancelPlace();
		};
	}, []);

	return (
		<div className="min-w-0 space-y-6">
			<PageHeader
				title="通用设置"
				description="记下常去的地方，以及你习惯的入睡和起床时间。日记会用它们理解一天的节奏，而不会替你下结论。"
			/>
			{status === "error" ? (
				<Banner
					variant="error"
					title={expired ? "会话已过期" : "无法读取设置"}
					description={expired ? "请重新登录后再试。" : (error ?? "请重试。")}
					action={
						expired ? (
							<Banner.Action onClick={() => window.location.reload()}>重新登录</Banner.Action>
						) : (
							<Banner.Action onClick={() => void generalSettingsStore.getState().load()}>
								重试
							</Banner.Action>
						)
					}
				/>
			) : null}
			{error && status !== "error" ? (
				<Banner variant="error" title="保存失败" description={error} />
			) : null}
			{message ? <Banner variant="default" title={message} /> : null}
			<div className="general-settings-layout">
				<LayerCard>
					<LayerCard.Header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2">
						<div className="flex min-w-0 items-center gap-3">
							<MapPinned className="h-5 w-5 shrink-0" strokeWidth={1.6} aria-hidden="true" />
							<Text as="h2" variant="heading" size="md">
								常用地点
							</Text>
						</div>
						<Button
							size="sm"
							variant="outline"
							className="shrink-0 whitespace-nowrap text-basalt-foreground"
							disabled={busy || !canAdd || Boolean(placeDraft)}
							onClick={() => {
								const seed = timelineStore.getState().story?.places.representativePlace?.anchor;
								generalSettingsStore.getState().beginPlace(undefined, seed);
							}}
						>
							<Plus size={14} strokeWidth={1.6} aria-hidden="true" />
							添加地点
						</Button>
						<Text as="p" size="sm" tone="muted" className="col-span-2">
							给家、公司或其他常去的地方起名，并画出大概范围。这些名称会出现在时间线与日记里。
						</Text>
					</LayerCard.Header>
					<LayerCard.Body className="space-y-4">
						{loading ? (
							<PlaceListSkeleton />
						) : settings ? (
							<>
								{places.length === 0 && !placeDraft ? (
									<Text as="p" size="sm" tone="muted">
										还没有常用地点。添加后，足迹会更容易对上你熟悉的地方。
									</Text>
								) : (
									<ul className="space-y-2">
										{places.map((place) => (
											<li key={place.id}>
												<LayerCard.Well>
													<div className="flex flex-wrap items-start justify-between gap-3">
														<div className="min-w-0">
															<Text as="p" bold>
																{place.label}
															</Text>
															<Text as="p" size="sm" tone="muted">
																{place.latitude.toFixed(4)}, {place.longitude.toFixed(4)} ·{" "}
																{place.radiusMeters} 米
															</Text>
														</div>
														<div className="flex flex-wrap gap-2">
															<Button
																size="sm"
																variant="ghost"
																disabled={busy}
																onClick={() => generalSettingsStore.getState().beginPlace(place)}
															>
																编辑
															</Button>
															<Button
																size="sm"
																variant="ghost"
																disabled={busy}
																onClick={() => setPendingDelete(place)}
															>
																删除
															</Button>
														</div>
													</div>
												</LayerCard.Well>
											</li>
										))}
									</ul>
								)}
								{!canAdd ? (
									<Text as="p" size="sm" tone="muted">
										最多保存 {MAX_NAMED_PLACES} 个地点。
									</Text>
								) : null}
								{placeDraft ? (
									<form
										className="space-y-4 border-t border-basalt-border/70 pt-4"
										onSubmit={(event) => {
											event.preventDefault();
											void generalSettingsStore.getState().savePlace();
										}}
									>
										<Text as="h3" variant="heading" size="sm">
											{placeDraft.id ? "编辑地点" : "新地点"}
										</Text>
										<PlaceRegionEditor
											label={placeDraft.label}
											center={placeDraft.center}
											radiusMeters={placeDraft.radiusMeters}
											disabled={busy}
											onLabelChange={(value) =>
												generalSettingsStore.getState().setPlaceDraft({ label: value })
											}
											onCenterChange={(value) =>
												generalSettingsStore.getState().setPlaceDraft({ center: value })
											}
											onRadiusChange={(value) =>
												generalSettingsStore.getState().setPlaceDraft({ radiusMeters: value })
											}
										/>
										<div className="flex flex-wrap gap-2">
											<Button
												type="submit"
												loading={saving}
												disabled={busy || !placeDraft.center || !placeDraft.label.trim()}
											>
												保存地点
											</Button>
											<Button
												type="button"
												variant="ghost"
												disabled={saving}
												onClick={() => generalSettingsStore.getState().cancelPlace()}
											>
												取消
											</Button>
										</div>
									</form>
								) : null}
							</>
						) : null}
					</LayerCard.Body>
				</LayerCard>

				<LayerCard>
					<LayerCard.Header>
						<div className="flex min-w-0 items-start gap-3">
							<Moon className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={1.6} aria-hidden="true" />
							<div className="min-w-0">
								<Text as="h2" variant="heading" size="md">
									惯常作息
								</Text>
								<Text as="p" size="sm" tone="muted">
									这是你通常入睡和起床的时间，用来理解生活节奏。它不是某天手表量到的睡眠，也可以随时关掉。
								</Text>
							</div>
						</div>
					</LayerCard.Header>
					<LayerCard.Body className="space-y-4">
						{loading ? (
							<RoutineSkeleton />
						) : settings ? (
							<>
								<div className="flex items-center justify-between gap-3">
									<Text as="p" size="sm">
										记录惯常作息
									</Text>
									<Switch
										checked={routineEnabled}
										disabled={busy}
										aria-label="记录惯常作息"
										onCheckedChange={(checked) =>
											generalSettingsStore.getState().setRoutineEnabled(checked)
										}
									/>
								</div>
								<Field label="入睡时间" htmlFor="routine-bedtime">
									<Input
										id="routine-bedtime"
										type="time"
										value={routineDraft.bedtime}
										disabled={busy || !routineEnabled}
										onChange={(event) =>
											generalSettingsStore
												.getState()
												.setRoutineDraft({ bedtime: event.target.value })
										}
									/>
								</Field>
								<Field label="起床时间" htmlFor="routine-waketime">
									<Input
										id="routine-waketime"
										type="time"
										value={routineDraft.wakeTime}
										disabled={busy || !routineEnabled}
										onChange={(event) =>
											generalSettingsStore.getState().setRoutineDraft({
												wakeTime: event.target.value,
											})
										}
									/>
								</Field>
								<Field label="时区" htmlFor="routine-timezone">
									<Input
										id="routine-timezone"
										value={routineDraft.timeZone}
										disabled={busy || !routineEnabled}
										onChange={(event) =>
											generalSettingsStore.getState().setRoutineDraft({
												timeZone: event.target.value,
											})
										}
										placeholder="例如 Asia/Shanghai"
									/>
								</Field>
								{duration !== null && duration > 0 ? (
									<Text as="p" size="sm" tone="muted">
										这段惯常作息大约 {formatDuration(duration)}。跨过午夜也没问题。
									</Text>
								) : null}
								<Button
									onClick={() => void generalSettingsStore.getState().saveRoutine()}
									loading={saving}
									disabled={busy}
								>
									保存作息
								</Button>
							</>
						) : null}
					</LayerCard.Body>
				</LayerCard>
			</div>
			<ConfirmDialog
				open={Boolean(pendingDelete)}
				onOpenChange={(open) => {
					if (!open) setPendingDelete(null);
				}}
				title={pendingDelete ? `删除「${pendingDelete.label}」？` : "删除地点"}
				description="删除后，足迹和日记不再用这个名称来理解该范围。"
				confirmLabel="删除"
				cancelLabel="取消"
				variant="destructive"
				loading={saving}
				onConfirm={async () => {
					if (!pendingDelete) return;
					const ok = await generalSettingsStore.getState().deletePlace(pendingDelete.id);
					if (ok) setPendingDelete(null);
				}}
			/>
		</div>
	);
}

function formatDuration(minutes: number): string {
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	if (hours && rest) return `${hours} 小时 ${rest} 分钟`;
	if (hours) return `${hours} 小时`;
	return `${rest} 分钟`;
}
