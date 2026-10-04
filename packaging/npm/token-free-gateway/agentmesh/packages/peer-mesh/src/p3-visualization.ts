/**
 * Part 3 — Pythia·LocalCrab·Ontology·H3 Visualization Types
 *
 * Shared types for the visualization layer connecting:
 * - Inference results → PythiaEvent
 * - Model predictions → PythiaForecast
 * - Input/sources → LocalCrab Evidence
 * - Model/chunk/peer provenance relations
 * - H3 cell aggregations
 */

import type { QuantizationFormat, ComputeBackend } from "./p2p-inference.js";

// ---------------------------------------------------------------------------
// Provenance Relations
// ---------------------------------------------------------------------------

export type ProvenanceRelationType =
	| "produces"         // model → prediction
	| "uses_model"       // inference → model
	| "served_by"        // inference → peer
	| "replicated_on"    // chunk → peer
	| "verified_by"      // chunk → peer (verification)
	| "derived_from"     // forecast → model
	| "evidence_for"     // evidence → forecast
	| "impacts";         // forecast → impact tier

export interface ProvenanceRelation {
	sourceId: string;
	targetId: string;
	predicate: ProvenanceRelationType;
	strength: number;      // 0..1
	confidence: number;    // 0..1
	evidenceEventIds: string[];
	createdAt: number;
	metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Pythia Event (from inference result)
// ---------------------------------------------------------------------------

export type PythiaEventType =
	| "inference_completed"
	| "model_verified"
	| "chunk_replicated"
	| "peer_registered"
	| "quorum_reached";

export interface PythiaEvent {
	id: string;
	type: PythiaEventType;
	timestamp: number;
	source: "p2p_inference" | "model_seeding" | "peer_catalog";
	actorId?: string;

	// Core inference data
	taskId: string;
	modelId: string;
	modelVersion: string;
	peerId: string;
	quantization: string;
	backend: string;

	// Results
	promptTokens: number;
	completionTokens: number;
	latencyMs: number;
	ttftMs?: number;
	tokensPerSecond: number;
	cacheHit: boolean;

	// Provenance links
	provenance: {
		modelChunkCids: string[];
		servingPeerIds: string[];
		verificationPeerIds: string[];
		quorumPeerIds?: string[];
	};
	verificationHash?: string;

	// Geo/H3
	h3CellId?: string;
	peerLocation?: { lat: number; lng: number };
}

// ---------------------------------------------------------------------------
// Pythia Forecast (from model prediction)
// ---------------------------------------------------------------------------

export type ForecastHorizon = "24h" | "1w" | "1m" | "1y";
export type ImpactTier = "low" | "medium" | "high" | "critical";

export interface PythiaForecast {
	id: string;
	eventId: string;              // links to PythiaEvent
	timestamp: number;
	horizon: ForecastHorizon;
	probability: number;          // 0..1
	confidence: number;           // 0..1
	rationale: string;
	modelId: string;
	modelVersion: string;

	// Impact assessment
	impactTier: ImpactTier;
	impactScore: number;          // 0..1

	// Domain
	domain: string;
	location?: string;

	// Provenance
	sourceEventId: string;
	evidenceIds: string[];
	derivedFromModelId: string;
}

// ---------------------------------------------------------------------------
// LocalCrab Evidence (input/source tracking)
// ---------------------------------------------------------------------------

export type EvidenceType =
	| "inference_input"
	| "model_artifact"
	| "chunk_verification"
	| "peer_attestation"
	| "user_feedback"
	| "external_source";

export interface LocalCrabEvidence {
	id: string;
	type: EvidenceType;
	timestamp: number;
	source: "p2p_inference" | "model_seeding" | "peer_catalog" | "user" | "external";

	// Content
	contentHash: string;
	contentPreview: string;       // truncated for UI
	contentSize: number;

