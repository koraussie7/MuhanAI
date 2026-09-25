/**
 * World routes — Pythia World Engine integration.
 *
 * Upstream Pythia (github.com/jangles-byte/Pythia) turns 40+ free keyless
 * live feeds (quakes, weather, wildfire, cyber threats, markets…) into one
 * world state plus 1d/1w/1m/1y forecasts — entirely through free LLM APIs
 * (no Ollama required for this integration). We expose it to the dashboard
 * as the "World" panel.
 *
 * When PYTHIA_WORLD_URL is set, live data is proxied from the upstream's
 * simple REST surface (localhost:8088 by default). When it is not — or the
 * engine is down — we return a deterministic offline snapshot so the panel
 * still renders something meaningful (tests need no network either).
 *
 * ShadowBroker (github.com/BigBodyCobain/Shadowbroker) runs alongside it as a
 * second, *observational* source: 40+ geospatial OSINT layers (ADS-B aircraft,
 * AIS vessels, satellites, GPS jamming, quakes…) surfaced through its
 * `search_telemetry` agent channel. Pythia forecasts; ShadowBroker observes.
 * When SHADOWBROKER_URL is set both are queried and merged into one brief so
 * the correlation engine can pair a forecast with the observation that later
 * confirms it.
 *
 * Endpoints:
 *   GET /api/world/brief        → world summary + domains + top predictions
 *   GET /api/world/events       → live events (optionally filtered by domain)
 *   GET /api/world/predictions  → forecasts grouped by horizon (24h/1w/1m/1y)
 *   GET /api/world/health       → upstream reachability
 *   GET /api/world/correlations → observation × forecast correlations
 */

import {
	ingestWorldBrief,
	mapTelemetryBrief,
	type Correlation,
	type WorldFeedBrief,
	correlateEvents,
} from "@agentmesh/cosmos-core";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { clientError, formatZodError } from "./error-shapes.js";

const QuerySchema = z.object({
	domain: z.string().max(64).optional(),
	limit: z.coerce.number().int().min(1).max(100).optional(),
});

export interface WorldEvent {
	id: string;
	title: string;
	domain: string;
	location?: string;
	severity: "info" | "watch" | "alert";
	source: string;
	timestamp: string;
	/** Present on geospatial sources; drives globe placement without re-parsing. */
	geo?: { lat: number; lng: number; altitudeM?: number };
}

export interface WorldPrediction {
	id: string;
	title: string;
	horizon: "24h" | "1w" | "1m" | "1y";
	probability: number;
	confidence: number;
	rationale: string;
}

export interface WorldBrief {
	/** `merged` once more than one engine contributes to the same brief. */
	source: "pythia" | "shadowbroker" | "merged" | "offline";
	summary: string;
	domains: string[];
	events: WorldEvent[];
	predictions: WorldPrediction[];
	fetchedAt: string;
}

function asFeedBrief(brief: WorldBrief): WorldFeedBrief {
	return brief as WorldFeedBrief;
}

/**
 * Append a live brief to the cosmic log. Ingestion is best-effort: the world
 * panel must remain available when the optional JSONL path is unwritable or a
 * malformed upstream payload reaches this route.
 */
async function ingestLiveBrief(brief: WorldBrief): Promise<void> {
	if (brief.source === "offline") return;
	try {
	const { cosmosLog, cosmosProjection } = await import("./cosmos-routes.js");
	const log = cosmosLog();
	const sources = brief.source === "merged" ? ["pythia", "shadowbroker"] as const : [brief.source];
	for (const source of sources) {
	const events = brief.events.filter((event) =>
		source === "shadowbroker" ? event.source === "shadowbroker" : event.source !== "shadowbroker",
	);
	const predictions = source === "pythia" ? brief.predictions : [];
	if (events.length === 0 && predictions.length === 0) continue;
	const sourceBrief: WorldFeedBrief = {
		source,
		summary: brief.summary,
		domains: brief.domains,
		events,
	predictions,
	fetchedAt: brief.fetchedAt,
	};
	await ingestWorldBrief(log, sourceBrief, { source });
	}
	await cosmosProjection();
	} catch {
	// Cosmic persistence is an enrichment path, never a world-feed outage.
	}
}

/** Resolve the upstream base URL at request time (tests flip env freely). */
export function getPythiaWorldUrl(): string | null {
	const raw = process.env.PYTHIA_WORLD_URL;
	if (!raw) return null;
	return raw.replace(/\/+$/, "");
}

/**
 * ShadowBroker backend base URL (agent channel). Null when unconfigured, in
 * which case the world panel behaves exactly as before this integration.
 */
