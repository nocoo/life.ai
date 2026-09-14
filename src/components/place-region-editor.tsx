import { Button, Field, Input, Text } from "@nocoo/basalt";
import { Slider } from "@nocoo/basalt/components/slider";
import { useEffect, useRef, useState } from "react";
import {
	type Coordinates,
	DEFAULT_PLACE_RADIUS_METERS,
	MAX_PLACE_RADIUS_METERS,
	MIN_PLACE_RADIUS_METERS,
} from "../models/general-settings";

const OSM_TILE = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION =
	'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const UNSELECTED_VIEW: [number, number] = [20, 110];
const UNSELECTED_ZOOM = 3;

function clampPreviewRadius(radius: number): number {
	if (!Number.isFinite(radius)) return DEFAULT_PLACE_RADIUS_METERS;
	return Math.min(MAX_PLACE_RADIUS_METERS, Math.max(MIN_PLACE_RADIUS_METERS, Math.round(radius)));
}

function fitCircle(map: import("leaflet").Map, circle: import("leaflet").Circle | null) {
	if (!circle) return;
	map.fitBounds(circle.getBounds(), { padding: [24, 24], maxZoom: 17, animate: false });
}

function syncCircle(
	L: typeof import("leaflet"),
	map: import("leaflet").Map,
	point: Coordinates | null,
	radius: number,
	circleRef: { current: import("leaflet").Circle | null },
	markerRef: { current: import("leaflet").CircleMarker | null },
	container: HTMLElement | null,
) {
	if (!point) {
		circleRef.current?.remove();
		markerRef.current?.remove();
		circleRef.current = null;
		markerRef.current = null;
		return;
	}
	const latlng: [number, number] = [point.latitude, point.longitude];
	const palette = container ? getComputedStyle(container) : null;
	const color = palette
		? `hsl(${palette.getPropertyValue("--basalt-chart-blue").trim() || "210 80% 45%"})`
		: "#3b82f6";
	const preview = clampPreviewRadius(radius);
	if (circleRef.current) {
		circleRef.current.setLatLng(latlng);
		circleRef.current.setRadius(preview);
	} else {
		circleRef.current = L.circle(latlng, {
			radius: preview,
			color,
			weight: 2,
			fillOpacity: 0.18,
			interactive: false,
		}).addTo(map);
	}
	if (markerRef.current) {
		markerRef.current.setLatLng(latlng);
	} else {
		markerRef.current = L.circleMarker(latlng, {
			radius: 5,
			color,
			weight: 2,
			fillOpacity: 1,
			interactive: false,
		}).addTo(map);
	}
}

