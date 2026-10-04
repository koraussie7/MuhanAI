/**
 * Part 3 — OntologyExplorer
 *
 * Visualizes the Pythia·LocalCrab·Ontology·H3 integration:
 *  - 4 ontology concept cards (from cosmos-core types)
 *  - H3 hexagon globe (SVG-based using h3-js + latLngToCell/cellToBoundary)
 *  - Cell click → CellSelection drawer (events, forecasts, evidence, provenance)
 *  - Demo fallback mode with seeded PRNG via createDemoVisualizationData
 *
 * Source data flows:
 *   Pythia inference results → PythiaEvent
 *   Model predictions       → PythiaForecast
 *   Input/sources           → LocalCrabEvidence
 *   Concept/provenance      → ProvenanceRelation
 *   H3 cell aggregations    → H3CellAggregation
 */

import { Globe, Layers, RefreshCw, Search, Sparkles, TrendingUp, Users, Zap } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { latLngToCell, cellToLatLng, cellToBoundary, isValidCell } from "h3-js";
import type { H3CellAggregation } from "@agentmesh/peer-mesh";
import {
	createCellSelection,
	createDemoFallbackConfig,
	createDemoVisualizationData,
	type CellSelection,
	type DemoCellData,
	type DashboardPanelId,
	type DashboardPanelLink,
	DASHBOARD_PANEL_LINKS,
	getDashboardPanelLink,
	impactTierToColor,
	scoreToImpactTier,
	impactTierToScore,
	mulberry32,
	type PythiaEvent,
	type PythiaForecast,
	type LocalCrabEvidence,
	type ProvenanceRelation,
	type ImpactTier,
} from "@agentmesh/peer-mesh";
import { conceptId, parseConceptId } from "@agentmesh/cosmos-core";
import type { OntologyConcept, OntologyRelation } from "@agentmesh/cosmos-core";
import { useI18n } from "../i18n.js";
import { useMeshPulse } from "../hooks/useMeshPulse.js";

const API = import.meta.env.VITE_API_BASE ?? "";
const H3_RESOLUTION = 4;

// ---------------------------------------------------------------------------
// Demo data
// ---------------------------------------------------------------------------

const BASE_CITY_COORDS: Array<{ name: string; lat: number; lng: number }> = [
	{ name: "Seoul", lat: 37.5665, lng: 126.978 },
	{ name: "Tokyo", lat: 35.6762, lng: 139.6503 },
	{ name: "New York", lat: 40.7128, lng: -74.006 },
	{ name: "London", lat: 51.5074, lng: -0.1278 },
	{ name: "Paris", lat: 48.8566, lng: 2.3522 },
	{ name: "Berlin", lat: 52.52, lng: 13.405 },
	{ name: "San Francisco", lat: 37.7749, lng: -122.4194 },
	{ name: "Sydney", lat: -33.8688, lng: 151.2093 },
	{ name: "Singapore", lat: 1.3521, lng: 103.8198 },
	{ name: "Dubai", lat: 25.2048, lng: 55.2708 },
	{ name: "Mumbai", lat: 19.076, lng: 72.8777 },
	{ name: "São Paulo", lat: -23.5505, lng: -46.6333 },
	{ name: "Moscow", lat: 55.7558, lng: 37.6173 },
	{ name: "Cape Town", lat: -33.9249, lng: 18.4241 },
	{ name: "Mexico City", lat: 19.4326, lng: -99.1332 },
	{ name: "Jakarta", lat: -6.2088, lng: 106.8456 },
	{ name: "Nairobi", lat: -1.2921, lng: 36.8219 },
	{ name: "Toronto", lat: 43.6532, lng: -79.3832 },
	{ name: "Shanghai", lat: 31.2304, lng: 121.4737 },
	{ name: "Bangkok", lat: 13.7563, lng: 100.5018 },
];

const DEMO_CONCEPTS: Array<{ domain: string; label: string; count: number; color: string }> = [
	{ domain: "technology", label: "AI Infrastructure", count: 1247, color: "#38bdf8" },
	{ domain: "markets", label: "Global Markets", count: 892, color: "#10b981" },
	{ domain: "cybersecurity", label: "Security Threats", count: 432, color: "#f59e0b" },
	{ domain: "climate", label: "Climate Patterns", count: 654, color: "#8b5cf6" },
];