export function getShadowBrokerUrl(): string | null {
	const raw = process.env.SHADOWBROKER_URL;
	if (!raw) return null;
	return raw.replace(/\/+$/, "");
}

// ---------------------------------------------------------------------------
// Deterministic offline snapshot — same hour → same payload, so the UI keeps
// a stable frame when the upstream engine is absent (mirrors the
// omniroute-routes fallback convention).
// ---------------------------------------------------------------------------

export function buildOfflineBrief(): WorldBrief {
	const hour = Math.floor(Date.now() / (60 * 60 * 1000));
	const resetAt = new Date();
	resetAt.setUTCMinutes(0, 0, 0);
	const stamp = resetAt.toISOString();
	return {
		source: "offline",
		summary:
			`오프라인 스냅샷 (UTC ${String(resetAt.getUTCHours()).padStart(2, "0")}시 기준). ` +
			"Pythia World Engine이 연결되면 실시간 세계 상태와 예측이 표시됩니다. " +
			"연결 방법: PYTHIA_WORLD_URL 환경변수에 엔진 주소(기본 http://localhost:8088) 설정.",
		domains: ["conflict", "disaster", "weather", "cyber", "infrastructure", "markets"],
		events: [
			{
				id: `off-${hour}-1`,
				title: "[오프라인] 실시간 피드 연결 대기 중",
				domain: "infrastructure",
				severity: "info" as const,
				source: "offline",
				timestamp: stamp,
			},
			{
				id: `off-${hour}-2`,
				title: "[오프라인] 40+ 키리스 피드가 연결되면 자동 갱신",
				domain: "cyber",
				severity: "info" as const,
				source: "offline",
				timestamp: stamp,
			},
		],
		predictions: [
			{
				id: `offp-${hour}-1`,
				title: "[오프라인] 엔진 연결 후 1d/1w/1m/1y 예측 제공",
				horizon: "1w" as const,
				probability: 0.5,
				confidence: 0.5,
				rationale:
					"Pythia World Engine(mirofish 예측 엔진)에 연결되면 확률·근거·위치가 채워집니다.",
			},
		],
		fetchedAt: stamp,
	};
}

