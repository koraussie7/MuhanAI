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
 * Endpoints:
 *   GET /api/world/brief        → world summary + domains + top predictions
 *   GET /api/world/events       → live events (optionally filtered by domain)
 *   GET /api/world/predictions  → forecasts grouped by horizon (24h/1w/1m/1y)
 *   GET /api/world/health       → upstream reachability
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { recordObservations } from "./cosmos-routes.js";
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
	/** Optional coordinates for the location — feeds the ontology geo metadata. */
	latitude?: number;
	longitude?: number;
	severity: "info" | "watch" | "alert";
	source: string;
	timestamp: string;
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
	source: "pythia" | "offline";
	summary: string;
	domains: string[];
	events: WorldEvent[];
	predictions: WorldPrediction[];
	fetchedAt: string;
}

/**
 * PYTHIA's own horizon vocabulary. The panel speaks in `1w/1m/1y`, the engine in
 * `week/month/year`; without this map every forecast fell through to the
 * default bucket and the horizon tabs showed nothing.
 */
const PYTHIA_HORIZONS: Record<string, WorldPrediction["horizon"]> = {
	"24h": "24h",
	week: "1w",
	month: "1m",
	year: "1y",
	// Tolerate the panel vocabulary too, in case an older engine echoes it back.
	"1w": "1w",
	"1m": "1m",
	"1y": "1y",
};

/**
 * PYTHIA rates salience 0..1 rather than emitting a severity word. Anything it
 * considers worth surfacing gets at least `watch`, so a live feed never renders
 * entirely as background noise.
 */
function severityFromSalience(salience: unknown): WorldEvent["severity"] {
	if (typeof salience !== "number") return "info";
	if (salience >= 0.75) return "alert";
	if (salience >= 0.4) return "watch";
	return "info";
}

/**
 * Reject coordinates that cannot be a (lat, lng) pair; swap when only the
 * reversed reading is legal.
 *
 * Much upstream data arrives transposed (Israel as 34.851,31.046). Sometimes
 * that is detectable — a latitude beyond ±90 is not a latitude — and then the
 * pair is read reversed. But plenty of transposed rows have two in-range
 * values (31.272,49.487) where both readings are legal coordinates; there is no
 * local way to tell which is right, and guessing would silently move markers.
 * Those are passed through unchanged rather than "corrected" on a hunch.
 */
function normaliseCoords(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
	if (typeof lat !== "number" || typeof lng !== "number") return null;
	if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

	const latLegal = Math.abs(lat) <= 90;
	const lngLegal = Math.abs(lng) <= 180;
	if (latLegal && lngLegal) return { lat, lng };

	// Only the reversed reading is legal — that one we can trust.
	if (!latLegal && Math.abs(lng) <= 90) return { lat: lng, lng: lat };
	return null;
}

/** Resolve the upstream base URL at request time (tests flip env freely). */
export function getPythiaWorldUrl(): string | null {
	const raw = process.env.PYTHIA_WORLD_URL;
	if (!raw) return null;
	return raw.replace(/\/+$/, "");
}

export interface ShadowBrokerConfig {
	base: string;
	/** Sensor layers to request; empty means "whatever the server defaults to". */
	layers: string[];
	token?: string;
}

/**
 * Resolve the ShadowBroker (GEV sensor feed) config at request time.
 *
 * Read on every call rather than cached at module load so tests and operators
 * can set env without restarting the process, matching getPythiaWorldUrl.
 * Returns null when no base URL is configured — that is the normal state, and
 * the world panel falls back to the offline snapshot.
 */