// ---------------------------------------------------------------------------
// H3 helpers
// ---------------------------------------------------------------------------

export function locationToH3(lat: number, lng: number, res: number): string {
	return latLngToCell(lat, lng, res) as string;
}

export function h3ToCenter(cellId: string): { lat: number; lng: number } {
	if (!isValidCell(cellId)) return { lat: 0, lng: 0 };
	const [lat, lng] = cellToLatLng(cellId) as [number, number];
	return { lat, lng };
}

export function h3ToBoundary(cellId: string): Array<{ lat: number; lng: number }> {
	if (!isValidCell(cellId)) return [];
	return (cellToBoundary(cellId) as [number, number][]).map(([lat, lng]) => ({ lat, lng }));
}

/**
 * Project an H3 cell's boundary (lat/lng) onto SVG viewport coordinates.
 * Returns points for an SVG polygon.
 */
export function h3ToSvgPoints(
	cellId: string,
	viewport: { width: number; height: number },
	projection?: "mercator" | "equirectangular",
): string {
	const boundary = h3ToBoundary(cellId);
	if (boundary.length === 0) return "";

	const proj = projection ?? "equirectangular";
	const points = boundary.map((pt) => {
		// Normalize lat/lng to 0..1
		const xNorm = (pt.lng + 180) / 360;
		let yNorm: number;
		if (proj === "mercator") {
			const latRad = (pt.lat * Math.PI) / 180;
			yNorm = 0.5 - Math.log(Math.tan(Math.PI / 4 + latRad / 2)) / (2 * Math.PI);
		} else {
			yNorm = (90 - pt.lat) / 180;
		}
		yNorm = Math.max(0, Math.min(1, yNorm));
		return `${xNorm * viewport.width},${yNorm * viewport.height}`;
	});

	return points.join(" ");
}

/**
 * Build H3 cell aggregations from PythiaEvents using their peerLocation.
 */
export function buildAggregationsFromEvents(
	events: PythiaEvent[],
	resolution: number,
): H3CellAggregation[] {
	const cellMap = new Map<string, H3CellAggregationInput>();

	for (const event of events) {
		if (!event.peerLocation) continue;

		const cellId = locationToH3(event.peerLocation.lat, event.peerLocation.lng, resolution);

		const existing = cellMap.get(cellId);
		if (existing) {
			cellMap.set(cellId, {
				...existing,
				bounds: [...existing.bounds, event.peerLocation],
			});
		} else {
			cellMap.set(cellId, {
				h3CellId: cellId,
				resolution,
				center: event.peerLocation,
				bounds: [event.peerLocation],
			});
		}
	}

	const eventsByCell = new Map<string, PythiaEvent[]>();
	for (const event of events) {
		if (!event.peerLocation) continue;
		const cellId = locationToH3(event.peerLocation.lat, event.peerLocation.lng, resolution);
		if (!eventsByCell.has(cellId)) eventsByCell.set(cellId, []);
		eventsByCell.get(cellId)!.push(event);
	}

	const cells: H3CellAggregation[] = [];

	for (const [cellId, input] of cellMap) {
		const cellEvents = eventsByCell.get(cellId) ?? [];
		const peerIds = [...new Set(cellEvents.map((e) => e.peerId))];
		const modelIds = [...new Set(cellEvents.map((e) => e.modelId))];
		const chunkCids = [...new Set(cellEvents.flatMap((e) => e.provenance.modelChunkCids))];

		const avgLatency =
			cellEvents.length > 0
				? cellEvents.reduce((sum, e) => sum + e.latencyMs, 0) / cellEvents.length
				: 0;
		const avgTps =
			cellEvents.length > 0
				? cellEvents.reduce((sum, e) => sum + e.tokensPerSecond, 0) / cellEvents.length
				: 0;
		const quorumRate =
			cellEvents.length > 0
				? cellEvents.filter(
						(e) => e.provenance.quorumPeerIds && e.provenance.quorumPeerIds.length >= 2,
					).length / cellEvents.length
				: 0;

		const impactScore = cellEvents.length / 200;

		cells.push(
			createCellAggregation(input, {
				peerCount: peerIds.length,
				activePeerIds: peerIds,
				cachedChunkCount: chunkCids.length,
				uniqueModelIds: modelIds,
				uniqueChunkCids: chunkCids,
				activeInferenceCount: cellEvents.filter((e) => e.type === "inference_completed").length,
				totalInferencesLast24h: cellEvents.length,
				avgLatencyMs: avgLatency,
				avgTokensPerSecond: avgTps,
				quorumSuccessRate: quorumRate,
				evidenceCount: 0,
				verifiedEvidenceCount: 0,
				unverifiedEvidenceCount: 0,
				forecastCount: 0,
				avgForecastConfidence: 0,
				highImpactForecastCount: 0,
				impactTier: scoreToImpactTier(impactScore),
				impactScore,
			}),
		);
	}

	return cells.sort((a, b) => b.peerCount - a.peerCount);
}

