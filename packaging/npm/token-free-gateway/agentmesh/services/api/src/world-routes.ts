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

/** Resolve the upstream base URL at request time (tests flip env freely). */
export function getPythiaWorldUrl(): string | null {
	const raw = process.env.PYTHIA_WORLD_URL;
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

export async function worldRoutes(app: FastifyInstance) {
	app.get("/api/world/brief", async (request, reply) => {
		const parse = QuerySchema.safeParse(request.query);
		if (!parse.success) {
			return clientError(reply, 400, formatZodError(parse.error), request.id);
		}
		const live = await tryLiveBrief();
		const brief = live ?? buildOfflineBrief();
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
