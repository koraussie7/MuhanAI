/**
 * Osiris-style live globe — 3D Earth with real-time event markers.
 *
 * Data arrives from the parent page (/api/world/brief → Pythia World Engine).
 * When the feed is empty or unreachable the globe falls back to a
 * deterministic offline demo so it never renders empty.
 *
 * Rendering is globe.gl (three.js): exactly one instance per mount, kept in
 * sync with a ResizeObserver, and torn down with `_destructor()`.
 */

import type { GlobeInstance } from "globe.gl";
import GlobeChart from "globe.gl";
import { RefreshCw, ScanLine } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WorldEvent } from "../lib/world-types";

const GLOBE_TEXTURE = "https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg";
const GLOBE_BACKGROUND = "#0a0a12";
const FALLBACK_WIDTH = 640;
const FALLBACK_HEIGHT = 360;

/* ── 좌표 해석 helpers ───────────────────────────────────────────────── */

/** 알려진 도시 → [lat, lng] 매핑 (Osiris 예제 도시 포함) */
const CITY_COORDS: Record<string, [number, number]> = {
	Seoul: [37.5665, 126.978],
	Bangkok: [13.7563, 100.5018],
	Tokyo: [35.6762, 139.6503],
	Paris: [48.8566, 2.3522],
	"New York": [40.7128, -74.006],
	London: [51.5074, -0.1278],
	Sydney: [-33.8688, 151.2093],
	Dubai: [25.2048, 55.2708],
	Moscow: [55.7558, 37.6173],
	Beijing: [39.9042, 116.4074],
	"New Delhi": [28.6139, 77.209],
	Berlin: [52.52, 13.405],
	Barcelona: [41.3874, 2.1686],
	Amsterdam: [52.3676, 4.9041],
	"Los Angeles": [34.0522, -118.2437],
	"San Francisco": [37.7749, -122.4194],
	HongKong: [22.3193, 114.1694],
	Singapore: [1.3521, 103.8198],
	"Cape Town": [-33.9249, 18.4241],
	Rio: [-22.9068, -43.1729],
	Cairo: [30.0444, 31.2357],
	Istanbul: [41.0082, 28.9784],
	Mumbai: [19.076, 72.8777],
	Shanghai: [31.2304, 121.4737],
	MexicoCity: [19.4326, -99.1332],
	"Buenos Aires": [-34.6037, -58.3816],
	Lagos: [6.5244, 3.3792],
	Jakarta: [-6.2088, 106.8456],
	Karachi: [24.8607, 67.0011],
	Nairobi: [-1.2921, 36.8219],
	Toronto: [43.6532, -79.3832],
	Chicago: [41.8781, -87.6298],
	Boston: [42.3601, -71.0589],
	Seattle: [47.6062, -122.3321],
	Denver: [39.7392, -104.9903],
	Atlanta: [33.749, -84.388],
	Dallas: [32.7767, -96.797],
	Phoenix: [33.4484, -112.074],
	Philadelphia: [39.9526, -75.1652],
	"Washington DC": [38.9072, -77.0369],
};

/** "51.5 -0.1W" 또는 "37.56,126.98" 같은 문자열을 [lat, lng]로 파싱 */
function parseLatLng(location: string): [number, number] | null {
	const match = location.match(
		/(-?\d+(?:\.\d+)?)\s*[,°\s]\s*(-?\d+(?:\.\d+)?)\s*([NnSsEeWw])?\s*([NnSsEeWw])?/,
	);
	const latRaw = match?.[1];
	const lngRaw = match?.[2];
	if (latRaw === undefined || lngRaw === undefined) return null;

	let lat = Number.parseFloat(latRaw);
	let lng = Number.parseFloat(lngRaw);
	if (Number.isNaN(lat) || Number.isNaN(lng)) return null;

	// 방향 접미사 처리: "37.5S 127E" / "51.5N 0.1W"
	if ((match?.[3] ?? "").toUpperCase() === "S") lat = -Math.abs(lat);
	if ((match?.[4] ?? "").toUpperCase() === "W") lng = -Math.abs(lng);
	if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

	return [lat, lng];
}

/** 도시 이름 → 좌표. 대소문자 무시, "New York, USA" 같은 콤마 표기도 처리. */
function lookupCity(name: string | undefined): [number, number] | null {
	if (!name) return null;

	const direct = CITY_COORDS[name];
	if (direct) return direct;

	const head = name.split(",")[0]?.trim();
	if (!head) return null;

	const headDirect = CITY_COORDS[head];
	if (headDirect) return headDirect;

	const target = head.toLowerCase();
	const hit = Object.keys(CITY_COORDS).find((city) => city.toLowerCase() === target);
	return hit ? (CITY_COORDS[hit] ?? null) : null;
}