/** Live brief from the upstream engine — null when anything goes wrong. */
async function tryLiveBrief(): Promise<WorldBrief | null> {
	const base = getPythiaWorldUrl();
	if (!base) return null;
	try {
		const res = await fetch(`${base}/agent/view`, { signal: AbortSignal.timeout(5000) });
		if (!res.ok) return null;
		const data = (await res.json()) as {
			summary?: unknown;
			domains?: unknown;
			events?: unknown;
			predictions?: unknown;
		};
		const events = Array.isArray(data.events) ? (data.events as Record<string, unknown>[]) : [];
		const predictions = Array.isArray(data.predictions)
			? (data.predictions as Record<string, unknown>[])
			: [];
		const domains = Array.isArray(data.domains) ? (data.domains as unknown[]) : [];
		const eventList = events.slice(0, 50).map((e, i) => {
			const evt: WorldEvent = {
				id: typeof e.id === "string" ? e.id : `evt-${i}`,
				title: typeof e.title === "string" ? e.title : "untitled",
				domain: typeof e.domain === "string" ? e.domain : "general",
				severity:
					e.severity === "alert" || e.severity === "watch" || e.severity === "info"
						? e.severity
						: "info",
				source: typeof e.source === "string" ? e.source : "pythia",
				timestamp: typeof e.timestamp === "string" ? e.timestamp : new Date().toISOString(),
			};
				if (typeof e.location === "string") evt.location = e.location;
			if (e.geo && typeof e.geo === "object") {
			const geo = e.geo as Record<string, unknown>;
			if (typeof geo.lat === "number" && typeof geo.lng === "number") {
				evt.geo = {
			lat: geo.lat,
			lng: geo.lng,
			...(typeof geo.altitudeM === "number" ? { altitudeM: geo.altitudeM } : {}),
			};
			}
			}
			return evt;
		});
		return {
			source: "pythia" as const,
			summary: typeof data.summary === "string" ? data.summary : "",
			domains: domains.filter((d): d is string => typeof d === "string"),
			events: eventList,
			predictions: predictions.slice(0, 50).map((p, i) => ({
				id: typeof p.id === "string" ? p.id : `pred-${i}`,
				title: typeof p.title === "string" ? p.title : "untitled",
				horizon:
					p.horizon === "24h" || p.horizon === "1w" || p.horizon === "1m" || p.horizon === "1y"
						? p.horizon
						: ("1w" as const),
				probability: typeof p.probability === "number" ? p.probability : 0.5,
				confidence: typeof p.confidence === "number" ? p.confidence : 0.5,
				rationale: typeof p.rationale === "string" ? p.rationale : "",
			})),
			fetchedAt: new Date().toISOString(),
		};
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------
// ShadowBroker — geospatial observation source
// ---------------------------------------------------------------------------

/**
 * ShadowBroker credential/query knobs, read at call time so tests can flip
 * them. The agent channel is HMAC-signed; `token` is passed as a bearer
 * credential and `AGENT_SECRET` (when set) signs the request body.
 */
export interface ShadowBrokerConfig {
	base: string;
	token?: string;
	secret?: string;
	/** Layer allowlist; empty means "whatever the upstream returns". */
	layers: string[];
}

export function getShadowBrokerConfig(): ShadowBrokerConfig | null {
	const base = getShadowBrokerUrl();
	if (!base) return null;
	const layers = (process.env.SHADOWBROKER_LAYERS ?? "")
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	const config: ShadowBrokerConfig = { base, layers };
	const token = process.env.SHADOWBROKER_TOKEN;
	const secret = process.env.SHADOWBROKER_AGENT_SECRET;
	if (token) config.token = token;
	if (secret) config.secret = secret;
	return config;
}

/**
 * Query ShadowBroker's agent channel for live telemetry and map it onto the
 * cosmic world-feed shape. Returns null on any failure so the caller falls back
 * to whatever the forecast engine produced — a dead OSINT collector must never
 * blank the world panel.
 */
async function tryLiveShadowBroker(): Promise<WorldBrief | null> {
	const config = getShadowBrokerConfig();
	if (!config) return null;

	try {
		// ShadowBroker's verified read surface is `GET /api/live-data`: a JSON
		// object whose top-level keys are layer names (`flights`, `ships`,
		// `earthquakes`, `gdelt`, `internet_outages`, `firms_fires`, `sigint`…).
		// The HMAC agent channel exists too, but live-data needs no signature and
		// is what the deployment actually exposes.
		const headers: Record<string, string> = { Accept: "application/json" };
		if (config.token) headers.Authorization = `Bearer ${config.token}`;

		const res = await fetch(`${config.base}/api/live-data`, {
			method: "GET",
			headers,
			signal: AbortSignal.timeout(20000),
		});
		if (!res.ok) return null;

		const payload = (await res.json()) as unknown;
		const brief = mapTelemetryBrief(payload, { isAnomalous: isAnomalousObservation });

		// Honour an explicit layer allowlist without re-walking the payload: the
		// adapter maps everything, so filtering here keeps the mapping total.
		if (config.layers.length > 0) {
			const allowed = new Set(config.layers.map((layer) => layer.trim().toLowerCase()));
			brief.events = brief.events.filter((event) => {
				const layer = event.id.split(":")[1] ?? "";
				return allowed.has(layer);
			});
			brief.domains = [...new Set(brief.events.map((event) => event.domain))].sort((a, b) =>
				a.localeCompare(b),
			);
		}

		return brief.events.length > 0 ? brief : null;
	} catch {
		return null;
	}
}

/**
 * Doctrine for "this observation is not routine".
 *
 * ShadowBroker publishes raw feeds with no anomaly labelling, so the judgement
 * lives here: a squawk 7700/7600 (emergency/radio failure), a military aircraft
 * squawking 7777, or an aircraft with no callsign/registration actually filed is
 * worth raising to `watch`. Everything else keeps its layer's severity floor.
 */
function isAnomalousObservation(item: Record<string, unknown>, layer: string): boolean {
	const squawk = typeof item.squawk === "string" ? item.squawk : String(item.squawk ?? "");
	if (["7700", "7600", "7500", "7777"].includes(squawk.trim())) return true;

	if (layer === "flights" || layer === "military_flights" || layer === "tracked_flights") {
		const callsign = typeof item.callsign === "string" ? item.callsign.trim() : "";
		const onGround = item.on_ground === true || item.on_ground === "true";
		if (!callsign && !onGround) return true;
	}

	return false;
}

/**
 * One brief carrying every configured engine's contribution.
 *
 * The merge is intentionally additive rather than a preference order: a
 * forecast and an observation are different kinds of truth, and dropping
 * either to keep `source` a single value would lose the observation that
 * confirms the forecast — which is the entire point of the integration.
 */
async function mergedBrief(): Promise<WorldBrief> {
	const [pythia, shadowbroker] = await Promise.all([tryLiveBrief(), tryLiveShadowBroker()]);

	if (pythia && shadowbroker) {
		const events = [...pythia.events, ...shadowbroker.events];
		const domains = [...new Set([...pythia.domains, ...shadowbroker.domains])].sort();

		return {
			source: "merged",
			summary: `${pythia.summary} ${shadowbroker.summary}`.trim(),
			domains,
			events,
			predictions: pythia.predictions,
			fetchedAt: new Date().toISOString(),
		};
	}

	// Only one engine answered. Forcing a merge would misreport `source`.
	return pythia ?? shadowbroker ?? buildOfflineBrief();
}

export async function worldRoutes(app: FastifyInstance) {
	app.get("/api/world/brief", async (request, reply) => {
		const parse = QuerySchema.safeParse(request.query);
		if (!parse.success) {
			return clientError(reply, 400, formatZodError(parse.error), request.id);
		}
			const brief = await mergedBrief();
		await ingestLiveBrief(brief);
		const { domain } = parse.data;
		return domain
			? {
					...brief,
					events: brief.events.filter((e) => e.domain === domain),
				}
			: brief;
	});

	app.get("/api/world/events", async (request, reply) => {
		const parse = QuerySchema.safeParse(request.query);
		if (!parse.success) {
			return clientError(reply, 400, formatZodError(parse.error), request.id);
		}
			const brief = await mergedBrief();
		await ingestLiveBrief(brief);
		const { domain, limit } = parse.data;
		let events = domain ? brief.events.filter((e) => e.domain === domain) : brief.events;
		if (limit !== undefined) events = events.slice(0, limit);
		return { source: brief.source, events, fetchedAt: brief.fetchedAt };
	});

	app.get("/api/world/predictions", async (request, reply) => {
		const parse = QuerySchema.safeParse(request.query);
		if (!parse.success) {
			return clientError(reply, 400, formatZodError(parse.error), request.id);
		}
			const brief = await mergedBrief();
		await ingestLiveBrief(brief);
		return { source: brief.source, predictions: brief.predictions, fetchedAt: brief.fetchedAt };
	});

	app.get("/api/world/health", async () => {
		const pythia = getPythiaWorldUrl();
		const shadowbroker = getShadowBrokerUrl();

		const probe = async (base: string | null, path: string): Promise<boolean> => {
			if (!base) return false;
			try {
				const res = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(3000) });
				return res.ok;
			} catch {
				return false;
			}
		};

		// ShadowBroker mounts its API under `/api` (health at `/api/health`),
		// unlike Pythia's bare `/health`. Probing the wrong path reports the
		// collector as down while it is happily serving telemetry, so the two
		// probes keep their own paths.
		const [pythiaReachable, shadowbrokerReachable] = await Promise.all([
			probe(pythia, "/health"),
			probe(shadowbroker, "/api/health"),
		]);

		return {
			// Kept for the existing panel contract: "configured" means the forecast
			// engine is wired, which is what the original health UI reads.
			configured: pythia !== null,
			reachable: pythiaReachable,
			checkedAt: new Date().toISOString(),
			shadowbroker: {
				configured: shadowbroker !== null,
				reachable: shadowbrokerReachable,
			},
		};
	});

	/**
	 * Correlations — observation × forecast pairs, strongest first.
	 *
	 * Reads the cosmic log (where both engines' events land), pairs every
	 * Pythia forecast with the ShadowBroker observations that may confirm it,
	 * and returns ranked, evidence-backed inferences. Only `system`/`agent`
	 * sources are scanned as observations, so Pythia cannot confirm itself.
	 *
	 * Returns an empty list when the log is empty or no pair clears the
	 * strength floor — that is a normal "no signal yet" answer, not an error.
	 */
	app.get("/api/world/correlations", async (request, reply) => {
		const CorrQuery = QuerySchema.extend({
			sinceHours: z.coerce
				.number()
				.int()
				.min(1)
				.max(24 * 400)
				.optional(),
		});
		const parse = CorrQuery.safeParse(request.query);
		if (!parse.success) {
			return clientError(reply, 400, formatZodError(parse.error), request.id);
		}

		// Imported lazily: the graph route module owns the singleton log, and
		// pulling it in at module scope would create an import cycle.
		const { cosmosLog } = await import("./cosmos-routes.js");
		const events = await cosmosLog().query();

		const options: { limit?: number; since?: number } = { limit: parse.data.limit ?? 50 };
		if (parse.data.sinceHours !== undefined) {
			options.since = Date.now() - parse.data.sinceHours * 3_600_000;
		}

		const correlations: Correlation[] = correlateEvents(events, options);
		const { domain } = parse.data;
		// `domain` filters on the forecast's concept id, which is derived from its
		// title — not a structured field, hence the substring match.
		const filtered = domain
			? correlations.filter((c) => c.predictionConceptId.includes(domain))
			: correlations;

		return {
			eventsScanned: events.length,
			correlationCount: filtered.length,
			correlations: filtered,
			fetchedAt: new Date().toISOString(),
		};
	});
}
