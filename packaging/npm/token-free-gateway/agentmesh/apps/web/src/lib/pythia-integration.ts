/**
 * Pythia integration helpers — thin wrappers over the Token-Free Gateway
 * surface used by WorldPage and the ontology sidebar.
 *
 * The browser never touches keyless-providers directly: every call goes
 * through the Fastify routes (`/api/pythia/*`), which proxy the keyless LLM
 * mesh at zero cost.
 */
import type { WorldEvent } from "./world-types";
export interface PythiaFactCheckRequest {
	article: {
		headline: string;
		publisher?: string;
		content?: string;
		timestamp?: string;
		location?: string;
	};
	sourceArticles?: string[];
	model?: string;
}
export interface PythiaFactCheckResult {
	verified?: boolean;
	confidence?: number;
	claims?: unknown[];
	summary?: string;
	[key: string]: unknown;
}
/**
 * POST /api/pythia/factcheck — ask the keyless mesh to verify a news event.
 * Throws on HTTP failure; the caller surfaces the message.
 */
export async function pythiaFactCheck(req: PythiaFactCheckRequest): Promise<PythiaFactCheckResult> {
	const res = await fetch("/api/pythia/factcheck", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		credentials: "include",
		body: JSON.stringify(req),
	});
	if (!res.ok) throw new Error(`Pythia factcheck failed: HTTP ${res.status}`);
	return (await res.json()) as PythiaFactCheckResult;
}
/**
 * Convenience used by WorldPage event cards: turns a WorldEvent into a
 * factcheck request and returns just the LLM's verdict summary.
 */
export async function factCheckWorldEvent(
	event: WorldEvent,
): Promise<{ summary?: string; verdict?: string; confidence?: number } | null> {
	const result = await pythiaFactCheck({
		article: {
			headline: event.title,
			timestamp: event.timestamp,
			location: event.location,
		},
	});
	return {
		...(typeof result.summary === "string" ? { summary: result.summary } : {}),
		...(typeof result.verified === "boolean" ? { verdict: result.verified ? "verified" : "unverified" } : {}),
		...(typeof result.confidence === "number" ? { confidence: result.confidence } : {}),
	};
}
export interface PythiaSummarizeBriefResult {
	explanation: string;
	provider: string;
	latencyMs: number;
	cost: string;
}
/**
 * POST /api/pythia/explain-graph — reused as the briefing summarizer: the
 * "graph" here is the world state (summary + event titles), and the keyless
 * mesh returns a plain-language Korean briefing.
 */
export async function pythiaSummarizeBrief(
	summary: string,
	events: { title: string; domain: string; severity: string }[],
): Promise<PythiaSummarizeBriefResult> {
	const results = events.slice(0, 15).map((e) => ({
		id: e.domain,
		label: e.title,
		type: e.severity,
	}));
	const res = await fetch("/api/pythia/explain-graph", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		credentials: "include",
		body: JSON.stringify({
			query: `Summarize this world briefing in Korean:\n${summary}`,
			results,
		}),
	});
	if (!res.ok) throw new Error(`Pythia summarize failed: HTTP ${res.status}`);
	return (await res.json()) as PythiaSummarizeBriefResult;
}