interface H3CellAggregationInput {
	h3CellId: string;
	resolution: number;
	center: { lat: number; lng: number };
	bounds: { lat: number; lng: number }[];
}

function createCellAggregation(
	input: H3CellAggregationInput,
	metrics: Partial<H3CellAggregation>,
): H3CellAggregation {
	const now = Date.now();
	return {
		h3CellId: input.h3CellId,
		resolution: input.resolution,
		bounds: input.bounds,
		center: input.center,
		peerCount: 0,
		activePeerIds: [],
		cachedChunkCount: 0,
		uniqueModelIds: [],
		uniqueChunkCids: [],
		activeInferenceCount: 0,
		totalInferencesLast24h: 0,
		avgLatencyMs: 0,
		avgTokensPerSecond: 0,
		quorumSuccessRate: 0,
		evidenceCount: 0,
		verifiedEvidenceCount: 0,
		unverifiedEvidenceCount: 0,
		forecastCount: 0,
		avgForecastConfidence: 0,
		highImpactForecastCount: 0,
		impactTier: "low",
		impactScore: 0,
		windowStart: now - 86400000,
		windowEnd: now,
		lastUpdated: now,
		...metrics,
	};
}

// ---------------------------------------------------------------------------
// Demo concept cards
// ---------------------------------------------------------------------------

export interface OntologyCardData {
	id: string;
	domain: string;
	label: string;
	conceptId: string;
	conceptCount: number;
	relationCount: number;
	amplificationScore: number;
	color: string;
	icon: React.ReactNode;
}