/** WorldEvent → 글로브 좌표 (lat, lng). 해석 불가 시 null. */
export function eventPosition(event: WorldEvent): [number, number] | null {
	const location = event.location?.trim();
	if (location) {
		const parsed = parseLatLng(location);
		if (parsed) return parsed;
		const knownCity = lookupCity(location);
		if (knownCity) return knownCity;
	}

	const firstWord = event.title.trim().split(/\s+/)[0];
	return lookupCity(firstWord);
}

/* ── 오프라인 데모 이벤트 ──────────────────────────────────────────── */

const DEMO_EVENTS: WorldEvent[] = [
	{
		id: "demo-seoul",
		title: "Seoul — 프리미엄 동향",
		domain: "markets",
		location: "Seoul",
		severity: "watch",
		source: "offline-demo",
		timestamp: new Date().toISOString(),
	},
	{
		id: "demo-bangkok",
		title: "Bangkok — 항공 수요 급증",
		domain: "travel",
		location: "Bangkok",
		severity: "info",
		source: "offline-demo",
		timestamp: new Date().toISOString(),
	},
	{
		id: "demo-tokyo",
		title: "Tokyo — 지진 경보 (소규모)",
		domain: "disaster",
		location: "Tokyo",
		severity: "alert",
		source: "offline-demo",
		timestamp: new Date().toISOString(),
	},
	{
		id: "demo-nyc",
		title: "New York — 시장 변동 감지",
		domain: "markets",
		location: "New York",
		severity: "watch",
		source: "offline-demo",
		timestamp: new Date().toISOString(),
	},
	{
		id: "demo-london",
		title: "London — 사이버 위협 활동",
		domain: "cyber",
		location: "London",
		severity: "watch",
		source: "offline-demo",
		timestamp: new Date().toISOString(),
	},
	{
		id: "demo-sydney",
		title: "Sydney — 산불 위험 상승",
		domain: "environment",
		location: "Sydney",
		severity: "alert",
		source: "offline-demo",
		timestamp: new Date().toISOString(),
	},
];

/* ── 글로브 마커 ───────────────────────────────────────────────────── */

interface GlobePointStyle {
	color: string;
	radius: number;
}

const INFO_STYLE: GlobePointStyle = { color: "#10b981", radius: 0.3 };

const SEVERITY_STYLE: Record<string, GlobePointStyle> = {
	alert: { color: "#f43f5e", radius: 0.55 },
	watch: { color: "#f59e0b", radius: 0.42 },
	info: INFO_STYLE,
};

interface GlobePoint {
	lat: number;
	lng: number;
	color: string;
	radius: number;
	label: string;
}

/** 툴팁은 HTML로 렌더되므로 외부 피드 문자열을 escape해서 넣는다. */
function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}

export function toGlobePoints(events: WorldEvent[]): GlobePoint[] {
	const points: GlobePoint[] = [];

	for (const event of events) {
		const position = eventPosition(event);
		if (!position) continue;
		const style = SEVERITY_STYLE[event.severity] ?? INFO_STYLE;
		const meta = [event.domain, event.location, event.source].filter(Boolean).join(" · ");
		const label = `<div style="font-size:12px;line-height:1.4"><b>${escapeHtml(
			event.title,
		)}</b><br/>${escapeHtml(meta)}</div>`;

		points.push({
			lat: position[0],
			lng: position[1],
			color: style.color,
			radius: style.radius,
			label,
		});
	}

	return points;
}

export interface WorldGlobeProps {
	events: WorldEvent[];
	isOnline: boolean;
	lastUpdated?: string;
	onRefresh?: () => void | Promise<void>;
	/** true면 이벤트가 비었을 때 오프라인 데모 마커를 그린다. */
	demoFallback?: boolean;
}

const LegendDot = ({ color, label }: { color: string; label: string }) => (
	<span className="inline-flex items-center gap-1">
		<span
			style={{
				width: 7,
				height: 7,
				borderRadius: 999,
				background: color,
				display: "inline-block",
			}}
		/>
		{label}
	</span>
);