export function getShadowBrokerConfig(): ShadowBrokerConfig | null {
	const raw = process.env.SHADOWBROKER_URL;
	if (!raw) return null;

	const layers = (process.env.SHADOWBROKER_LAYERS ?? "")
		.split(",")
		.map((layer) => layer.trim())
		.filter((layer) => layer.length > 0);

	const token = process.env.SHADOWBROKER_TOKEN;
	return {
		base: raw.replace(/\/+$/, ""),
		layers,
		...(token ? { token } : {}),
	};
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
			events_by_domain?: unknown;
			predictions?: unknown;
		};

		// PYTHIA groups live events by domain (`events_by_domain: { conflict: [...],
		// weather: [...] }`). The flat `events` key is our own older shape, kept as
		// a fallback so an older engine still works — reading only `events` meant
		// every live payload arrived as zero events.
		const grouped = data.events_by_domain;
		const rawEvents: Record<string, unknown>[] = [];
		if (grouped && typeof grouped === "object" && !Array.isArray(grouped)) {
			for (const [domain, list] of Object.entries(grouped as Record<string, unknown>)) {
				if (!Array.isArray(list)) continue;
				for (const item of list) {
					if (item && typeof item === "object") {
						rawEvents.push({ ...(item as Record<string, unknown>), domain });
					}
				}
			}
		} else if (Array.isArray(data.events)) {
			rawEvents.push(...(data.events as Record<string, unknown>[]));
		}

		const events = rawEvents;
		const predictions = Array.isArray(data.predictions)
			? (data.predictions as Record<string, unknown>[])
			: [];
		const domains = Array.isArray(data.domains) ? (data.domains as unknown[]) : [];
		const eventList = events.slice(0, 50).map((e, i) => {
			const coords = normaliseCoords(
				typeof e.lat === "number" ? e.lat : e.latitude,
				typeof e.lng === "number" ? e.lng : e.longitude,
			);
			const ts = e.ts;
			const evt: WorldEvent = {
				id: typeof e.id === "string" ? e.id : `evt-${i}`,
				title:
					typeof e.title === "string"
						? e.title
						: typeof e.summary === "string"
							? e.summary
							: "untitled",
				domain: typeof e.domain === "string" ? e.domain : "general",
				severity:
					e.severity === "alert" || e.severity === "watch" || e.severity === "info"
						? e.severity
						: severityFromSalience(e.salience),
				source: typeof e.source === "string" ? e.source : "pythia",
				timestamp:
					typeof e.timestamp === "string"
						? e.timestamp
						: typeof ts === "number"
							? new Date(ts).toISOString()
							: new Date().toISOString(),
			};
			if (typeof e.location === "string") evt.location = e.location;
			if (coords) {
				evt.latitude = coords.lat;
				evt.longitude = coords.lng;
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
				title:
					typeof p.title === "string"
						? p.title
						: typeof p.statement === "string"
							? p.statement
							: "untitled",
				horizon:
					(typeof p.horizon === "string" ? PYTHIA_HORIZONS[p.horizon] : undefined) ?? "1w",
				probability: typeof p.probability === "number" ? p.probability : 0.5,
				// PYTHIA publishes base_rate; the panel's confidence is how far the
				// swarm moved off that baseline, floored so an unmoved forecast still
				// shows a non-zero confidence.
				confidence:
					typeof p.confidence === "number"
						? p.confidence
						: typeof p.base_probability === "number" && typeof p.probability === "number"
							? Math.min(1, Math.abs(p.probability - p.base_probability) + 0.5)
							: 0.5,
				rationale:
					typeof p.rationale === "string"
						? p.rationale
						: typeof p.reasoning === "string"
							? p.reasoning
							: "",
			})),
			fetchedAt: new Date().toISOString(),
		};
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------
// World feed -> cosmic graph
// ---------------------------------------------------------------------------

/**
 * Events already written to the graph, keyed by event id.
 *
 * The panel polls every 30s while streaming, and PYTHIA re-sends most of the
 * same events each time. Without this the log grows without bound and the
 * projection folds the same observation over and over.
 */
const ingestedEventIds = new Set<string>();
const MAX_INGESTED_IDS = 5000;

/**
 * Record live world events as concept observations.
 *
 * Each event id becomes a concept, grouped under its domain, carrying the
 * upstream coordinates so /api/ontograph/snapshot can place it on the globe
 * and the sidebar can filter by type. Observations only — no relations are
 * invented here; those come from Pythia's own predictions.
 *
 * Best-effort by construction: the caller is a user-facing GET.
 */
async function ingestBrief(brief: WorldBrief): Promise<void> {
	if (brief.source !== "pythia") return;

	const fresh = brief.events.filter((event) => {
		if (ingestedEventIds.has(event.id)) return false;
		ingestedEventIds.add(event.id);
		return true;
	});
	if (fresh.length === 0) return;

	// Bound the dedup set so a long-running process does not leak.
	if (ingestedEventIds.size > MAX_INGESTED_IDS) {
		const excess = ingestedEventIds.size - MAX_INGESTED_IDS;
		let dropped = 0;
		for (const id of ingestedEventIds) {
			if (dropped >= excess) break;
			ingestedEventIds.delete(id);
			dropped += 1;
		}
	}

	for (const event of fresh) {
		// The concept id is `<domain>::<label>`; passing `world::<id>` would make
		// the raw upstream id the display label.
		const conceptKey = `${event.domain}::${event.title.slice(0, 120)}`;
		await recordObservations([conceptKey], {
			domain: event.domain,
			label: event.title.slice(0, 120),
			timestamp: Date.parse(event.timestamp) || Date.now(),
			...(typeof event.latitude === "number" && typeof event.longitude === "number"
				? { geo: { latitude: event.latitude, longitude: event.longitude } }
				: {}),
		});
	}
}

export async function worldRoutes(app: FastifyInstance) {
	app.get("/api/world/brief", async (request, reply) => {
		const parse = QuerySchema.safeParse(request.query);
		if (!parse.success) {
			return clientError(reply, 400, formatZodError(parse.error), request.id);
		}
		const live = await tryLiveBrief();
		const brief = live ?? buildOfflineBrief();
		// Feed live observations into the cosmic graph so the ontology sidebar
		// reflects the same world the globe is showing. Offline snapshots are
		// synthetic and must never become concepts.
		if (live) await ingestBrief(live);
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
		const live = await tryLiveBrief();
		const brief = live ?? buildOfflineBrief();
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
		const live = await tryLiveBrief();
		const brief = live ?? buildOfflineBrief();
		return { source: brief.source, predictions: brief.predictions, fetchedAt: brief.fetchedAt };
	});

	app.get("/api/world/health", async () => {
		const base = getPythiaWorldUrl();
		if (!base) {
			return { configured: false, reachable: false, checkedAt: new Date().toISOString() };
		}
		try {
			const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(3000) });
			return { configured: true, reachable: res.ok, checkedAt: new Date().toISOString() };
		} catch {
			return { configured: true, reachable: false, checkedAt: new Date().toISOString() };
		}
	});
}
