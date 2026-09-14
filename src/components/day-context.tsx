import { DescriptionList, LayerCard, Text } from "@nocoo/basalt";
import { Banner } from "@nocoo/basalt/components/banner";
import { CloudSun, Sunrise, Sunset } from "lucide-react";
import { weatherDescription } from "../models/day-context";
import { type DayContextState, dayContextStore } from "../viewmodels/day-context-view-model";
import { formatDurationMinutes } from "../viewmodels/format";

export function DayContextCard({
	context,
	reference,
	hasLocation,
}: {
	context: DayContextState | null;
	reference: string;
	hasLocation: boolean;
}) {
	const weather = context?.weather;
	const sun = context?.sun;
	return (
		<LayerCard className="day-context-card">
			<LayerCard.Header>
				<Text as="h2" variant="heading" size="md">
					天气与天光
				</Text>
				<Text as="p" size="sm" tone="muted">
					{hasLocation ? reference : "需要当天的参考位置"}
				</Text>
			</LayerCard.Header>
			{!hasLocation ? (
				<LayerCard.Empty
					title="还没有位置记录"
					description="有位置记录后，这里会显示对应区域的天气与日出日落。"
				/>
			) : (
				<LayerCard.Body className="space-y-5">
					{!context || context.weatherStatus === "loading" ? (
						<LayerCard.Loading label="正在读取天气" />
					) : null}
					{weather ? (
						<>
							<div className="day-weather-current">
								<CloudSun size={32} strokeWidth={1.2} aria-hidden="true" />
								<div>
									<Text as="p" variant="heading" size="lg">
										{weatherDescription(weather.weatherCode)}
									</Text>
									<Text as="p" size="sm" tone="muted">
										{weather.temperatureMin === null ? "—" : weather.temperatureMin.toFixed(1)} —{" "}
										{weather.temperatureMax === null ? "—" : weather.temperatureMax.toFixed(1)} °C
									</Text>
								</div>
							</div>
							<DescriptionList columns={2}>
								<DescriptionList.Item term="全天降水">
									{weather.precipitationMm === null
										? "资料不足"
										: `${weather.precipitationMm.toFixed(1)} mm`}
								</DescriptionList.Item>
								<DescriptionList.Item term="最大风速">
									{weather.windMaxKmh === null
										? "资料不足"
										: `${weather.windMaxKmh.toFixed(1)} km/h`}
								</DescriptionList.Item>
							</DescriptionList>
							<Text as="p" size="xs" tone="muted">
								{weather.kind === "historical" ? "历史天气 · 模型再分析" : "天气预报 · 模型资料"}
								{!weather.complete
									? ` · 部分资料（${weather.sampleCount}/${weather.expectedSamples} 个温度样本）`
									: ""}
							</Text>
						</>
					) : null}
					{context?.weatherStatus === "unavailable" ? (
						<Text as="p" size="sm" tone="muted">
							这一天超出了天气服务的可用日期范围。
						</Text>
					) : null}
					{context?.sunStatus === "loading" ? <LayerCard.Loading label="正在读取日出日落" /> : null}
					{sun ? (
						<div className="space-y-3">
							<div className="day-solar-times">
								{context.solar.map((event) => {
									const Icon = event.kind === "sunrise" ? Sunrise : Sunset;
									return (
										<a
											key={`${event.kind}:${event.occurredAt}`}
											href={`#life-hour-${event.hour}`}
											aria-label={`${event.clock} ${event.label}，跳转至时间线`}
										>
											<Icon size={18} strokeWidth={1.5} aria-hidden="true" />
											<span>{event.label}</span>
											<time dateTime={event.occurredAt}>{event.clock}</time>
										</a>
									);
								})}
							</div>
							<Text as="p" size="sm" tone="muted">
								{sun.status === "midnight_sun"
									? "极昼"
									: sun.status === "polar_night"
										? "极夜"
										: "当天日照"}{" "}
								·{" "}
								{sun.daylightMinutes === null
									? "资料不足"
									: formatDurationMinutes(sun.daylightMinutes)}
							</Text>
						</div>
					) : null}
					{context?.weatherError || context?.sunError ? (
						<Banner
							variant="secondary"
							title="部分公共资料暂未取得"
							description={context.weatherError ?? context.sunError ?? undefined}
							action={
								<Banner.Action onClick={() => void dayContextStore.getState().retry()}>
									重试
								</Banner.Action>
							}
						/>
					) : null}
					<Text as="p" size="xs" tone="muted">
						以当天有连续采样最多的区域为参考；天文时间不代表当时身处该地。
					</Text>
					<Text as="p" size="xs" tone="muted">
						数据来自{" "}
						<a
							href="https://open-meteo.com/"
							target="_blank"
							rel="noreferrer"
							className="underline"
						>
							Open-Meteo
						</a>{" "}
						与{" "}
						<a
							href="https://sunrise-sunset.org"
							target="_blank"
							rel="noreferrer"
							className="underline"
						>
							Sunrise-Sunset
						</a>
					</Text>
				</LayerCard.Body>
			)}
		</LayerCard>
	);
}
