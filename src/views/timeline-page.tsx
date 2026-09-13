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
import { useEffect } from "react";
import { useStore } from "zustand";
import { DateNavigation } from "../components/date-navigation";
import { DayInsightsCard } from "../components/day-insights";
import { DayMap } from "../components/day-map";
import { DaySummaryCard } from "../components/day-summary";
import { DayTimelineView } from "../components/day-timeline";
import { daySummaryStore, summaryQueryFromTimeline } from "../viewmodels/day-summary-view-model";
import { formatLocalDate } from "../viewmodels/format";
import { ALL_SOURCES, isSelectedToday, timelineStore } from "../viewmodels/timeline-view-model";

export function TimelinePage() {
	const day = useStore(timelineStore, (state) => state.day);
	const sourceId = useStore(timelineStore, (state) => state.sourceId);
	const sources = useStore(timelineStore, (state) => state.sources);
	const timeline = useStore(timelineStore, (state) => state.timeline);
	const insights = useStore(timelineStore, (state) => state.insights);
	const status = useStore(timelineStore, (state) => state.status);
	const error = useStore(timelineStore, (state) => state.error);
	const summaryDate = timeline?.date;
	const summaryStart = timeline?.start;
	const summaryEnd = timeline?.end;
	const summaryTimeZone = timeline?.timezone;

	useEffect(() => {
		void timelineStore.getState().load();
	}, []);

	useEffect(() => {
		return () => {
			daySummaryStore.getState().abort();
		};
	}, []);

	useEffect(() => {
		if (status === "ready" && summaryDate && summaryStart && summaryEnd && summaryTimeZone) {
			void daySummaryStore.getState().load({
				date: summaryDate,
				start: summaryStart,
				end: summaryEnd,
				timeZone: summaryTimeZone,
			});
		}
	}, [status, summaryDate, summaryStart, summaryEnd, summaryTimeZone]);

	return (
		<div className="space-y-6">
			<PageHeader
				title="时间线"
				description={`${formatLocalDate(day)} · 24 个本地小时与全天记录`}
				filters={
					<FilterBar
						label="时间线筛选"
						active={sourceId !== ALL_SOURCES}
						clearLabel="清除来源"
						onClear={() => void timelineStore.getState().selectSource(ALL_SOURCES)}
					>
						<DateNavigation
							day={day}
							isToday={isSelectedToday(day)}
							onPrevDay={() => void timelineStore.getState().shiftDay(-1)}
							onNextDay={() => void timelineStore.getState().shiftDay(1)}
							onToday={() => void timelineStore.getState().goToday()}
							onSelectDay={(next) => void timelineStore.getState().selectDay(next)}
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
					</FilterBar>
				}
			/>
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
					<LayerCard.Loading label="正在加载时间线" />
				</LayerCard>
			) : null}
			{timeline ? <DaySummaryCard query={summaryQueryFromTimeline(timeline)} /> : null}
			{insights ? <DayInsightsCard insights={insights} /> : null}
			{insights ? <DayMap insights={insights} /> : null}
			{timeline ? <DayTimelineView timeline={timeline} /> : null}
			{status === "ready" && !timeline ? (
				<LayerCard>
					<LayerCard.Empty
						title="没有可显示的时间线"
						description="请换一天或重试。"
						action={<Button onClick={() => void timelineStore.getState().retry()}>重试</Button>}
					/>
				</LayerCard>
			) : null}
		</div>
	);
}
