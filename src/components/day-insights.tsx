import { DescriptionList, LayerCard, StatStrip, Text } from "@nocoo/basalt";
import { Empty } from "@nocoo/basalt/components/empty";
import type { DayInsights } from "../models/day-insights";
import { formatDurationMinutes, formatLocalClock } from "../viewmodels/format";

function meters(value: number | null): string {
	if (value === null) {
		return "—";
	}
	if (value >= 1000) {
		return `${(value / 1000).toFixed(2)} km`;
	}
	return `${Math.round(value)} m`;
}

function count(value: number | null, suffix: string): string {
	if (value === null) {
		return "—";
	}
	return `${Math.round(value)} ${suffix}`;
}

export function DayInsightsCard({ insights }: { insights: DayInsights }) {
	const health = insights.health;
	const hasHealth =
		health.steps !== null ||
		health.distanceMeters !== null ||
		health.flights !== null ||
		health.heartRate !== null ||
		health.sleepMinutes !== null ||
		health.waterMl !== null ||
		health.energyKcal !== null ||
		health.exerciseMinutes !== null ||
		health.standHours !== null;
	return (
		<div className="space-y-6">
			<LayerCard>
				<LayerCard.Header>
					<Text as="h2" variant="heading" size="md">
						当日概览
					</Text>
					<Text as="p" size="sm" tone="muted">
						健康、运动与记账汇总。原始记录仍在下方时间线。
					</Text>
				</LayerCard.Header>
				<LayerCard.Body className="space-y-4">
					{hasHealth ? (
						<StatStrip
							items={[
								{ label: "步数", value: count(health.steps, "步") },
								{ label: "步行距离", value: meters(health.distanceMeters) },
								{ label: "爬楼", value: count(health.flights, "层") },
								{
									label: "心率",
									value: health.heartRate
										? `${Math.round(health.heartRate.average)}（${Math.round(health.heartRate.min)}–${Math.round(health.heartRate.max)}）`
										: "—",
								},
								{ label: "睡眠", value: formatDurationMinutes(health.sleepMinutes) },
								{
									label: "饮水",
									value: health.waterMl === null ? "—" : `${Math.round(health.waterMl)} ml`,
								},
								{
									label: "活动能量",
									value: health.energyKcal === null ? "—" : `${Math.round(health.energyKcal)} kcal`,
								},
								{ label: "锻炼", value: formatDurationMinutes(health.exerciseMinutes) },
								{
									label: "站立",
									value: formatDurationMinutes(
										health.standHours === null ? null : health.standHours * 60,
									),
								},
							]}
						/>
					) : (
						<Empty
							title="没有健康汇总"
							description="导入 Apple Health 后会显示步数、睡眠和心率。"
						/>
					)}
					{health.sleepStages.length > 0 ? (
						<DescriptionList columns={2}>
							{health.sleepStages.map((stage) => (
								<DescriptionList.Item key={stage.name} term={stage.name}>
									{formatDurationMinutes(stage.minutes)}
								</DescriptionList.Item>
							))}
						</DescriptionList>
					) : null}
				</LayerCard.Body>
			</LayerCard>
			<LayerCard>
				<LayerCard.Header>
					<Text as="h2" variant="heading" size="md">
						运动
					</Text>
					<Text as="p" size="sm" tone="muted">
						{insights.workoutCount} 次
						{insights.workoutCount > insights.workouts.length ? ` · 列表最多 100 条` : ""}
					</Text>
				</LayerCard.Header>
				<LayerCard.Body>
					{insights.workoutCount === 0 ? (
						<Empty title="没有运动记录" description="当天没有 Workout 记录。" />
					) : (
						<div className="space-y-3">
							{insights.workouts.map((workout) => (
								<LayerCard.Well key={workout.id}>
									<Text as="p" bold>
										{workout.title}
									</Text>
									<Text as="p" size="sm" tone="muted">
										{[
											formatLocalClock(workout.occurredAt, workout.precision) ?? "全天",
											formatDurationMinutes(workout.durationMinutes),
											meters(workout.distanceMeters),
											workout.energyKcal === null ? null : `${Math.round(workout.energyKcal)} kcal`,
										]
											.filter(Boolean)
											.join(" · ")}
									</Text>
								</LayerCard.Well>
							))}
						</div>
					)}
				</LayerCard.Body>
			</LayerCard>
			<LayerCard>
				<LayerCard.Header>
					<Text as="h2" variant="heading" size="md">
						记账
					</Text>
				</LayerCard.Header>
				<LayerCard.Body>
					{insights.finance.length === 0 ? (
						<Empty title="没有记账记录" description="导入貔貅 CSV 后会按币种汇总。" />
					) : (
						<div className="space-y-3">
							{insights.finance.map((row) => (
								<LayerCard.Well key={row.currency}>
									<Text as="p" bold>
										{row.currency}
									</Text>
									<DescriptionList columns={2}>
										<DescriptionList.Item term="收入">{row.income.toFixed(2)}</DescriptionList.Item>
										<DescriptionList.Item term="支出">
											{row.expense.toFixed(2)}
										</DescriptionList.Item>
										<DescriptionList.Item term="转账">
											{row.transfers.toFixed(2)}
										</DescriptionList.Item>
										<DescriptionList.Item term="笔数">{String(row.count)}</DescriptionList.Item>
									</DescriptionList>
								</LayerCard.Well>
							))}
						</div>
					)}
				</LayerCard.Body>
			</LayerCard>
		</div>
	);
}