export function getDemoOntologyCards(): OntologyCardData[] {
	return DEMO_CONCEPTS.map((c) => ({
		id: c.domain,
		domain: c.domain,
		label: c.label,
		conceptId: conceptId(c.domain, c.label),
		conceptCount: c.count,
		relationCount: Math.floor(c.count * 0.3),
		amplificationScore: Math.min(1, c.count / 1500),
		color: c.color,
		icon: <Globe size={16} />,
	}));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface OntologyExplorerProps {
	/** Route handler for navigation to other dashboard panels */
	onNavigate?: (route: string) => void;
	/** Live data overrides; falls back to demo data when absent */
	data?: DemoCellData;
	/** When true, ignores live data and uses seeded demo */
	forceDemo?: boolean;
	/** H3 resolution for cell aggregation (1-15) */
	resolution?: number;
}

export const OntologyExplorer: React.FC<OntologyExplorerProps> = ({
	onNavigate,
	data: externalData,
	forceDemo = false,
	resolution = H3_RESOLUTION,
}) => {
	const { t } = useI18n();
	const { stats: meshStats } = useMeshPulse();

	const [data, setData] = useState<DemoCellData | null>(externalData ?? null);
	const [selectedCell, setSelectedCell] = useState<CellSelection | null>(null);
	const [selectedConceptId, setSelectedConceptId] = useState<string | null>(null);
	const [isDemo, setIsDemo] = useState<boolean>(forceDemo);
	const [loading, setLoading] = useState<boolean>(!externalData);

	// Load live data from API or generate demo data
	useEffect(() => {
		if (externalData) {
			setData(externalData);
			setIsDemo(false);
			setLoading(false);
			return;
		}

		if (forceDemo) {
			const config = createDemoFallbackConfig({ seed: 12345 });
			const demoData = createDemoVisualizationData(config, Date.now());
			setData(demoData);
			setIsDemo(true);
			setLoading(false);
			return;
		}

		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 8000);

		const load = async () => {
			try {
				const res = await fetch(`${API}/api/p3/visualization`, {
					signal: controller.signal,
				});
				if (!res.ok) throw new Error(`status ${res.status}`);
				const payload = await res.json();

				setData({
					cells: payload.cells ?? [],
					events: payload.events ?? [],
					forecasts: payload.forecasts ?? [],
					evidence: payload.evidence ?? [],
					provenance: payload.provenance ?? [],
				});
				setIsDemo(false);
			} catch {
				// Fallback to demo data
				const config = createDemoFallbackConfig({ seed: 12345 });
				const demoData = createDemoVisualizationData(config, Date.now());
				setData(demoData);
				setIsDemo(true);
			} finally {
				setLoading(false);
				clearTimeout(timeout);
			}
		};

		void load();
		return () => {
			clearTimeout(timeout);
			controller.abort();
		};
	}, [externalData, forceDemo, API]);

	// Build H3 aggregations from events if external data was provided without cells
	const cells = useMemo(() => {
		if (!data) return [];
		if (data.cells.length > 0) return data.cells;
		return buildAggregationsFromEvents(data.events, resolution);
	}, [data, resolution]);

	// Demo concept cards
	const conceptCards = useMemo(() => getDemoOntologyCards(), []);

	// Selected cell drawer
	const handleCellClick = useCallback(
		(cell: H3CellAggregation) => {
			const cellEvents = data?.events.filter(
				(e) =>
					e.peerLocation &&
					Math.abs(h3ToCenter(cell.h3CellId).lat - e.peerLocation.lat) < 0.001 &&
					Math.abs(h3ToCenter(cell.h3CellId).lng - e.peerLocation.lng) < 0.001,
			) ?? [];

			const cellForecasts = data?.forecasts.filter((f) =>
				cellEvents.some((e) => e.id === f.eventId),
			) ?? [];

			const cellEvidence = data?.evidence.filter((e) =>
				e.relatedEventIds.some((id) => cellEvents.some((ev) => ev.id === id)),
			) ?? [];

			const cellProvenance = data?.provenance.filter(
				(r) =>
					r.sourceId === cell.h3CellId ||
					r.targetId === cell.h3CellId ||
					cellEvents.some((e) => e.id === r.sourceId || e.id === r.targetId),
			) ?? [];

			const selection = createCellSelection(
				cell.h3CellId,
				cell.resolution,
				cell,
				cellProvenance,
				cellEvents,
				cellForecasts,
				cellEvidence,
			);

			setSelectedCell(selection);
		},
		[data],
	);

	const handleConceptClick = useCallback((concept: OntologyCardData) => {
		setSelectedConceptId(concept.conceptId);
	}, []);

	const handlePanelNavigate = useCallback(
		(panel: DashboardPanelId) => {
			const link = getDashboardPanelLink(panel);
			if (link && onNavigate) {
				onNavigate(link.route);
			}
		},
		[onNavigate],
	);

	// Render hex globe cells
	const globeCells = useMemo(() => {
		const viewport = { width: 640, height: 360 };
		return cells.map((cell) => {
			const points = h3ToSvgPoints(cell.h3CellId, viewport);
			const center = h3ToSvgPoints(
				cell.h3CellId,
				viewport,
			).split(" ")[0]?.split(",") ?? ["0", "0"];
			return {
				...cell,
				points,
				centerX: Number.parseFloat(center[0] ?? "0"),
				centerY: Number.parseFloat(center[1] ?? "0"),
			};
		});
	}, [cells]);

	if (loading) {
		return (
			<div className="ontology-explorer-loading">
				<div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "center" }}>
					<RefreshCw size={20} className="animate-spin" style={{ color: "var(--cline-sky)" }} />
					<span style={{ color: "var(--cline-text-muted)", fontSize: 13 }}>
						{isDemo ? "Generating demo ontology data…" : "Loading P3 visualization data…"}
					</span>
				</div>
			</div>
		);
	}

	return (
		<main className="ontology-explorer">
			{/* Header */}
			<div className="ontology-header">
				<div className="ontology-title-row">
					<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
						<Layers size={22} style={{ color: "var(--cline-sky)" }} />
						<h1 className="ontology-title">
							Ontology Explorer — Pythia · LocalCrab · H3
						</h1>
					</div>
					{isDemo && (
						<span
							style={{
								fontSize: 11,
								color: "#f59e0b",
								background: "rgba(245, 158, 11, 0.15)",
								padding: "2px 8px",
								borderRadius: 4,
								border: "1px solid rgba(245, 158, 11, 0.3)",
							}}
						>
							DEMO MODE
						</span>
					)}
				</div>

				<p className="ontology-subtitle">
					Distributed inference provenance visualized on H3 hexagonal cells.
					{isDemo
						? " Using seeded demo data — connect to the P2P mesh for live events."
						: " Live data from P2P mesh peers."}
				</p>
			</div>

			{/* Demo Badge / Status */}
			<div className="ontology-status-row">
				<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
					<Zap size={14} style={{ color: meshStats.peers > 0 ? "#10b981" : "#f59e0b" }} />
					<span style={{ fontSize: 12, color: "var(--cline-text-muted)" }}>
						{meshStats.peers > 0
							? `${meshStats.peers} peers connected`
							: "Mesh offline — demo mode"}
					</span>
				</div>

				<div style={{ display: "flex", gap: 8 }}>
					{(DASHBOARD_PANEL_LINKS as ReadonlyArray<DashboardPanelLink>).map((panel) => (
						<button
							key={panel.id}
							type="button"
							className="ontology-panel-link"
							onClick={() => handlePanelNavigate(panel.id)}
							title={panel.description}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 6,
								padding: "6px 10px",
								fontSize: 11,
								color: "var(--cline-text-muted)",
								border: "1px solid var(--cline-border)",
								borderRadius: 6,
								background: "var(--cline-surface)",
								cursor: "pointer",
							}}
						>
							<span style={{ color: panel.id === selectedConceptId ? "var(--cline-sky)" : "var(--cline-text-muted)" }}>
								{panel.icon === "globe" && <Globe size={10} />}
								{panel.icon === "activity" && <Zap size={10} />}
								{panel.icon === "trending-up" && <TrendingUp size={10} />}
								{panel.icon === "search" && <Search size={10} />}
								{panel.icon === "bar-chart-3" && <Users size={10} />}
								{panel.icon === "network" && <Layers size={10} />}
							</span>
							<span>{panel.label}</span>
						</button>
					))}
				</div>
			</div>

			{/* Main Content: Hex Globe + Concept Cards */}
			<div className="ontology-content">
				{/* H3 Hex Globe */}
				<div className="ontology-globe-section">
					<div className="ontology-globe-header">
						<h2 className="ontology-globe-title">H3 Cell Aggregation Globe</h2>
						<span style={{ fontSize: 11, color: "var(--cline-text-muted)" }}>
							Resolution {resolution} · {cells.length} cells active
						</span>
					</div>

					<div className="ontology-globe-canvas" style={{ position: "relative", width: 640, height: 360, margin: "0 auto" }}>
						<svg
							viewBox="0 0 640 360"
							className="ontology-globe-svg"
							style={{ width: "100%", height: "100%" }}
							role="img"
							aria-label="H3 Hexagonal Cell Globe"
						>
							<defs>
								<radialGradient id="globeGradient" cx="50%" cy="50%" r="50%">
									<stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.1" />
									<stop offset="100%" stopColor="#090d16" stopOpacity="0" />
								</radialGradient>
							</defs>

							{/* Background */}
							<rect x="0" y="0" width="640" height="360" fill="#0a0a12" />
							<circle cx="320" cy="180" r="160" fill="url(#globeGradient)" />
							<rect
								x="0"
								y="0"
								width="640"
								height="360"
								fill="url(#globeGradient)"
								opacity="0.5"
								stroke="rgba(255,255,255,0.05)"
								strokeWidth="1"
							/>

							{/* Grid lines */}
							{globeCells.map((cell) => {
								const isSelected = selectedCell?.h3CellId === cell.h3CellId;
								const color = impactTierToColor(cell.impactTier);
								const opacity = isSelected ? 0.8 : 0.3 + (cell.peerCount / 20) * 0.4;

								return (
									<g key={cell.h3CellId}>
										{cell.points && (
											<polygon
												points={cell.points}
												fill={color}
												fillOpacity={opacity}
												stroke={isSelected ? "#ffffff" : color}
												strokeWidth={isSelected ? 2 : 0.5}
												strokeOpacity={isSelected ? 1 : 0.4}
												style={{ cursor: "pointer", transition: "all 0.2s ease" }}
												onClick={() => handleCellClick(cell)}
											/>
										)}
										{isSelected && cell.center && (
											<circle
												cx={cell.centerX}
												cy={cell.centerY}
												r={6 + cell.peerCount * 0.3}
												fill={color}
												fillOpacity="0.8"
												stroke="#ffffff"
												strokeWidth="2"
											/>
										)}
									</g>
								);
							})}
						</svg>
					</div>

					{/* Legend */}
					<div
						style={{
							display: "flex",
							justifyContent: "center",
							gap: 20,
							marginTop: 12,
							fontSize: 11,
							color: "var(--cline-text-muted)",
						}}
					>
						<span style={{ display: "flex", alignItems: "center", gap: 6 }}>
							<span style={{ width: 10, height: 10, borderRadius: 2, background: "#ef4444" }} />
							Critical
						</span>
						<span style={{ display: "flex", alignItems: "center", gap: 6 }}>
							<span style={{ width: 10, height: 10, borderRadius: 2, background: "#f59e0b" }} />
							High
						</span>
						<span style={{ display: "flex", alignItems: "center", gap: 6 }}>
							<span style={{ width: 10, height: 10, borderRadius: 2, background: "#38bdf8" }} />
							Medium
						</span>
						<span style={{ display: "flex", alignItems: "center", gap: 6 }}>
							<span style={{ width: 10, height: 10, borderRadius: 2, background: "#10b981" }} />
							Low
						</span>
					</div>
				</div>

				{/* Concept Cards */}
				<div className="ontology-cards-section">
					<h2 className="ontology-cards-title">Ontology Concepts (4 domains)</h2>
					<div
						style={{
							display: "grid",
							gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
							gap: 12,
						}}
					>
						{conceptCards.map((card) => {
							const parsed = parseConceptId(card.conceptId);
							const isSelected = selectedConceptId === card.conceptId;
							return (
								<button
									key={card.id}
									type="button"
									className={`ontology-concept-card ${isSelected ? "selected" : ""}`}
									onClick={() => handleConceptClick(card)}
									style={{
										padding: 16,
										borderRadius: 10,
										border: isSelected
											? `2px solid ${card.color}`
											: "1px solid var(--cline-border)",
										background: isSelected
											? `${card.color}10`
											: "var(--cline-surface)",
										textAlign: "left",
										cursor: "pointer",
										transition: "all 0.2s ease",
										display: "flex",
										flexDirection: "column",
										gap: 10,
									}}
								>
									<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
										<div
											style={{
												width: 32,
												height: 32,
												borderRadius: 8,
												background: `${card.color}20`,
												display: "flex",
												alignItems: "center",
												justifyContent: "center",
												color: card.color,
											}}
										>
											{card.icon}
										</div>
										<div style={{ flex: 1 }}>
											<div style={{ fontSize: 13, fontWeight: 600, color: "var(--cline-text)" }}>
												{card.label}
											</div>
											<div style={{ fontSize: 10, color: "var(--cline-text-muted)" }}>
												{card.domain}::{parsed.label}
											</div>
										</div>
									</div>

									<div
										style={{
											display: "grid",
											gridTemplateColumns: "1fr 1fr",
											gap: "4px 8px",
											fontSize: 11,
										}}
									>
										<div>
											<span style={{ color: "var(--cline-text-muted)" }}>Concepts</span>
											<strong style={{ color: "var(--cline-text)" }}>{card.conceptCount}</strong>
										</div>
										<div>
											<span style={{ color: "var(--cline-text-muted)" }}>Relations</span>
											<strong style={{ color: "var(--cline-text)" }}>{card.relationCount}</strong>
										</div>
										<div>
											<span style={{ color: "var(--cline-text-muted)" }}>Amplification</span>
											<strong style={{ color: card.color }}>{Math.round(card.amplificationScore * 100)}%</strong>
										</div>
										<div>
											<span style={{ color: "var(--cline-text-muted)" }}>Status</span>
											<strong style={{ color: "#10b981" }}>Live</strong>
										</div>
									</div>
								</button>
							);
						})}
					</div>
				</div>
			</div>

			{/* Cell Selection Drawer */}
			{selectedCell && (
				<aside
					className="ontology-cell-drawer"
					style={{
						marginTop: 20,
						padding: 20,
						background: "var(--cline-surface)",
						border: "1px solid var(--cline-border)",
						borderRadius: 12,
					}}
				>
					<div
						style={{
							display: "flex",
							justifyContent: "space-between",
							alignItems: "center",
							marginBottom: 14,
						}}
					>
						<h3 style={{ margin: 0, color: "var(--cline-text)", fontSize: 14 }}>
							Cell Selection: {selectedCell.h3CellId.slice(0, 12)}…
						</h3>
						<button
							type="button"
							onClick={() => setSelectedCell(null)}
							style={{
								background: "transparent",
								border: "none",
								color: "var(--cline-text-muted)",
								cursor: "pointer",
								fontSize: 12,
							}}
						>
							✕
						</button>
					</div>

					<div
						style={{
							display: "grid",
							gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
							gap: 12,
							marginBottom: 16,
						}}
					>
						<div style={{ padding: 10, background: "var(--cline-bg-tertiary, rgba(255,255,255,0.03))", borderRadius: 6 }}>
							<span style={{ fontSize: 10, color: "var(--cline-text-muted)" }}>Peers</span>
							<div style={{ fontSize: 18, fontWeight: 700, color: "var(--cline-sky)" }}>
								{selectedCell.aggregation.peerCount}
							</div>
						</div>
						<div style={{ padding: 10, background: "var(--cline-bg-tertiary, rgba(255,255,255,0.03))", borderRadius: 6 }}>
							<span style={{ fontSize: 10, color: "var(--cline-text-muted)" }}>Inferences (24h)</span>
							<div style={{ fontSize: 18, fontWeight: 700, color: "var(--cline-green)" }}>
								{selectedCell.aggregation.totalInferencesLast24h}
							</div>
						</div>
						<div style={{ padding: 10, background: "var(--cline-bg-tertiary, rgba(255,255,255,0.03))", borderRadius: 6 }}>
							<span style={{ fontSize: 10, color: "var(--cline-text-muted)" }}>Avg Latency</span>
							<div style={{ fontSize: 18, fontWeight: 700, color: "var(--cline-amber)" }}>
								{Math.round(selectedCell.aggregation.avgLatencyMs)}ms
							</div>
						</div>
						<div style={{ padding: 10, background: "var(--cline-bg-tertiary, rgba(255,255,255,0.03))", borderRadius: 6 }}>
							<span style={{ fontSize: 10, color: "var(--cline-text-muted)" }}>Impact Tier</span>
							<div
								style={{
									fontSize: 14,
									fontWeight: 700,
									color: impactTierToColor(selectedCell.aggregation.impactTier),
								}}
							>
								{selectedCell.aggregation.impactTier.toUpperCase()}
							</div>
						</div>
						<div style={{ padding: 10, background: "var(--cline-bg-tertiary, rgba(255,255,255,0.03))", borderRadius: 6 }}>
							<span style={{ fontSize: 10, color: "var(--cline-text-muted)" }}>Evidence</span>
							<div style={{ fontSize: 18, fontWeight: 700, color: "var(--cline-violet)" }}>
								{selectedCell.aggregation.evidenceCount}
							</div>
						</div>
						<div style={{ padding: 10, background: "var(--cline-bg-tertiary, rgba(255,255,255,0.03))", borderRadius: 6 }}>
							<span style={{ fontSize: 10, color: "var(--cline-text-muted)" }}>Forecasts</span>
							<div style={{ fontSize: 18, fontWeight: 700, color: "#a855f7" }}>
								{selectedCell.aggregation.forecastCount}
							</div>
						</div>
					</div>

					{/* Events list */}
					{selectedCell.relatedEvents.length > 0 && (
						<div style={{ marginBottom: 16 }}>
							<h4 style={{ margin: "0 0 8px 0", fontSize: 12, color: "var(--cline-text-muted)", textTransform: "uppercase" }}>
								Pythia Events ({selectedCell.relatedEvents.length})
							</h4>
							<div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 180, overflow: "auto" }}>
								{selectedCell.relatedEvents.slice(0, 10).map((event) => (
									<div
										key={event.id}
										style={{
											padding: "6px 10px",
											background: "rgba(0,0,0,0.2)",
											borderRadius: 4,
											fontSize: 11,
											fontFamily: "var(--cline-font-mono)",
										}}
									>
										<span style={{ color: "#38bdf8" }}>{event.modelId}</span> ·{" "}
										<span style={{ color: event.cacheHit ? "#10b981" : "#f59e0b" }}>
											{event.cacheHit ? "cache hit" : "miss"}
										</span> ·{" "}
										<span style={{ color: "var(--cline-text-muted)" }}>{Math.round(event.latencyMs)}ms</span> ·{" "}
										<span style={{ color: "var(--cline-text-muted)" }}>
											{event.peerId}
										</span>
									</div>
								))}
							</div>
						</div>
					)}

					{/* Forecasts list */}
					{selectedCell.relatedForecasts.length > 0 && (
						<div style={{ marginBottom: 16 }}>
							<h4 style={{ margin: "0 0 8px 0", fontSize: 12, color: "var(--cline-text-muted)", textTransform: "uppercase" }}>
								Pythia Forecasts ({selectedCell.relatedForecasts.length})
							</h4>
							<div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 150, overflow: "auto" }}>
								{selectedCell.relatedForecasts.slice(0, 5).map((forecast) => (
									<div
										key={forecast.id}
										style={{
											padding: "6px 10px",
											background: "rgba(0,0,0,0.2)",
											borderRadius: 4,
											fontSize: 11,
										}}
									>
										<div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
											<span style={{ color: "var(--cline-text)" }}>{forecast.domain}</span>
											<span
												style={{
													color: impactTierToColor(forecast.impactTier),
													fontWeight: 600,
												}}
											>
												{forecast.impactTier}
											</span>
										</div>
										<div style={{ color: "var(--cline-text-muted)" }}>
											{Math.round(forecast.probability * 100)}% · Conf: {Math.round(forecast.confidence * 100)}%
										</div>
										<div style={{ color: "#94a3b8", fontSize: 10, marginTop: 2 }}>
											{forecast.rationale.slice(0, 80)}
										</div>
									</div>
								))}
							</div>
						</div>
					)}

					{/* Provenance */}
					{selectedCell.relatedProvenance.length > 0 && (
						<div style={{ marginBottom: 16 }}>
							<h4 style={{ margin: "0 0 8px 0", fontSize: 12, color: "var(--cline-text-muted)", textTransform: "uppercase" }}>
								Provenance Relations ({selectedCell.relatedProvenance.length})
							</h4>
							<div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 120, overflow: "auto" }}>
								{selectedCell.relatedProvenance.slice(0, 5).map((rel, idx) => (
									<div
										key={idx}
										style={{
											fontSize: 10,
											fontFamily: "var(--cline-font-mono)",
											color: "var(--cline-text-muted)",
										}}
									>
										<span style={{ color: "#38bdf8" }}>{rel.sourceId.slice(0, 8)}…</span>
										{" → "}
										<span style={{ color: "#a855f7" }}>{rel.predicate}</span>
										{" → "}
										<span style={{ color: "#10b981" }}>{rel.targetId.slice(0, 8)}…</span>
										{" "}
										<span style={{ color: "#64748b" }}>
											(Math.round(rel.strength * 100)%, conf: {Math.round(rel.confidence * 100)}%)
										</span>
									</div>
								))}
							</div>
						</div>
					)}

					{/* Navigation Links */}
					<div
						style={{
							display: "flex",
							gap: 8,
							flexWrap: "wrap",
							fontSize: 11,
						}}
					>
						{DASHBOARD_PANEL_LINKS.map((panel) => (
							<button
								key={panel.id}
								type="button"
								className="ontology-nav-link"
								onClick={() => handlePanelNavigate(panel.id as DashboardPanelId)}
								style={{
									padding: "6px 10px",
									borderRadius: 6,
									border: "1px solid var(--cline-border)",
									background: "var(--cline-bg-tertiary, rgba(255,255,255,0.03))",
									color: "var(--cline-text-muted)",
									cursor: "pointer",
									whiteSpace: "nowrap",
								}}
								title={panel.description}
							>
								{panel.label}
							</button>
						))}
					</div>
				</aside>
			)}

			{/* Empty state */}
			{!selectedCell && (
				<div
					style={{
						marginTop: 20,
						padding: 16,
						textAlign: "center",
						color: "var(--cline-text-muted)",
						fontSize: 12,
					}}
				>
					Click a hexagon on the globe to inspect its cell aggregation, events, and provenance.
				</div>
			)}
		</main>
	);
};

export default OntologyExplorer;

// ---------------------------------------------------------------------------
// CSS-in-JS inline styles are used above; these are class names for external CSS
// ---------------------------------------------------------------------------
