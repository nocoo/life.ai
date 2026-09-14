import { Button, LayerCard, Text } from "@nocoo/basalt";
import { Empty } from "@nocoo/basalt/components/empty";
import { Map as MapIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import type { DayInsights, TrackPoint } from "../models/day-insights";
import type { GpsPlace } from "../models/day-places";
import { EMPTY_NAMED_PLACES, matchNamedPlace } from "../models/general-settings";
import {
	estimateTrackSpeeds,
	nearestTrackPoint,
	type SpeedBand,
	speedBand,
} from "../models/track-speed";
import { formatLocalClock } from "../viewmodels/format";
import { generalSettingsStore } from "../viewmodels/general-settings-view-model";
import { selectTrackEndpoints } from "../viewmodels/timeline-view-model";
import { StoryCardHeading } from "./story-card-heading";
import { StoryCardInfo } from "./story-card-info";

const OSM_TILE = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION =
	'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const SPEED_STYLE = {
	slow: { label: "慢速", range: "<6", token: "--basalt-chart-green", radius: 2.5 },
	medium: { label: "中速", range: "6–30", token: "--basalt-chart-yellow", radius: 3.5 },
	fast: { label: "快速", range: "≥30", token: "--basalt-chart-pink", radius: 4.5 },
	unknown: { label: "未知", range: "采样不足", token: "--basalt-chart-pearl", radius: 2.5 },
} satisfies Record<SpeedBand, { label: string; range: string; token: string; radius: number }>;

function speedLabel(speed: number | null): string {
	return speed === null
		? "速度未知 · 采样不足"
		: `${SPEED_STYLE[speedBand(speed)].label} · 估算 ${speed.toFixed(1)} km/h`;
}

function popupNode(
	title: string,
	point: TrackPoint,
	speed: number | null,
	place?: string,
): HTMLElement {
	const node = document.createElement("div");
	node.style.whiteSpace = "pre-wrap";
	const clock = formatLocalClock(point.occurredAt, point.precision);
	const lines = [
		place ? `${title} · ${place}` : title,
		clock ?? "全天",
		`${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`,
		point.sourceName,
		speedLabel(speed),
	];
	node.textContent = lines.join("\n");
	return node;
}

