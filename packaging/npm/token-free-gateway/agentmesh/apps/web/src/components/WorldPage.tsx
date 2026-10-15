/**
 * World page — Pythia World Engine panel.
 *
 * Shows the live world state (40+ keyless feeds) and 1d/1w/1m/1y forecasts
 * from the Pythia upstream. Free LLM API-backed: no Ollama, no keys, no cost.
 * Degrades to an offline snapshot when PYTHIA_WORLD_URL is unset or the
 * engine is unreachable — the panel never crashes.
 */

import { Activity, Globe2, RefreshCw, TrendingUp, Layers } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { WorldGlobe, eventPosition } from "./WorldGlobe";
import { WorldMeshPanel } from "./WorldMeshPanel";
import { GlobeVisualization } from "./GlobeVisualization";
import { OntologyExplorer } from "./OntologyExplorer";
import type { DemoCellData, H3CellAggregation } from "@agentmesh/peer-mesh";
import { createDemoFallbackConfig, createDemoVisualizationData } from "@agentmesh/peer-mesh";
import { latLngToCell, cellToLatLng } from "h3-js";

interface WorldEvent {
	id: string;
	title: string;
	domain: string;
	location?: string;
	severity: "info" | "watch" | "alert";
	source: string;
	timestamp: string;
}

interface WorldPrediction {
	id: string;
	title: string;
	horizon: "24h" | "1w" | "1m" | "1y";
	probability: number;
	confidence: number;
	rationale: string;
}

interface WorldBrief {
	source: "pythia" | "offline";
	summary: string;
	domains: string[];
	events: WorldEvent[];
	predictions: WorldPrediction[];
	fetchedAt: string;
}

const HORIZONS: ReadonlyArray<{ key: "24h" | "1w" | "1m" | "1y"; label: string }> = [
	{ key: "24h", label: "24시간" },
	{ key: "1w", label: "1주" },
	{ key: "1m", label: "1개월" },
	{ key: "1y", label: "1년" },
];

/** World 페이지 뷰: 브리프(피드+예측) ↔ World Mesh(글로브+Pythia+개념) */
type WorldView = "brief" | "mesh" | "ontology";

const WORLD_VIEWS: ReadonlyArray<{ id: WorldView; label: string }> = [
	{ id: "brief", label: "브리프" },
	{ id: "mesh", label: "World Mesh" },
	{ id: "ontology", label: "Ontology" },
];

function severityColor(severity: WorldEvent["severity"]): string {
	if (severity === "alert") return "var(--cline-rose, #f43f5e)";
	if (severity === "watch") return "var(--cline-amber, #f59e0b)";
	return "var(--cline-green, #10b981)";
}

function probabilityColor(p: number): string {
	if (p >= 0.7) return "var(--cline-rose, #f43f5e)";
	if (p >= 0.4) return "var(--cline-amber, #f59e0b)";
	return "var(--cline-green, #10b981)";
}

function impactTierToColor(tier: string): string {
	switch (tier) {
		case "critical": return "#ef4444";
		case "high": return "#f59e0b";
		case "medium": return "#38bdf8";
		case "low": return "#10b981";
		default: return "#38bdf8";
	}
}

