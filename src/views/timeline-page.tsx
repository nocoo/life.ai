import { Button, LayerCard } from "@nocoo/basalt";
import { Banner } from "@nocoo/basalt/components/banner";
import { FilterBar } from "@nocoo/basalt/components/filter-bar";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@nocoo/basalt/components/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@nocoo/basalt/components/tabs";
import { lazy, Suspense, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router";
import { useStore } from "zustand";
import { DateNavigation } from "../components/date-navigation";
import { DayTimelineView } from "../components/day-timeline";
import { EMPTY_NAMED_PLACES } from "../models/general-settings";
import { localDateKey, shiftLocalDate } from "../models/time";
import {
	dayContextQuery,
	dayContextStore,
	sameDayContext,
} from "../viewmodels/day-context-view-model";
import { daySummaryStore } from "../viewmodels/day-summary-view-model";
import { formatLocalDate } from "../viewmodels/format";
import { generalSettingsStore } from "../viewmodels/general-settings-view-model";
import {
	ALL_SOURCES,
	isSelectedToday,
	type TimelineMapMode,
	type TimelinePageTab,
	timelineStore,
} from "../viewmodels/timeline-view-model";

const DayRecords = lazy(() => import("../components/day-records"));

export function TimelinePage() {
	const [searchParams, setSearchParams] = useSearchParams();
	const linkedDay = searchParams.get("day");
	const day = useStore(timelineStore, (state) => state.day);
	const sourceId = useStore(timelineStore, (state) => state.sourceId);
	const sources = useStore(timelineStore, (state) => state.sources);
	const timeline = useStore(timelineStore, (state) => state.timeline);
	const insights = useStore(timelineStore, (state) => state.insights);
	const story = useStore(timelineStore, (state) => state.story);
	const health = useStore(timelineStore, (state) => state.health);
	const recordsTimeline = useStore(timelineStore, (state) => state.recordsTimeline);
	const recordsStatus = useStore(timelineStore, (state) => state.recordsStatus);
	const recordsError = useStore(timelineStore, (state) => state.recordsError);
	const status = useStore(timelineStore, (state) => state.status);
	const error = useStore(timelineStore, (state) => state.error);
	const radiusKm = useStore(timelineStore, (state) => state.radiusKm);
	const mapMode = useStore(timelineStore, (state) => state.mapMode);
	const tab = useStore(timelineStore, (state) => state.tab);
	const context = useStore(dayContextStore);
	const generalSettings = useStore(generalSettingsStore, (state) => state.settings);
	const settingsStatus = useStore(generalSettingsStore, (state) => state.status);
	const namedPlaces = generalSettings?.places ?? EMPTY_NAMED_PLACES;
	const contextQuery = useMemo(
		() => (timeline && story ? dayContextQuery(timeline, story.places) : null),
		[timeline, story],
	);
	const summaryDate = timeline?.date;
	const summaryStart = timeline?.start;
	const summaryEnd = timeline?.end;
	const summaryTimeZone = timeline?.timezone;

	useEffect(() => {
		timelineStore.getState().setNamedPlaces(namedPlaces);
	}, [namedPlaces]);

	useEffect(() => {
		const state = timelineStore.getState();
		let validDay: string | null = null;
		if (linkedDay) {
			try {
				validDay = shiftLocalDate(linkedDay, 0);
			} catch {
				// A malformed bookmark must not replace the current valid selection.
			}
		}
		if (validDay && validDay !== state.day) void state.selectDay(validDay);
		else void state.load();
	}, [linkedDay]);

	useEffect(() => {
		void dayContextStore.getState().load(contextQuery);
		return () => dayContextStore.getState().abort();
	}, [contextQuery]);

	const selectDay = (next: string) => {
		setSearchParams((previous) => {
			const params = new URLSearchParams(previous);
			params.set("day", next);
			return params;
		});
	};

	useEffect(() => {
		return () => {
			daySummaryStore.getState().abort();
		};
	}, []);

	useEffect(() => {
		if (
			status === "ready" &&
			summaryDate &&
			summaryStart &&
			summaryEnd &&
			summaryTimeZone &&
			settingsStatus !== "idle" &&
			settingsStatus !== "loading"
		) {
			void daySummaryStore.getState().load({
				date: summaryDate,
				start: summaryStart,
				end: summaryEnd,
				timeZone: summaryTimeZone,
			});
		}
		void generalSettings;
	}, [
		status,
		summaryDate,
		summaryStart,
		summaryEnd,
		summaryTimeZone,
		generalSettings,
		settingsStatus,
	]);

	return (
		<Tabs
			value={tab}
			onValueChange={(value) => timelineStore.getState().selectTab(value as TimelinePageTab)}
			className="story-page"
		>
			<div className="story-page-header">
				<PageHeader
					title="每日实录"
					description={formatLocalDate(day)}
					filters={
						<FilterBar
							label="每日记录筛选"
							active={sourceId !== ALL_SOURCES}
							clearLabel="清除来源"
							onClear={() => void timelineStore.getState().selectSource(ALL_SOURCES)}
						>
							<DateNavigation
								day={day}
								isToday={isSelectedToday(day)}
								onPrevDay={() => selectDay(shiftLocalDate(day, -1))}
								onNextDay={() => selectDay(shiftLocalDate(day, 1))}
								onToday={() => selectDay(localDateKey())}
								onSelectDay={selectDay}
							/>
							<Select
								value={sourceId}
								onValueChange={(value) => void timelineStore.getState().selectSource(value)}
							>
								<SelectTrigger aria-label="按来源筛选" className="w-[220px]">
									<SelectValue placeholder="全部来源" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={ALL_SOURCES}>全部来源</SelectItem>
									{sources.map((source) => (
										<SelectItem key={source.id} value={source.id}>
											{source.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							{tab === "timeline" ? (
								<>
									<Select
										value={String(radiusKm)}
										onValueChange={(value) =>
											timelineStore.getState().selectRadius(Number(value) as 5 | 10)
										}
									>
										<SelectTrigger aria-label="位置分组范围" className="w-[160px]">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="5">区域半径 5 km</SelectItem>
											<SelectItem value="10">区域半径 10 km</SelectItem>
										</SelectContent>
									</Select>
									<Select
										value={mapMode}
										onValueChange={(value) =>
											timelineStore.getState().selectMapMode(value as TimelineMapMode)
										}
									>
										<SelectTrigger aria-label="时间线地图" className="w-[200px]">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="auto">展开地图 · 合并重复</SelectItem>
											<SelectItem value="all">展开全部地图</SelectItem>
											<SelectItem value="none">收起全部地图</SelectItem>
										</SelectContent>
									</Select>
								</>
							) : null}
						</FilterBar>
					}
				/>
			</div>
			<TabsList aria-label="每日视图" className="mb-6">
				<TabsTrigger value="timeline">时间线</TabsTrigger>
				<TabsTrigger value="locations">位置记录</TabsTrigger>
				<TabsTrigger value="finance">账目记录</TabsTrigger>
				<TabsTrigger value="records">其他记录</TabsTrigger>
			</TabsList>
			{status === "error" ? (
				<Banner
					variant="error"
					title="无法加载这一天"
					description={error ?? "请重试。"}
					action={
						<Banner.Action onClick={() => void timelineStore.getState().retry()}>
							重试
						</Banner.Action>
					}
				/>
			) : null}
			{status === "loading" && !timeline ? (
				<LayerCard>
					<LayerCard.Loading label="正在加载当天记录" />
				</LayerCard>
			) : null}
			{timeline && story && insights ? (
				<>
					<TabsContent value="timeline">
						{tab === "timeline" ? (
							<DayTimelineView
								key={`${day}:${sourceId}:${radiusKm}`}
								timeline={timeline}
								story={story}
								mapMode={mapMode}
								context={sameDayContext(context.query, contextQuery) ? context : null}
								insights={insights}
								health={health}
							/>
						) : null}
					</TabsContent>
					{(["locations", "finance", "records"] as const).map((kind) => (
						<TabsContent key={kind} value={kind}>
							{tab === kind ? (
								<Suspense
									fallback={
										<LayerCard>
											<LayerCard.Loading label="正在加载记录表格" />
										</LayerCard>
									}
								>
									{kind === "records" && recordsStatus === "loading" ? (
										<LayerCard>
											<LayerCard.Loading label="正在加载全部健康维度" />
										</LayerCard>
									) : kind === "records" && recordsStatus === "error" ? (
										<Banner
											variant="error"
											title="完整记录暂时不可用"
											description={recordsError ?? undefined}
											action={
												<Banner.Action onClick={() => void timelineStore.getState().loadRecords()}>
													重试
												</Banner.Action>
											}
										/>
									) : (
										<DayRecords
											key={`${day}:${sourceId}:${kind}`}
											timeline={kind === "records" ? (recordsTimeline ?? timeline) : timeline}
											kind={kind}
											namedPlaces={namedPlaces}
										/>
									)}
								</Suspense>
							) : null}
						</TabsContent>
					))}
				</>
			) : null}
			{status === "ready" && !timeline ? (
				<LayerCard>
					<LayerCard.Empty
						title="没有可显示的时间线"
						description="请换一天或重试。"
						action={<Button onClick={() => void timelineStore.getState().retry()}>重试</Button>}
					/>
				</LayerCard>
			) : null}
		</Tabs>
	);
}
