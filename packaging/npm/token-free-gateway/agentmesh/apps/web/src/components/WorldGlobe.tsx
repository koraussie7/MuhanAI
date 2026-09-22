/**
 * Osiris-style live globe — 3D Earth with real-time event markers.
 *
 * Proxied from /api/world/events (Pythia World Engine) when PYTHIA_WORLD_URL
 * is set and reachable; otherwise falls back to a deterministic offline demo
 * so the globe never renders empty.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import GlobeChart from "globe.gl";
import { RefreshCw, ScanLine } from "lucide-react";
import type { WorldEvent } from "../lib/world-types";

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
  const m = location.match(
    /(-?\d+(?:\.\d+)?)\s*[,°\s]\s*(-?\d+(?:\.\d+)?)\s*([NnSsEeWw])?\s*([NnSsEeWw])?/,
  );
  if (!m) return null;
  let lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  const dir1 = (m[3] ?? "").toUpperCase();
  const dir2 = (m[4] ?? "").toUpperCase();
  if (dir1 === "S") lat = -lat;
  // 방향 문자가 lat/lng 뒤에 붙는 패턴: "51.5N 0.1W"
  if (dir2 === "W") return [lat, -lng];
  if (dir2 === "E") return [lat, lng];
  return [lat, lng];
}

/** WorldEvent → 글로브 좌표 (lat, lng). 해석 불가 시 null. */
function eventPosition(e: WorldEvent): [number, number] | null {
  if (e.location) {
    const parsed = parseLatLng(e.location);
    if (parsed) return parsed;
    if (CITY_COORDS[e.location]) return CITY_COORDS[e.location];
  }
  if (e.title) {
    const firstWord = e.title.split(" ")[0];
    if (CITY_COORDS[firstWord]) return CITY_COORDS[firstWord];
  }
  return null;
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

export interface WorldGlobeProps {
  events: WorldEvent[];
  isOnline: boolean;
  lastUpdated?: string;
  onRefresh?: () => void;
}

const SEVERITY_COLOR: Record<string, string> = {
  alert: "#f43f5e",
  watch: "#f59e0b",
  info: "#10b981",
};

export const WorldGlobe = ({
  events,
  isOnline,
  lastUpdated,
  onRefresh,
}: WorldGlobeProps) => {
  const globeEl = useRef<HTMLDivElement>(null);
  const globe = useRef<GlobeChart | null>(null);
  const [globeReady, setGlobeReady] = useState(false);

  // 데이터가 바뀌면 globe에 반영
  const syncPoints = useCallback(
    (currentEvents: WorldEvent[]) => {
      const g = globe.current;
      if (!g) return;
      const positions = currentEvents
        .map((e) => eventPosition(e))
        .filter((p): p is [number, number] => p !== null);
      // 포인트가 0이면 globe에 빈 데이터 전달 (기존 마커 제거)
      if (positions.length === 0) {
        g.pointsData([]);
        return;
      }
      g.pointLat((_, i) => positions[i][0]);
      g.pointLng((_, i) => positions[i][1]);
      g.pointRadius(0.6);
      g.pointColor((_, i) => {
        const e = currentEvents.find((ev) => {
          const p = eventPosition(ev);
          return p !== null && p[0] === positions[i][0] && p[1] === positions[i][1];
        });
        return e ? SEVERITY_COLOR[e.severity] : SEVERITY_COLOR.info;
      });
      g.pointAltitude(0.02);
      g.pointsData(
        currentEvents
          .map((e) => {
            const p = eventPosition(e);
            if (!p) return null;
            return { lat: p[0], lng: p[1], color: SEVERITY_COLOR[e.severity] };
          })
          .filter(Boolean),
      );
    },
    [],
  );

  // globe 초기화 및 데이터 첫 동기화
  useEffect(() => {
    if (!globeEl.current) return;
    const chart = GlobeChart()(globeEl.current);
    chart
      .globeImageUrl("//unpkg.com/three-globe/example/img/earth-blue-marble.jpg")
      .backgroundColor("#0a0a12")
      .pointsMerge(false)
      .pointAltitude(0.02)
      .pointRadius(0.6)
      .pointColor((_, i) => SEVERITY_COLOR.info)
      .controls(new GlobeChart.Geocontrols())
      .enableProduct("globe");
    globe.current = chart;
    setGlobeReady(true);
    syncPoints(events);

    // globe 자동 회전 (Osiris 느낌)
    chart.startGlobeRotate(0.002, 0.001);

    return () => {
      chart._destructor?.();
      globe.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // events prop 변경 시 동기화 (globe 초기화 이후)
  useEffect(() => {
    if (globeReady) syncPoints(events);
  }, [events, globeReady, syncPoints]);

  return (
    <div
      className="relative w-full h-full min-h-[280px] overflow-hidden rounded-xl bg-[#0a0a12] border border-white/5"
      style={{ aspectRatio: "16 / 9" }}
    >
      {/* 글로브 컨테이너 */}
      <div ref={globeEl} className="absolute inset-0" />

      {/* 오버레이: 상태 배지 + 새로고침 */}
      <div className="absolute top-3 left-3 flex items-center gap-2">
        <span
          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium backdrop-blur-sm"
          style={{
            backgroundColor: isOnline
              ? "rgba(16,185,129,0.15)"
              : "rgba(245,158,11,0.15)",
            color: isOnline ? "#10b981" : "#f59e0b",
            border: "1px solid currentColor",
          }}
        >
          {isOnline ? (
            <>
              <ScanLine size={12} /> 라이브
            </>
          ) : (
            <>
              <ScanLine size={12} className="animate-pulse" /> 오프라인 데모
            </>
          )}
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
        onClick={onRefresh}
        className="absolute top-3 right-3 flex items-center gap-1.5 rounded-md bg-white/5 backdrop-blur-sm px-2.5 py-1.5 text-xs text-white/70 hover:bg-white/10 hover:text-white transition-colors border border-white/5"
        title="다시 조회"
      >
        <RefreshCw size={12} className={onRefresh ? "" : "animate-spin"} />
        <span className="hidden sm:inline">새로고침</span>
      </button>

      {/* 로딩 인디케이터 */}
      {!globeReady && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex items-center gap-2 rounded-lg bg-white/5 px-4 py-2 text-white/60 text-sm backdrop-blur-sm">
            <RefreshCw size={14} className="animate-spin" />
            로딩 중…
          </div>
        </div>
      )}
    </div>
  );
};