export const WorldPage: React.FC = () => {
	const [brief, setBrief] = useState<WorldBrief | null>(null);
	const [loading, setLoading] = useState(false);
	const [horizon, setHorizon] = useState<"24h" | "1w" | "1m" | "1y">("1w");
	const [view, setView] = useState<WorldView>("brief");
	const [selectedCell, setSelectedCell] = useState<H3CellAggregation | null>(null);

	// Convert events to H3 cell aggregations for hexagon globe
	const cells = useMemo((): H3CellAggregation[] => {
	if (!brief?.events.length) return [];
	const cellMap = new Map<string, H3CellAggregation>();
	brief.events.forEach((event) => {
	const position = eventPosition(event);
	if (!position) return;
	const [lat, lng] = position;
	const cellId = latLngToCell(lat, lng, 4);
	if (!cellMap.has(cellId)) {
	const [centerLat, centerLng] = cellToLatLng(cellId) as [number, number];
	const now = Date.now();
	cellMap.set(cellId, {
		h3CellId: cellId,
	resolution: 4,
	bounds: [{ lat, lng }],
	center: { lat: centerLat, lng: centerLng },
	peerCount: 0,
	activePeerIds: [],
	cachedChunkCount: 0,
	uniqueModelIds: [],
	uniqueChunkCids: [],
	activeInferenceCount: 0,
		totalInferencesLast24h: 0,
	avgLatencyMs: 0,
	avgTokensPerSecond: 0,
	quorumSuccessRate: 1,
		evidenceCount: 0,
	verifiedEvidenceCount: 0,
	unverifiedEvidenceCount: 0,
	forecastCount: 0,
	avgForecastConfidence: 0,
		highImpactForecastCount: 0,
	impactTier: "low",
	impactScore: 0,
	windowStart: now - 86_400_000,
	windowEnd: now,
	lastUpdated: now,
	});
	}
	const cell = cellMap.get(cellId)!;
	cell.peerCount += 1;
	cell.activeInferenceCount += 1;
	cell.totalInferencesLast24h += 1;
	const severityWeight = event.severity === "alert" ? 1 : event.severity === "watch" ? 0.65 : 0.3;
	cell.impactScore = Math.max(cell.impactScore, severityWeight);
	if (event.severity === "alert") cell.impactTier = "critical";
	else if (event.severity === "watch" && cell.impactTier !== "critical") cell.impactTier = "high";
	});
	return Array.from(cellMap.values());
	}, [brief?.events]);
	const ontologyData = useMemo<DemoCellData>(() => {
	const demoData = createDemoVisualizationData(createDemoFallbackConfig({ seed: 12345 }), Date.now());
	if (!brief || brief.source !== "pythia") return { ...demoData, cells };
	const sourceEvents = brief.events.map((event) => {
	const position = eventPosition(event);
	return {
	id: event.id,
		type: "inference_completed" as const,
		timestamp: Number.isFinite(Date.parse(event.timestamp)) ? Date.parse(event.timestamp) : Date.now(),
		source: "p2p_inference" as const,
		taskId: event.id,
	modelId: `world:${event.domain}`,
	modelVersion: "world-feed",
	peerId: event.source || "pythia-world",
	quantization: "unknown",
	backend: "world-feed",
	promptTokens: 0,
	completionTokens: 0,
	latencyMs: 0,
		tokensPerSecond: 0,
	cacheHit: false,
	provenance: { modelChunkCids: [], servingPeerIds: [], verificationPeerIds: [] },
		...(position ? { peerLocation: { lat: position[0], lng: position[1] } } : {}),
	};
	});
	const forecasts = brief.predictions.map((prediction) => {
	const sourceEventId = brief.events.find(
	(event) => event.domain === prediction.title.split(/[:—-]/, 1)[0]?.trim(),
	)?.id ?? sourceEvents[0]?.id ?? prediction.id;
	const probability = Math.max(0, Math.min(1, prediction.probability));
	return {
	id: prediction.id,
		eventId: sourceEventId,
		timestamp: Number.isFinite(Date.parse(brief.fetchedAt)) ? Date.parse(brief.fetchedAt) : Date.now(),
		horizon: prediction.horizon,
	probability,
	confidence: Math.max(0, Math.min(1, prediction.confidence)),
		rationale: prediction.rationale,
	modelId: "pythia-world",
	modelVersion: "world-feed",
	impactTier: probability >= 0.8 ? "critical" as const : probability >= 0.6 ? "high" as const : probability >= 0.35 ? "medium" as const : "low" as const,
	impactScore: probability,
		domain: brief.events.find((event) => event.id === sourceEventId)?.domain ?? "world",
	...(brief.events.find((event) => event.id === sourceEventId)?.location
	? { location: brief.events.find((event) => event.id === sourceEventId)?.location }
	: {}),
		sourceEventId,
		evidenceIds: [],
	derivedFromModelId: "pythia-world",
	};
	});
	const provenance = forecasts.map((forecast) => ({
		sourceId: forecast.id,
		targetId: forecast.sourceEventId,
	predicate: "derived_from" as const,
	strength: forecast.probability,
	confidence: forecast.confidence,
		evidenceEventIds: [forecast.sourceEventId],
	createdAt: forecast.timestamp,
	metadata: { domain: forecast.domain, horizon: forecast.horizon },
	}));
	return {
	cells,
		events: sourceEvents,
	forecasts,
		evidence: [],
	provenance,
	};
	}, [brief, cells]);
	const handleCellClick = useCallback((cell: H3CellAggregation) => {
		setSelectedCell(cell);
	}, []);

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const res = await fetch("/api/world/brief", { credentials: "include" });
			if (!res.ok) throw new Error(`World brief returned HTTP ${res.status}`);
			const payload = (await res.json()) as Partial<WorldBrief>;
			setBrief({
				source: payload.source === "pythia" ? "pythia" : "offline",
				summary: typeof payload.summary === "string" ? payload.summary : "World brief is unavailable.",
				domains: Array.isArray(payload.domains) ? payload.domains.filter((domain): domain is string => typeof domain === "string") : [],
				events: Array.isArray(payload.events) ? payload.events.filter((event): event is WorldEvent => Boolean(event && typeof event.id === "string" && typeof event.title === "string" && typeof event.domain === "string" && typeof event.timestamp === "string" && typeof event.source === "string" && (event.severity === "info" || event.severity === "watch" || event.severity === "alert"))) : [],
				predictions: Array.isArray(payload.predictions) ? payload.predictions.filter((prediction): prediction is WorldPrediction => Boolean(prediction && typeof prediction.id === "string" && typeof prediction.title === "string" && (prediction.horizon === "24h" || prediction.horizon === "1w" || prediction.horizon === "1m" || prediction.horizon === "1y") && Number.isFinite(prediction.probability) && Number.isFinite(prediction.confidence) && typeof prediction.rationale === "string")) : [],
			fetchedAt: typeof payload.fetchedAt === "string" ? payload.fetchedAt : new Date().toISOString(),
			});
		} catch {
			// panel uses the ontology demo fallback when the API is unavailable
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		load();
	}, [load]);

	// 렌더마다 새 배열이 만들어지면 글로브 마커 갱신 effect가 매번 다시 돌므로 고정한다.
	const events = useMemo(() => brief?.events ?? [], [brief]);
	const predictions = (brief?.predictions ?? []).filter((p) => p.horizon === horizon);
	const live = brief?.source === "pythia";

	return (
		<div className="cline-chat-container">
			{/* 뷰 전환: 브리프 ↔ World Mesh */}
			<div style={{ display: "flex", gap: 6, marginBottom: 12 }} data-testid="world-view-tabs">
				{WORLD_VIEWS.map((v) => (
					<button
						key={v.id}
						type="button"
						onClick={() => setView(v.id)}
						style={{
							fontSize: 12,
							padding: "4px 12px",
							borderRadius: 999,
							cursor: "pointer",
							border: `1px solid ${
								view === v.id ? "#38bdf8" : "var(--cline-border, rgba(255,255,255,0.1))"
							}`,
							background: view === v.id ? "rgba(56,189,248,0.15)" : "transparent",
							color: view === v.id ? "#38bdf8" : "var(--cline-text-muted)",
						}}
					>
						{v.label}
					</button>
				))}
			</div>

			{view === "ontology" ? (
				<OntologyExplorer data={ontologyData} forceDemo={!brief || brief.source !== "pythia"} />
			) : view === "mesh" ? (
				<div style={{ height: "calc(100vh - 200px)", minHeight: 500 }}>
					<GlobeVisualization
						cells={cells}
						resolution={4}
						onCellClick={handleCellClick}
						selectedCellId={selectedCell?.h3CellId}
						autoRotate={true}
						autoRotateSpeed={0.3}
						theme="dark"
						showAtmosphere={true}
						backgroundColor="#0a0a12"
					/>
					{selectedCell && (
						<div
							style={{
								position: "fixed",
								bottom: 20,
								right: 20,
								width: 320,
								maxHeight: "40vh",
								overflow: "auto",
								padding: 16,
								background: "var(--cline-surface)",
								border: "1px solid var(--cline-border)",
								borderRadius: 12,
								boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
								zIndex: 100,
							}}
						>
							<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
								<h3 style={{ margin: 0, fontSize: 14, color: "var(--cline-text)" }}>
									Cell {selectedCell.h3CellId.slice(0, 12)}…
								</h3>
								<button
									onClick={() => setSelectedCell(null)}
									style={{
										background: "none",
										border: "none",
										color: "var(--cline-text-muted)",
										cursor: "pointer",
										fontSize: 18,
										lineHeight: 1,
									}}
								>
									×
								</button>
							</div>
							<div style={{ fontSize: 12, color: "var(--cline-text-muted)", lineHeight: 1.8 }}>
								<div><strong>Resolution:</strong> {selectedCell.resolution}</div>
								<div><strong>Events:</strong> {selectedCell.peerCount}</div>
								<div><strong>Impact:</strong> <span style={{ color: impactTierToColor(selectedCell.impactTier), textTransform: "capitalize" }}>{selectedCell.impactTier}</span></div>
								<div><strong>Center:</strong> {selectedCell.center.lat.toFixed(4)}, {selectedCell.center.lng.toFixed(4)}</div>
							</div>
						</div>
					)}
				</div>
			) : (
				<>
					<div className="dashboard-hero-card" style={{ padding: "20px 24px" }}>
						<div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
							<Globe2 size={28} style={{ color: "#38bdf8" }} />
							<div style={{ flex: 1 }}>
								<h1 className="dashboard-hero-title" style={{ fontSize: 20 }}>
									World — Pythia World Engine
								</h1>
								<p className="dashboard-hero-desc">
									40+ 키리스 라이브 피드를 하나의 세계 상태로 통합하고 24h/1w/1m/1y 예측을 제공.
									Free LLM API 기반 — 키 없이, 비용 없이.
								</p>
							</div>
							<span
								style={{
									fontSize: 11,
									fontWeight: 700,
									padding: "3px 10px",
									borderRadius: 999,
									background: live ? "rgba(16,185,129,0.15)" : "rgba(148,163,184,0.15)",
									color: live ? "var(--cline-green, #10b981)" : "#94a3b8",
								}}
							>
								{live ? "LIVE" : "OFFLINE"}
							</span>
							<button
								type="button"
								onClick={load}
								disabled={loading}
								style={{
									background: "transparent",
									border: "1px solid var(--cline-border, rgba(255,255,255,0.1))",
									borderRadius: 6,
									padding: "6px 10px",
									cursor: "pointer",
									color: "var(--cline-text)",
									display: "flex",
									alignItems: "center",
									gap: 6,
								}}
							>
								<RefreshCw size={14} /> 새로고침
							</button>
						</div>
					</div>

					{brief && (
						<div className="result-card" style={{ marginTop: 16, padding: 16 }}>
							<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
								<Activity size={14} style={{ color: "#38bdf8" }} />
								<span style={{ fontSize: 12, fontWeight: 700, color: "var(--cline-text)" }}>
									WORLD BRIEF
								</span>
							</div>
							<p style={{ fontSize: 13, color: "var(--cline-text-muted)", lineHeight: 1.6 }}>
								{brief.summary}
							</p>
							<div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
								{brief.domains.map((d) => (
									<span
										key={d}
										style={{
											fontSize: 11,
											padding: "2px 8px",
											borderRadius: 999,
											background: "rgba(56,189,248,0.12)",
											color: "#38bdf8",
										}}
									>
										{d}
									</span>
								))}
							</div>
						</div>
					)}

					{/* 라이브 글로브 — Osiris 스타일 세계 지도 */}
					<div className="result-card" style={{ marginTop: 16, padding: 0, overflow: "hidden" }}>
						<WorldGlobe
							events={events}
							isOnline={live}
							lastUpdated={brief?.fetchedAt}
							onRefresh={load}
						/>
					</div>

					<div style={{ display: "flex", gap: 16, marginTop: 16, flexWrap: "wrap" }}>
						<div style={{ flex: 1, minWidth: 300 }}>
							<h3 style={{ color: "var(--cline-text)", fontSize: 14, marginBottom: 10 }}>
								실시간 이벤트 ({events.length})
							</h3>
							{events.length === 0 && (
								<p style={{ color: "var(--cline-text-muted)", fontSize: 13 }}>이벤트가 없습니다.</p>
							)}
							{events.slice(0, 20).map((e) => (
								<div
									key={e.id}
									style={{
										padding: "10px 14px",
										background: "var(--cline-bg-tertiary, rgba(255,255,255,0.03))",
										borderRadius: 8,
										marginBottom: 8,
										borderLeft: `3px solid ${severityColor(e.severity)}`,
									}}
								>
									<div style={{ fontSize: 13, color: "var(--cline-text)" }}>{e.title}</div>
									<div
										style={{
											fontSize: 11,
											color: "var(--cline-text-muted)",
											marginTop: 4,
											display: "flex",
											gap: 8,
										}}
									>
										<span>{e.domain}</span>
										{e.location && <span>· {e.location}</span>}
										<span>· {e.source}</span>
									</div>
								</div>
							))}
						</div>

						<div style={{ flex: 1, minWidth: 300 }}>
							<h3 style={{ color: "var(--cline-text)", fontSize: 14, marginBottom: 10 }}>
								예측 (Prediction)
							</h3>
							<div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
								{HORIZONS.map((h) => (
									<button
										key={h.key}
										type="button"
										onClick={() => setHorizon(h.key)}
										style={{
											fontSize: 12,
											padding: "4px 10px",
											borderRadius: 999,
											border:
												horizon === h.key
													? "1px solid #38bdf8"
													: "1px solid var(--cline-border, rgba(255,255,255,0.1))",
											background: horizon === h.key ? "rgba(56,189,248,0.15)" : "transparent",
											color: horizon === h.key ? "#38bdf8" : "var(--cline-text-muted)",
											cursor: "pointer",
										}}
									>
										{h.label}
									</button>
								))}
							</div>
							{predictions.length === 0 && (
								<p style={{ color: "var(--cline-text-muted)", fontSize: 13 }}>
									해당 기간 예측이 없습니다.
								</p>
							)}
							{predictions.map((p) => (
								<div
									key={p.id}
									style={{
										padding: "10px 14px",
										background: "var(--cline-bg-tertiary, rgba(255,255,255,0.03))",
										borderRadius: 8,
										marginBottom: 8,
									}}
								>
									<div
										style={{
											display: "flex",
											justifyContent: "space-between",
											alignItems: "center",
											gap: 8,
										}}
									>
										<span style={{ fontSize: 13, color: "var(--cline-text)" }}>
											<TrendingUp
												size={12}
												style={{
													verticalAlign: -1,
													marginRight: 6,
													color: probabilityColor(p.probability),
												}}
											/>
											{p.title}
										</span>
										<span
											style={{
												fontSize: 12,
												fontWeight: 700,
												color: probabilityColor(p.probability),
												whiteSpace: "nowrap",
											}}
										>
											{Math.round(p.probability * 100)}%
										</span>
									</div>
									{p.rationale && (
										<div
											style={{
												fontSize: 11,
												color: "var(--cline-text-muted)",
												marginTop: 6,
												lineHeight: 1.5,
											}}
										>
											{p.rationale}
										</div>
									)}
								</div>
							))}
						</div>
					</div>

					{brief && (
						<p style={{ fontSize: 11, color: "var(--cline-text-muted)", marginTop: 16 }}>
							fetched {new Date(brief.fetchedAt).toLocaleString("ko-KR")} · source: {brief.source}
						</p>
					)}
				</>
			)}
		</div>
	);
};

export default WorldPage;