export const WorldGlobe = ({
	events,
	isOnline,
	lastUpdated,
	onRefresh,
	demoFallback = true,
}: WorldGlobeProps) => {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const globeRef = useRef<GlobeInstance | null>(null);
	const [ready, setReady] = useState(false);
	const [refreshing, setRefreshing] = useState(false);

	const usingDemo = demoFallback && events.length === 0;
	const live = isOnline && !usingDemo;
	const points = useMemo(
		() => toGlobePoints(usingDemo ? DEMO_EVENTS : events),
		[events, usingDemo],
	);

	// 글로브 초기화 — 마운트 시 1회. 컨테이너 크기는 ResizeObserver로 동기화.
	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;

		const chart = new GlobeChart(el, { animateIn: true, waitForGlobeReady: false });
		chart
			.globeImageUrl(GLOBE_TEXTURE)
			.backgroundColor(GLOBE_BACKGROUND)
			.showAtmosphere(true)
			.atmosphereColor("#38bdf8")
			.pointsMerge(false)
			.pointsTransitionDuration(600)
			.pointAltitude(0.015)
			.pointColor((point) => (point as GlobePoint).color)
			.pointRadius((point) => (point as GlobePoint).radius)
			.pointLabel((point) => (point as GlobePoint).label)
			.width(el.clientWidth || FALLBACK_WIDTH)
			.height(el.clientHeight || FALLBACK_HEIGHT);

		chart.pointOfView({ lat: 25, lng: 20, altitude: 2.4 });

		// Osiris 느낌의 자동 회전 — 마커에 hover하면 잠시 멈춘다.
		const controls = chart.controls();
		controls.autoRotate = true;
		controls.autoRotateSpeed = 0.6;
		controls.enablePan = false;
		chart.onPointHover((point) => {
			controls.autoRotate = point === null;
		});

		globeRef.current = chart;
		setReady(true);

		const observer = new ResizeObserver(() => {
			chart.width(el.clientWidth || FALLBACK_WIDTH).height(el.clientHeight || FALLBACK_HEIGHT);
		});
		observer.observe(el);

		return () => {
			observer.disconnect();
			globeRef.current = null;
			chart._destructor();
		};
	}, []);

	// 이벤트/데모 변경 시 마커만 갱신 (globe 재생성 없음)
	useEffect(() => {
		globeRef.current?.pointsData(points);
	}, [points]);

	const handleRefresh = useCallback(() => {
		if (!onRefresh) return;
		const result = onRefresh();
		if (result instanceof Promise) {
			setRefreshing(true);
			void result.finally(() => setRefreshing(false));
		}
	}, [onRefresh]);

	return (
		<div
			className="relative h-full w-full min-h-[280px] overflow-hidden rounded-xl border border-white/5 bg-[#0a0a12]"
			style={{ aspectRatio: "16 / 9" }}
			data-testid="world-globe"
		>
			{/* globe.gl이 이 컨테이너를 캔버스로 채운다 */}
			<div ref={containerRef} className="absolute inset-0" />

			{/* 상태 배지 + 마지막 갱신 시각 */}
			<div className="absolute top-3 left-3 flex items-center gap-2">
				<span
					className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium backdrop-blur-sm"
					style={{
						backgroundColor: live ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.15)",
						color: live ? "#10b981" : "#f59e0b",
						border: "1px solid currentColor",
					}}
				>
					<ScanLine size={12} className={live ? "" : "animate-pulse"} />
					{live ? "라이브" : "오프라인 데모"}
				</span>
				{lastUpdated && (
					<span className="rounded-md px-2.5 py-1 text-xs font-medium text-white/60 backdrop-blur-sm">
						{new Date(lastUpdated).toLocaleTimeString("ko-KR", {
							hour: "2-digit",
							minute: "2-digit",
						})}
					</span>
				)}
			</div>

			<button
				type="button"
				onClick={handleRefresh}
				disabled={!onRefresh || refreshing}
				className="absolute top-3 right-3 flex items-center gap-1.5 rounded-md border border-white/5 bg-white/5 px-2.5 py-1.5 text-xs text-white/70 transition-colors backdrop-blur-sm hover:bg-white/10 hover:text-white disabled:opacity-50"
				title="다시 조회"
			>
				<RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
				<span className="hidden sm:inline">새로고침</span>
			</button>

			{/* 심각도 범례 + 마커 수 */}
			<div className="absolute bottom-3 left-3 flex items-center gap-3 rounded-md bg-black/40 px-2.5 py-1.5 text-[11px] text-white/70 backdrop-blur-sm">
				<LegendDot color={SEVERITY_STYLE.alert?.color ?? INFO_STYLE.color} label="경보" />
				<LegendDot color={SEVERITY_STYLE.watch?.color ?? INFO_STYLE.color} label="주의" />
				<LegendDot color={INFO_STYLE.color} label="정보" />
				<span className="text-white/50">{points.length} markers</span>
			</div>

			{/* 로딩 인디케이터 */}
			{!ready && (
				<div className="absolute inset-0 flex items-center justify-center">
					<div className="flex items-center gap-2 rounded-lg bg-white/5 px-4 py-2 text-sm text-white/60 backdrop-blur-sm">
						<RefreshCw size={14} className="animate-spin" />
						로딩 중…
					</div>
				</div>
			)}
		</div>
	);
};

export default WorldGlobe;