	// Links
	relatedEventIds: string[];
	relatedForecastIds: string[];
	peerIds: string[];
	modelIds: string[];
	chunkCids: string[];

	// Verification
	verified: boolean;
	verificationPeerId?: string;
	verificationAt?: number;
	signature?: string;

	// Metadata
	metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// H3 Cell Aggregation
// ---------------------------------------------------------------------------

export interface H3CellAggregation {
	h3CellId: string;
	resolution: number;           // H3 resolution (0-15)
	bounds: {
		lat: number;
		lng: number;
	}[];
	center: { lat: number; lng: number };

	// Peer metrics
	peerCount: number;
	activePeerIds: string[];

	// Model metrics
	cachedChunkCount: number;
	uniqueModelIds: string[];
	uniqueChunkCids: string[];

	// Inference metrics
	activeInferenceCount: number;
	totalInferencesLast24h: number;
	avgLatencyMs: number;
	avgTokensPerSecond: number;
	quorumSuccessRate: number;

	// Evidence metrics
	evidenceCount: number;
	verifiedEvidenceCount: number;
	unverifiedEvidenceCount: number;

	// Forecast metrics
	forecastCount: number;
	avgForecastConfidence: number;
	highImpactForecastCount: number; // impactTier >= "high"

	// Impact
	impactTier: ImpactTier;
	impactScore: number;          // 0..1 aggregated