export function PlaceRegionEditor({
	label,
	center,
	radiusMeters,
	disabled = false,
	onLabelChange,
	onCenterChange,
	onRadiusChange,
}: {
	label: string;
	center: Coordinates | null;
	radiusMeters: number;
	disabled?: boolean;
	onLabelChange: (label: string) => void;
	onCenterChange: (center: Coordinates) => void;
	onRadiusChange: (radiusMeters: number) => void;
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const mapRef = useRef<import("leaflet").Map | null>(null);
	const circleRef = useRef<import("leaflet").Circle | null>(null);
	const markerRef = useRef<import("leaflet").CircleMarker | null>(null);
	const leafletRef = useRef<typeof import("leaflet") | null>(null);
	const onCenterChangeRef = useRef(onCenterChange);
	const centerRef = useRef(center);
	const radiusRef = useRef(radiusMeters);
	const disabledRef = useRef(disabled);
	const [mapError, setMapError] = useState<string | null>(null);
	const [attempt, setAttempt] = useState(0);
	const [latText, setLatText] = useState(center ? formatCoord(center.latitude) : "");
	const [lngText, setLngText] = useState(center ? formatCoord(center.longitude) : "");
	const latTextRef = useRef(latText);
	const lngTextRef = useRef(lngText);
	const lastPushedRef = useRef<Coordinates | null>(null);

	onCenterChangeRef.current = onCenterChange;
	centerRef.current = center;
	radiusRef.current = radiusMeters;
	disabledRef.current = disabled;
	latTextRef.current = latText;
	lngTextRef.current = lngText;

	useEffect(() => {
		if (!center) {
			lastPushedRef.current = null;
			setLatText("");
			setLngText("");
			return;
		}
		const pushed = lastPushedRef.current;
		if (pushed && pushed.latitude === center.latitude && pushed.longitude === center.longitude)
			return;
		setLatText(formatCoord(center.latitude));
		setLngText(formatCoord(center.longitude));
	}, [center]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: attempt retries Leaflet after a failed load; map instance is preserved across radius/center updates.
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		let cancelled = false;
		let observer: ResizeObserver | undefined;
		let started = false;
		setMapError(null);

		const initialize = async () => {
			if (started || cancelled) return;
			started = true;
			try {
				const leaflet = await import("leaflet");
				await import("leaflet/dist/leaflet.css");
				if (cancelled || !containerRef.current) return;
				const L = leaflet.default ?? leaflet;
				leafletRef.current = L;
				const map = L.map(containerRef.current, {
					scrollWheelZoom: false,
					keyboard: true,
					preferCanvas: true,
				});
				if (cancelled) {
					map.remove();
					return;
				}
				mapRef.current = map;
				const seed = centerRef.current;
				// Leaflet projects circle bounds only after the map has an initial view.
				map.setView(seed ? [seed.latitude, seed.longitude] : UNSELECTED_VIEW, UNSELECTED_ZOOM, {
					animate: false,
				});
				if (seed) {
					syncCircle(L, map, seed, radiusRef.current, circleRef, markerRef, containerRef.current);
					fitCircle(map, circleRef.current);
				}
				const tiles = L.tileLayer(OSM_TILE, { attribution: OSM_ATTRIBUTION }).addTo(map);
				let tileErrors = 0;
				tiles.on("tileerror", () => {
					tileErrors += 1;
					if (!cancelled && tileErrors >= 6) {
						setMapError("地图底图未能加载，请检查网络后重试。");
					}
				});
				map.on("click", (event: { latlng: { lat: number; lng: number } }) => {
					if (disabledRef.current) return;
					const wrapped = L.latLng(event.latlng.lat, event.latlng.lng).wrap();
					onCenterChangeRef.current({
						latitude: roundCoord(wrapped.lat),
						longitude: roundCoord(wrapped.lng),
					});
				});
				observer = new ResizeObserver(() => {
					if (!cancelled) {
						map.invalidateSize();
						fitCircle(map, circleRef.current);
					}
				});
				observer.observe(containerRef.current);
				map.invalidateSize();
				fitCircle(map, circleRef.current);
			} catch {
				if (!cancelled) setMapError("地图未能加载，请重试。");
				mapRef.current?.remove();
				mapRef.current = null;
			}
		};

		void initialize();
		return () => {
			cancelled = true;
			observer?.disconnect();
			circleRef.current = null;
			markerRef.current = null;
			leafletRef.current = null;
			if (mapRef.current) {
				mapRef.current.remove();
				mapRef.current = null;
			}
		};
	}, [attempt]);

	useEffect(() => {
		const map = mapRef.current;
		const L = leafletRef.current;
		if (!map || !L) return;
		syncCircle(L, map, center, radiusMeters, circleRef, markerRef, containerRef.current);
		fitCircle(map, circleRef.current);
	}, [center, radiusMeters]);

	function commitCoordinates(): boolean {
		const lat = latTextRef.current.trim();
		const lng = lngTextRef.current.trim();
		if (lat === "" || lng === "") return false;
		const latitude = Number(lat);
		const longitude = Number(lng);
		if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return false;
		if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return false;
		const next = { latitude: roundCoord(latitude), longitude: roundCoord(longitude) };
		const current = centerRef.current;
		if (current && current.latitude === next.latitude && current.longitude === next.longitude)
			return true;
		lastPushedRef.current = next;
		onCenterChange(next);
		return true;
	}

	return (
		<div className="space-y-4">
			<Field label="地点名称" htmlFor="named-place-label">
				<Input
					id="named-place-label"
					value={label}
					maxLength={80}
					disabled={disabled}
					onChange={(event) => onLabelChange(event.target.value)}
					placeholder="例如：公司、父母家"
				/>
			</Field>
			{mapError ? (
				<div className="flex flex-col items-start gap-3">
					<Text as="p" size="sm" tone="muted">
						{mapError}
					</Text>
					<Button
						type="button"
						size="sm"
						onClick={() => {
							setMapError(null);
							setAttempt((value) => value + 1);
						}}
					>
						重试
					</Button>
				</div>
			) : null}
			<div
				ref={containerRef}
				className="general-settings-map w-full overflow-hidden rounded-basalt-md"
				hidden={Boolean(mapError)}
				role="application"
				aria-label="地点范围地图，点击选择中心"
			/>
			<Text as="p" size="sm" tone="muted">
				{center
					? "拖动半径或改数字即可看到范围变化。再点地图可改中心。"
					: "地图尚未选定中心。请点击地图，或在下方填写经纬度。"}
			</Text>
			<div className="grid gap-3 sm:grid-cols-2">
				<Field label="纬度" htmlFor="named-place-latitude">
					<Input
						id="named-place-latitude"
						name="named-place-latitude"
						type="number"
						min={-90}
						max={90}
						step="any"
						required
						value={latText}
						disabled={disabled}
						onChange={(event) => {
							latTextRef.current = event.target.value;
							setLatText(event.target.value);
							commitCoordinates();
						}}
						placeholder="例如 31.2304"
					/>
				</Field>
				<Field label="经度" htmlFor="named-place-longitude">
					<Input
						id="named-place-longitude"
						name="named-place-longitude"
						type="number"
						min={-180}
						max={180}
						step="any"
						required
						value={lngText}
						disabled={disabled}
						onChange={(event) => {
							lngTextRef.current = event.target.value;
							setLngText(event.target.value);
							commitCoordinates();
						}}
						placeholder="例如 121.4737"
					/>
				</Field>
			</div>
			<Field label={`范围 ${radiusMeters} 米`} htmlFor="named-place-radius">
				<div className="space-y-3">
					<Slider
						id="named-place-radius"
						min={MIN_PLACE_RADIUS_METERS}
						max={MAX_PLACE_RADIUS_METERS}
						step={50}
						value={[clampPreviewRadius(radiusMeters)]}
						disabled={disabled}
						labels={["地点范围"]}
						onValueChange={(value) => onRadiusChange(value[0] ?? DEFAULT_PLACE_RADIUS_METERS)}
					/>
					<Input
						type="number"
						min={MIN_PLACE_RADIUS_METERS}
						max={MAX_PLACE_RADIUS_METERS}
						step={1}
						value={Number.isFinite(radiusMeters) ? radiusMeters : ""}
						disabled={disabled}
						aria-label="地点范围（米）"
						onChange={(event) => {
							const next = Number(event.target.value);
							if (!Number.isFinite(next)) return;
							onRadiusChange(Math.round(next));
						}}
					/>
				</div>
			</Field>
		</div>
	);
}

function formatCoord(value: number): string {
	return value.toFixed(5);
}

function roundCoord(value: number): number {
	return Number(value.toFixed(6));
}