export function DayMap({
	insights,
	compact = false,
	label = "当日足迹地图",
	title,
	showPoints = false,
	places,
}: {
	insights: DayInsights;
	compact?: boolean;
	label?: string;
	title?: string;
	showPoints?: boolean;
	places?: GpsPlace[];
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [mapError, setMapError] = useState<string | null>(null);
	const [attempt, setAttempt] = useState(0);
	const namedPlaces = useStore(
		generalSettingsStore,
		(state) => state.settings?.places ?? EMPTY_NAMED_PLACES,
	);
	const hasPoints =
		insights.gps.pointCount > 0 && insights.gps.segments.some((segment) => segment.length > 0);

	// biome-ignore lint/correctness/useExhaustiveDependencies: attempt explicitly retries a failed Leaflet initialization.
	useEffect(() => {
		const container = containerRef.current;
		setMapError(null);
		if (!container || !hasPoints) {
			return;
		}
		let cancelled = false;
		let map: import("leaflet").Map | undefined;
		let observer: ResizeObserver | undefined;
		let visibility: IntersectionObserver | undefined;
		let started = false;
		const initialize = async () => {
			if (started || cancelled) return;
			started = true;
			try {
				const leaflet = await import("leaflet");
				await import("leaflet/dist/leaflet.css");
				if (cancelled || !containerRef.current) {
					return;
				}
				const L = leaflet.default ?? leaflet;
				const popup = (title: string, point: TrackPoint, speed: number | null) =>
					popupNode(title, point, speed, matchNamedPlace(point, namedPlaces)?.label);
				map = L.map(containerRef.current, {
					scrollWheelZoom: false,
					keyboard: true,
					preferCanvas: true,
				});
				if (cancelled) {
					map.remove();
					map = undefined;
					return;
				}
				L.tileLayer(OSM_TILE, {
					attribution: OSM_ATTRIBUTION,
				}).addTo(map);
				const latLngs: [number, number][] = [];
				const palette = getComputedStyle(container);
				const routeColor = `hsl(${palette.getPropertyValue("--basalt-chart-blue").trim()})`;
				const speeds = estimateTrackSpeeds(insights.gps.segments);
				for (const segment of insights.gps.segments) {
					if (segment.length === 0) {
						continue;
					}
					const path = segment.map((point) => {
						latLngs.push([point.latitude, point.longitude]);
						return [point.latitude, point.longitude] as [number, number];
					});
					if (path.length > 1) {
						L.polyline(path, {
							color: routeColor,
							weight: 2,
							opacity: 0.65,
							interactive: false,
						}).addTo(map);
					} else if (path[0] && !showPoints) {
						L.circleMarker(path[0], { radius: 3, color: routeColor, interactive: false }).addTo(
							map,
						);
					}
					if (showPoints) {
						for (const point of segment) {
							const speed = speeds.get(point) ?? null;
							const style = SPEED_STYLE[speedBand(speed)];
							const color = `hsl(${palette.getPropertyValue(style.token).trim()})`;
							L.circleMarker([point.latitude, point.longitude], {
								radius: style.radius,
								color,
								weight: 1,
								fillOpacity: 0.85,
							})
								.addTo(map)
								.bindPopup(popup("位置记录", point, speed));
						}
					}
				}
				for (const place of places ?? []) {
					const placeTitle = `${place.namedPlace?.label ?? `区域 ${place.index}`} · 附近采样`;
					const point = nearestTrackPoint(place.anchor, speeds.keys());
					const speed = point ? (speeds.get(point) ?? null) : null;
					const band = speedBand(speed);
					const marker = L.marker([place.anchor.latitude, place.anchor.longitude], {
						icon: L.divIcon({
							className: `story-place-marker story-speed-${band}`,
							html: `<span>${place.index}</span>`,
							iconSize: [28, 28],
							iconAnchor: [14, 32],
							popupAnchor: [0, -30],
						}),
						title: `${placeTitle} · ${speedLabel(speed)}`,
					}).addTo(map);
					if (point) marker.bindPopup(popupNode(placeTitle, point, speed));
				}
				const ends = selectTrackEndpoints(insights.gps.segments);
				if (ends) {
					const endpoints = [{ title: "起点", mark: "起", point: ends.start }];
					if (ends.end !== ends.start)
						endpoints.push({ title: "终点", mark: "终", point: ends.end });
					for (const endpoint of endpoints) {
						L.marker([endpoint.point.latitude, endpoint.point.longitude], {
							icon: L.divIcon({
								className: "story-endpoint-marker",
								html: `<span>${endpoint.mark}</span>`,
								iconSize: [22, 22],
								iconAnchor: [11, 11],
							}),
							title: endpoint.title,
						})
							.addTo(map)
							.bindPopup(popup(endpoint.title, endpoint.point, speeds.get(endpoint.point) ?? null));
					}
				}
				if (latLngs.length === 1) {
					const only = latLngs[0];
					if (only) {
						map.setView(only, 14);
					}
				} else if (latLngs.length > 1) {
					map.fitBounds(L.latLngBounds(latLngs), { padding: [28, 28], maxZoom: 16 });
				}
				observer = new ResizeObserver(() => {
					if (!cancelled) {
						map?.invalidateSize();
						if (latLngs.length > 1) {
							map?.fitBounds(L.latLngBounds(latLngs), { padding: [28, 28], maxZoom: 16 });
						}
					}
				});
				observer.observe(containerRef.current);
				if (cancelled) {
					observer.disconnect();
					map.remove();
					map = undefined;
					return;
				}
				map.invalidateSize();
				container.dataset.mapLoaded = "true";
			} catch {
				if (!cancelled) {
					setMapError("地图未能加载，请重试。");
				}
				if (map) {
					map.remove();
					map = undefined;
				}
			}
		};
		// Every expanded visit has a place in the layout; initialize tiles only near the viewport.
		visibility = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					visibility?.disconnect();
					void initialize();
				}
			},
			{ rootMargin: "400px" },
		);
		visibility.observe(container);
		return () => {
			cancelled = true;
			visibility?.disconnect();
			delete container.dataset.mapLoaded;
			observer?.disconnect();
			if (map) {
				map.remove();
				map = undefined;
			}
		};
	}, [hasPoints, insights, attempt, showPoints, places, namedPlaces]);

	return (
		<LayerCard className="story-map story-card">
			<StoryCardInfo
				label={title ?? (compact ? "全天足迹" : "足迹")}
				notes={[
					"速度按相邻采样点估算；编号圈对应区域附近的采样速度。定位断档不能补成连续行程或停留。",
				]}
			/>
			<LayerCard.Header>
				<StoryCardHeading
					icon={MapIcon}
					title={title ?? (compact ? "全天足迹" : "足迹")}
					subtitle={
						hasPoints
							? `${insights.gps.pointCount} 个点 · ${(insights.gps.distanceMeters / 1000).toFixed(2)} km`
							: "这一天没有位置记录"
					}
				/>
			</LayerCard.Header>
			<LayerCard.Body>
				{mapError && hasPoints ? (
					<div className="flex flex-col items-start gap-3">
						<Text as="p" size="sm" tone="muted">
							{mapError}
						</Text>
						<Button
							onClick={() => {
								setMapError(null);
								setAttempt((value) => value + 1);
							}}
						>
							重试
						</Button>
					</div>
				) : null}
				{hasPoints ? (
					<div
						ref={containerRef}
						className={`story-map-canvas w-full overflow-hidden rounded-md${compact ? " story-map-compact" : ""}`}
						hidden={Boolean(mapError)}
						role="application"
						aria-label={label}
					/>
				) : (
					<Empty title="没有位置记录" description="导入 footprint GPX 后会显示轨迹。" />
				)}
				{hasPoints && (showPoints || Boolean(places?.length)) ? (
					<section className="story-map-legend" aria-label="地图速度图例">
						<Text size="xs" tone="muted">
							估算速度 · km/h
						</Text>
						{Object.entries(SPEED_STYLE).map(([band, style]) => (
							<span key={band} className={`story-speed-key story-speed-${band}`}>
								<i aria-hidden="true" />
								{style.label} {style.range}
							</span>
						))}
					</section>
				) : null}
			</LayerCard.Body>
		</LayerCard>
	);
}