	// Time window
	windowStart: number;
	windowEnd: number;
	lastUpdated: number;
}

// ---------------------------------------------------------------------------
// UI Selection / Interaction
// ---------------------------------------------------------------------------

export interface CellSelection {
	h3CellId: string;
	resolution: number;
	aggregation: H3CellAggregation;
	relatedProvenance: ProvenanceRelation[];
	relatedEvents: PythiaEvent[];
	relatedForecasts: PythiaForecast[];
	relatedEvidence: LocalCrabEvidence[];
	selectedAt: number;
}

// ---------------------------------------------------------------------------
// Dashboard Panels (navigation targets)
// ---------------------------------------------------------------------------

export type DashboardPanelId =
	| "world_cockpit"
	| "live_events"
	| "forecast_ledger"
	| "evidence_explorer"
	| "impact_analysis"
	| "ontology_explorer";

export interface DashboardPanelLink {
	id: DashboardPanelId;
	label: string;
	description: string;
	icon: string;
	route: string;
	requiresData?: string[];
}

// ---------------------------------------------------------------------------
// Demo Fallback
// ---------------------------------------------------------------------------

export interface DemoFallbackConfig {
	enabled: boolean;
	seed?: number;
	peerCount?: number;
	modelCount?: number;
	eventCount?: number;
	forecastCount?: number;
	evidenceCount?: number;
	h3Resolution?: number;
}

export function createDemoFallbackConfig(overrides?: Partial<DemoFallbackConfig>): DemoFallbackConfig {
	return {
		enabled: false,
		seed: 12345,
		peerCount: 50,
		modelCount: 10,
		eventCount: 100,
		forecastCount: 50,
		evidenceCount: 200,
		h3Resolution: 5,
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Seeded PRNG — deterministic across client/server for demo fallback
// ---------------------------------------------------------------------------

export function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export function seededRandom(seed: number, min: number, max: number): number {
	const rng = mulberry32(seed);
	return min + rng() * (max - min);
}

// ---------------------------------------------------------------------------
// Impact tier scoring
// ---------------------------------------------------------------------------

export function impactTierToColor(tier: ImpactTier): string {
	switch (tier) {
		case "critical":
			return "#ef4444";
		case "high":
			return "#f59e0b";
		case "medium":
			return "#38bdf8";
		case "low":
			return "#10b981";
	}
}

export function impactTierToScore(tier: ImpactTier): number {
	switch (tier) {
		case "critical":
			return 1;
		case "high":
			return 0.75;
		case "medium":
			return 0.5;
		case "low":
			return 0.25;
	}
}

export function scoreToImpactTier(score: number): ImpactTier {
	if (score >= 0.8) return "critical";
	if (score >= 0.6) return "high";
	if (score >= 0.3) return "medium";
	return "low";
}

// ---------------------------------------------------------------------------
// Dashboard Panel Links
// ---------------------------------------------------------------------------

export const DASHBOARD_PANEL_LINKS: DashboardPanelLink[] = [
	{
		id: "world_cockpit",
		label: "World Cockpit",
		description: "Live global event feed + Pythia forecasts on interactive globe",
		icon: "globe",
		route: "/world",
		requiresData: ["events", "forecasts"],
	},
	{
		id: "live_events",
		label: "Live Events",
		description: "P2P mesh event stream with real-time ingestion from all peers",
		icon: "activity",
		route: "/world",
		requiresData: ["events"],
	},
	{
		id: "forecast_ledger",
		label: "Forecast Ledger",
		description: "Pythia prediction ledger with confidence and impact scoring",
		icon: "trending-up",
		route: "/knowledge",
		requiresData: ["forecasts"],
	},
	{
		id: "evidence_explorer",
		label: "Evidence Explorer",
		description: "LocalCrab evidence tree — inputs, verifications, attestations",
		icon: "search",
		route: "/verification",
		requiresData: ["evidence"],
	},
	{
		id: "impact_analysis",
		label: "Impact Analysis",
		description: "Aggregate impact tiers across H3 cells and provenance relations",
		icon: "bar-chart-3",
		route: "/knowledge",
		requiresData: ["aggregations"],
	},
	{
		id: "ontology_explorer",
		label: "Ontology Explorer",
		description: "Concept graph with H3 cell aggregations and peer provenance",
		icon: "network",
		route: "/ontology",
		requiresData: ["concepts", "aggregations"],
	},
];

export function getDashboardPanelLink(id: DashboardPanelId): DashboardPanelLink | undefined {
	return DASHBOARD_PANEL_LINKS.find((link) => link.id === id);
}

// ---------------------------------------------------------------------------
// Demo Data Generation
// ---------------------------------------------------------------------------

const DEMO_MODELS = ["claude-3.7-sonnet", "deepseek-r1", "gemini-2.5-pro", "llama-3.3-70b", "qwen-2.5-72b"];
const DEMO_DOMAINS = ["technology", "markets", "cybersecurity", "climate", "health", "politics", "science"];
const DEMO_TITLES = [
	"AI Infrastructure Scaling",
	"Quantum Computing Breakthrough",
	"Renewable Energy Storage",
	"Supply Chain Disruption",
	"New Model Architecture",
	"Regulatory Framework Update",
	"Network Security Incident",
	"Climate Adaptation Strategy",
	"Healthcare AI Deployment",
	"Space Exploration Milestone",
];

const DEMO_CITIES: Array<{ name: string; lat: number; lng: number }> = [
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
];

export function createDemoPythiaEvents(
	config: DemoFallbackConfig,
	baseTime: number,
): PythiaEvent[] {
	const rng = mulberry32(config.seed ?? 12345);
	const events: PythiaEvent[] = [];
	const count = config.eventCount ?? 100;

	for (let i = 0; i < count; i++) {
		const city = DEMO_CITIES[Math.floor(rng() * DEMO_CITIES.length)]!;
		const model = DEMO_MODELS[Math.floor(rng() * DEMO_MODELS.length)]!;
		const domain = DEMO_DOMAINS[Math.floor(rng() * DEMO_DOMAINS.length)]!;
		const title = DEMO_TITLES[Math.floor(rng() * DEMO_TITLES.length)]!;
		const horizon = ["24h", "1w", "1m", "1y"][Math.floor(rng() * 4)] as ForecastHorizon;

		const promptTokens = 100 + Math.floor(rng() * 1900);
		const completionTokens = 50 + Math.floor(rng() * 950);
		const latencyMs = 100 + Math.floor(rng() * 2900);
		const cacheHit = rng() < 0.4;

		events.push({
			id: `evt-${config.seed}-${i}`,
			type: "inference_completed",
			timestamp: baseTime - (count - i) * (60000 + Math.floor(rng() * 300000)),
			source: "p2p_inference",
			actorId: `peer-${Math.floor(rng() * 100)}`,
			taskId: `task-${i}`,
			modelId: model,
			modelVersion: `${Math.floor(1 + rng() * 9)}.${Math.floor(0 + rng() * 9)}.${Math.floor(0 + rng() * 9)}`,
			peerId: `peer-${Math.floor(rng() * 100)}`,
			quantization: ["q4_k_m", "q5_k_m", "f16"][Math.floor(rng() * 3)] as QuantizationFormat,
			backend: ["cuda", "metal", "webgpu", "cpu"][Math.floor(rng() * 4)] as ComputeBackend,
			promptTokens,
			completionTokens,
			latencyMs,
			ttftMs: latencyMs * 0.1,
			tokensPerSecond: completionTokens / (latencyMs / 1000),
			cacheHit,
			provenance: {
				modelChunkCids: [`cid-${i}-${0}`, `cid-${i}-${1}`],
				servingPeerIds: [`peer-${Math.floor(rng() * 100)}`],
				verificationPeerIds: [`peer-${Math.floor(rng() * 100)}`],
				quorumPeerIds: [`peer-${Math.floor(rng() * 100)}`, `peer-${Math.floor(rng() * 100)}`],
			},
			verificationHash: `hash-${i}-${Math.floor(rng() * 1000000)}`,
			h3CellId: `${horizon}-${i % DEMO_CITIES.length}`,
			peerLocation: { lat: city.lat, lng: city.lng },
		});
	}

	return events;
}

export function createDemoPythiaForecasts(
	config: DemoFallbackConfig,
	events: PythiaEvent[],
	baseTime: number,
): PythiaForecast[] {
	const rng = mulberry32((config.seed ?? 12345) + 99999);
	const forecasts: PythiaForecast[] = [];
	const count = Math.min(config.forecastCount ?? 50, events.length);

	for (let i = 0; i < count; i++) {
		const event = events[i]!;
		const horizon = ["24h", "1w", "1m", "1y"][Math.floor(rng() * 4)] as ForecastHorizon;
		const probability = 0.4 + rng() * 0.55;
		const confidence = 0.5 + rng() * 0.45;
		const impactScore = rng() * 0.9;
		const domain = DEMO_DOMAINS[Math.floor(rng() * DEMO_DOMAINS.length)]!;

		forecasts.push({
			id: `forecast-${config.seed}-${i}`,
			eventId: event.id,
			timestamp: event.timestamp,
			horizon,
			probability,
			confidence,
			rationale: `Projected based on ${event.modelId} inference at ${DEMO_CITIES[Math.floor(rng() * DEMO_CITIES.length)]?.name ?? "unknown"}`,
			modelId: event.modelId,
			modelVersion: event.modelVersion,
			impactTier: scoreToImpactTier(impactScore),
			impactScore,
			domain,
			location: event.peerLocation ? `${event.peerLocation.lat},${event.peerLocation.lng}` : undefined,
			sourceEventId: event.id,
			evidenceIds: [`evidence-${i}`, `evidence-${(i + 1) % count}`],
			derivedFromModelId: event.modelId,
		});
	}

	return forecasts;
}

export function createDemoLocalCrabEvidence(
	config: DemoFallbackConfig,
	events: PythiaEvent[],
	forecasts: PythiaForecast[],
	baseTime: number,
): LocalCrabEvidence[] {
	const rng = mulberry32((config.seed ?? 12345) + 77777);
	const evidence: LocalCrabEvidence[] = [];
	const count = config.evidenceCount ?? 200;

	for (let i = 0; i < count; i++) {
		const event = events[i % events.length]!;
		const forecast = forecasts[i % forecasts.length]!;
		const type = ["inference_input", "model_artifact", "chunk_verification", "peer_attestation"][
			Math.floor(rng() * 4)
		] as EvidenceType;
		const source = ["p2p_inference", "model_seeding", "peer_catalog"][Math.floor(rng() * 3)] as LocalCrabEvidence["source"];
		const verified = rng() > 0.2;

		evidence.push({
			id: `evidence-${config.seed}-${i}`,
			type,
			timestamp: event.timestamp - Math.floor(rng() * 3600000),
			source,
			contentHash: `hash-${i}-${Math.floor(rng() * 1000000)}`,
			contentPreview: `Evidence ${type.replace("_", " ")} for ${event.modelId} at ${event.peerId}`,
			contentSize: 1024 + Math.floor(rng() * 65536),
			relatedEventIds: [event.id],
			relatedForecastIds: [forecast.id],
			peerIds: [event.peerId, `peer-${Math.floor(rng() * 100)}`],
			modelIds: [event.modelId],
			chunkCids: event.provenance.modelChunkCids,
			verified,
			verificationPeerId: verified ? `peer-${Math.floor(rng() * 100)}` : undefined,
			verificationAt: verified ? event.timestamp : undefined,
			signature: verified ? `sig-${i}-${Math.floor(rng() * 1000000)}` : undefined,
			metadata: {
				domain: DEMO_DOMAINS[Math.floor(rng() * DEMO_DOMAINS.length)],
				strength: rng(),
			},
		});
	}

	return evidence;
}

// ---------------------------------------------------------------------------
// H3 Cell Aggregation
// ---------------------------------------------------------------------------

export interface H3CellAggregationInput {
	h3CellId: string;
	resolution: number;
	center: { lat: number; lng: number };
	bounds: { lat: number; lng: number }[];
}

export function createH3CellAggregation(
	input: H3CellAggregationInput,
	metrics: Partial<H3CellAggregation> = {},
): H3CellAggregation {
	const now = Date.now();
	const windowStart = now - 86400000;
	const windowEnd = now;

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
		windowStart,
		windowEnd,
		lastUpdated: now,
		...metrics,
	};
}

export interface DemoCellData {
	cells: H3CellAggregation[];
	events: PythiaEvent[];
	forecasts: PythiaForecast[];
	evidence: LocalCrabEvidence[];
	provenance: ProvenanceRelation[];
}

export function createDemoCellAggregations(
	config: DemoFallbackConfig,
	events: PythiaEvent[],
	forecasts: PythiaForecast[],
	evidence: LocalCrabEvidence[],
): H3CellAggregation[] {
	const resolution = config.h3Resolution ?? 5;
	const cellMap = new Map<string, H3CellAggregationInput>();

	for (const event of events) {
		if (!event.peerLocation) continue;

		const city = DEMO_CITIES.find(
			(c) => c.lat === event.peerLocation!.lat && c.lng === event.peerLocation!.lng,
		);
		const cellId = city
			? `cell-${city.name.toLowerCase().replace(/\s+/g, "-")}-${resolution}`
			: `cell-unknown-${resolution}`;

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

	const cells: H3CellAggregation[] = [];
	const eventByCell = new Map<string, PythiaEvent[]>();
	const forecastByCell = new Map<string, PythiaForecast[]>();
	const evidenceByCell = new Map<string, LocalCrabEvidence[]>();

	for (const event of events) {
		if (!event.peerLocation) continue;
		const city = DEMO_CITIES.find(
			(c) => c.lat === event.peerLocation!.lat && c.lng === event.peerLocation!.lng,
		);
		const cellId = city
			? `cell-${city.name.toLowerCase().replace(/\s+/g, "-")}-${resolution}`
			: `cell-unknown-${resolution}`;

		if (!eventByCell.has(cellId)) eventByCell.set(cellId, []);
		eventByCell.get(cellId)!.push(event);
	}

	for (const forecast of forecasts) {
		const event = events.find((e) => e.id === forecast.sourceEventId);
		if (!event?.peerLocation) continue;
		const city = DEMO_CITIES.find(
			(c) => c.lat === event.peerLocation!.lat && c.lng === event.peerLocation!.lng,
		);
		const cellId = city
			? `cell-${city.name.toLowerCase().replace(/\s+/g, "-")}-${resolution}`
			: `cell-unknown-${resolution}`;

		if (!forecastByCell.has(cellId)) forecastByCell.set(cellId, []);
		forecastByCell.get(cellId)!.push(forecast);
	}

	for (const ev of evidence) {
		const cellId = ev.relatedEventIds.length > 0
			? (() => {
				const relatedEvent = events.find((e) => e.id === ev.relatedEventIds[0]);
				if (!relatedEvent?.peerLocation) return null;
				const city = DEMO_CITIES.find(
					(c) => c.lat === relatedEvent.peerLocation!.lat && c.lng === relatedEvent.peerLocation!.lng,
				);
				return city
					? `cell-${city.name.toLowerCase().replace(/\s+/g, "-")}-${resolution}`
					: `cell-unknown-${resolution}`;
			})()
			: null;

		if (!cellId) continue;
		if (!evidenceByCell.has(cellId)) evidenceByCell.set(cellId, []);
		evidenceByCell.get(cellId)!.push(ev);
	}

	for (const [cellId, input] of cellMap) {
		const cellEvents = eventByCell.get(cellId) ?? [];
		const cellForecasts = forecastByCell.get(cellId) ?? [];
		const cellEvidence = evidenceByCell.get(cellId) ?? [];

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
				? cellEvents.filter((e) => e.provenance.quorumPeerIds && e.provenance.quorumPeerIds.length >= 2).length /
					cellEvents.length
				: 0;

		const highImpactCount = cellForecasts.filter((f) => f.impactTier === "high" || f.impactTier === "critical").length;
		const avgConfidence =
			cellForecasts.length > 0
				? cellForecasts.reduce((sum, f) => sum + f.confidence, 0) / cellForecasts.length
				: 0;

		const verifiedCount = cellEvidence.filter((e) => e.verified).length;
		const impactScore = Math.max(
			...cellForecasts.map((f) => f.impactScore),
			cellEvidence.length / 100,
			0,
		);

		cells.push(
			createH3CellAggregation(input, {
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
				evidenceCount: cellEvidence.length,
				verifiedEvidenceCount: verifiedCount,
				unverifiedEvidenceCount: cellEvidence.length - verifiedCount,
				forecastCount: cellForecasts.length,
				avgForecastConfidence: avgConfidence,
				highImpactForecastCount: highImpactCount,
				impactTier: scoreToImpactTier(impactScore),
				impactScore,
				lastUpdated: cellEvents.reduce((max, e) => Math.max(max, e.timestamp), 0) || Date.now(),
			}),
		);
	}

	return cells.sort((a, b) => b.peerCount - a.peerCount);
}

export function createDemoProvenanceRelations(
	config: DemoFallbackConfig,
	events: PythiaEvent[],
	forecasts: PythiaForecast[],
	evidence: LocalCrabEvidence[],
): ProvenanceRelation[] {
	const rng = mulberry32((config.seed ?? 12345) + 33333);
	const relations: ProvenanceRelation[] = [];

	for (const event of events.slice(0, Math.min(events.length, 50))) {
		const predicates: ProvenanceRelationType[] = ["produces", "uses_model", "served_by", "replicated_on"];
		const targetCandidates = [...forecasts, ...events, ...evidence];

		for (const predicate of predicates) {
			const target = targetCandidates[Math.floor(rng() * targetCandidates.length)]!;
			relations.push({
				sourceId: event.id,
				targetId: target.id,
				predicate,
				strength: 0.3 + rng() * 0.6,
				confidence: 0.5 + rng() * 0.4,
				evidenceEventIds: [event.id],
				createdAt: event.timestamp,
			});
		}
	}

	return relations.slice(0, 100);
}

export function createDemoVisualizationData(
	config: DemoFallbackConfig,
	baseTime: number,
): DemoCellData {
	const events = createDemoPythiaEvents(config, baseTime);
	const forecasts = createDemoPythiaForecasts(config, events, baseTime);
	const evidence = createDemoLocalCrabEvidence(config, events, forecasts, baseTime);
	const cells = createDemoCellAggregations(config, events, forecasts, evidence);
	const provenance = createDemoProvenanceRelations(config, events, forecasts, evidence);

	return { cells, events, forecasts, evidence, provenance };
}

// ---------------------------------------------------------------------------
// Cell Selection Builder
// ---------------------------------------------------------------------------

export function createCellSelection(
	h3CellId: string,
	resolution: number,
	aggregation: H3CellAggregation,
	provenance: ProvenanceRelation[] = [],
	events: PythiaEvent[] = [],
	forecasts: PythiaForecast[] = [],
	evidence: LocalCrabEvidence[] = [],
): CellSelection {
	return {
		h3CellId,
		resolution,
		aggregation,
		relatedProvenance: provenance.filter(
			(r) => r.sourceId === h3CellId || r.targetId === h3CellId || aggregation.uniqueChunkCids.includes(r.sourceId),
		),
		relatedEvents: events,
		relatedForecasts: forecasts,
		relatedEvidence: evidence,
		selectedAt: Date.now(),
	};
}

export interface DemoVisualizationData {
	cells: H3CellAggregation[];
	events: PythiaEvent[];
	forecasts: PythiaForecast[];
	evidence: LocalCrabEvidence[];
	provenance: ProvenanceRelation[];
}

export function buildCellSelectionFromData(
	selection: {
		h3CellId: string;
		resolution: number;
	},
	data: DemoVisualizationData,
): CellSelection {
	const cell = data.cells.find((c) => c.h3CellId === selection.h3CellId);
	if (!cell) {
		return {
			h3CellId: selection.h3CellId,
			resolution: selection.resolution,
			aggregation: createH3CellAggregation({
				h3CellId: selection.h3CellId,
				resolution: selection.resolution,
				center: { lat: 0, lng: 0 },
				bounds: [],
			}),
			relatedProvenance: [],
			relatedEvents: [],
			relatedForecasts: [],
			relatedEvidence: [],
			selectedAt: Date.now(),
		};
	}

	const relatedEvents = data.events.filter(
		(e) =>
			e.h3CellId === selection.h3CellId ||
			(e.peerLocation &&
				cell.bounds.some((b) => b.lat === e.peerLocation!.lat && b.lng === e.peerLocation!.lng)),
	);

	const relatedForecasts = data.forecasts.filter((f) => relatedEvents.some((e) => e.id === f.eventId));

	const relatedEvidence = data.evidence.filter(
		(e) =>
			e.relatedEventIds.some((id) => relatedEvents.some((re) => re.id === id)) ||
			e.relatedForecastIds.some((id) => relatedForecasts.some((rf) => rf.id === id)),
	);

	const relatedProvenance = data.provenance.filter(
		(r) =>
			r.sourceId === selection.h3CellId ||
			r.targetId === selection.h3CellId ||
			relatedEvents.some((e) => e.id === r.sourceId || e.id === r.targetId) ||
			relatedForecasts.some((f) => f.id === r.sourceId || f.id === r.targetId),
	);

	return createCellSelection(
		selection.h3CellId,
		selection.resolution,
		cell,
		relatedProvenance,
		relatedEvents,
		relatedForecasts,
		relatedEvidence,
	);
}