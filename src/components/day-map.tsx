import { Button, LayerCard, Text } from "@nocoo/basalt";
import { Empty } from "@nocoo/basalt/components/empty";
import { useEffect, useRef, useState } from "react";
import type { DayInsights, TrackPoint } from "../models/day-insights";
import { formatLocalClock } from "../viewmodels/format";
import { selectTrackEndpoints } from "../viewmodels/timeline-view-model";

const OSM_TILE = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION =
	'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function popupNode(title: string, point: TrackPoint): HTMLElement {
	const node = document.createElement("div");
	node.style.whiteSpace = "pre-wrap";
	const clock = formatLocalClock(point.occurredAt, point.precision);
	const lines = [
		title,
		clock ?? "全天",
		`${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`,
		point.sourceName,
	];
	node.textContent = lines.join("\n");
	return node;
}

export function DayMap({ insights }: { insights: DayInsights }) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [mapError, setMapError] = useState<string | null>(null);
	const [attempt, setAttempt] = useState(0);
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
		void (async () => {
			try {
				const leaflet = await import("leaflet");
				await import("leaflet/dist/leaflet.css");
				if (cancelled || !containerRef.current) {
					return;
				}
				const L = leaflet.default ?? leaflet;
				map = L.map(containerRef.current, {
					scrollWheelZoom: true,
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
				for (const segment of insights.gps.segments) {
					if (segment.length === 0) {
						continue;
					}
					const path = segment.map((point) => {
						latLngs.push([point.latitude, point.longitude]);
						return [point.latitude, point.longitude] as [number, number];
					});
					if (path.length > 1) {
						L.polyline(path, { color: "#2563eb", weight: 3, interactive: false }).addTo(map);
					} else if (path[0]) {
						L.circleMarker(path[0], { radius: 3, color: "#2563eb", interactive: false }).addTo(map);
					}
				}
				const ends = selectTrackEndpoints(insights.gps.segments);
				if (ends) {
					L.circleMarker([ends.start.latitude, ends.start.longitude], {
						radius: 7,
						color: "#15803d",
						fillOpacity: 1,
					})
						.addTo(map)
						.bindPopup(popupNode("起点", ends.start));
					if (ends.end.occurredAt !== ends.start.occurredAt) {
						L.circleMarker([ends.end.latitude, ends.end.longitude], {
							radius: 7,
							color: "#b91c1c",
							fillOpacity: 1,
						})
							.addTo(map)
							.bindPopup(popupNode("终点", ends.end));
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
			} catch {
				if (!cancelled) {
					setMapError("地图未能加载，请重试。");
				}
				if (map) {
					map.remove();
					map = undefined;
				}
			}
		})();
		return () => {
			cancelled = true;
			observer?.disconnect();
			if (map) {
				map.remove();
				map = undefined;
			}
		};
	}, [hasPoints, insights, attempt]);

	return (
		<LayerCard>
			<LayerCard.Header>
				<Text as="h2" variant="heading" size="md">
					足迹
				</Text>
				<Text as="p" size="sm" tone="muted">
					{hasPoints
						? `${insights.gps.pointCount} 个点 · ${(insights.gps.distanceMeters / 1000).toFixed(2)} km`
						: "这一天没有位置记录"}
				</Text>
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
						className="h-80 w-full overflow-hidden rounded-md"
						hidden={Boolean(mapError)}
						role="application"
						aria-label="当日足迹地图"
					/>
				) : (
					<Empty title="没有位置记录" description="导入 footprint GPX 后会显示轨迹。" />
				)}
			</LayerCard.Body>
		</LayerCard>
	);
}
