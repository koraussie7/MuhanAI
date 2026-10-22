/**
 * Ontograph integration client — talks to the @ontograph/core knowledge graph
 * over HTTP (`/api/ontograph/*`).
 *
 * Mirrors the "thin client" rule used by the rest of apps/web: the browser
 * never imports @ontograph/core (whose Node-only transitive deps would break
 * the Vite build); it only consumes the JSON the API layer returns.
 *
 * When the API is unreachable the helpers return a deterministic offline
 * fixture so OntologyGraphPanel always renders something meaningful.
 */
export interface OntologyEntity {
	id: string;
	label: string;
	type: "domain" | "concept" | "event" | "agent";
	latitude?: number;
	longitude?: number;
	description?: string;
}
export interface OntologyRelation {
	id: string;
	source: string;
	target: string;
	label: string;
}
export interface OntologySnapshot {
	source: "ontograph" | "offline";
	entities: OntologyEntity[];
	relations: OntologyRelation[];
	fetchedAt: string;
}
export type OntologyTypeFilter = "all" | OntologyEntity["type"];
function isEntity(value: unknown): value is OntologyEntity {
	if (!value || typeof value !== "object") return false;
	const e = value as Record<string, unknown>;
	return (
		typeof e.id === "string" &&
		typeof e.label === "string" &&
		(e.type === "domain" || e.type === "concept" || e.type === "event" || e.type === "agent")
	);
}
function isRelation(value: unknown): value is OntologyRelation {
	if (!value || typeof value !== "object") return false;
	const r = value as Record<string, unknown>;
	return (
		typeof r.id === "string" &&
		typeof r.source === "string" &&
		typeof r.target === "string" &&
		typeof r.label === "string"
	);
}
/** Normalizes whatever the API returns into an OntologySnapshot. */
export function normalizeOntology(payload: unknown): OntologySnapshot {
	const p = (payload ?? {}) as Partial<OntologySnapshot>;
	return {
		source: p.source === "ontograph" ? "ontograph" : "offline",
		entities: Array.isArray(p.entities) ? p.entities.filter(isEntity) : [],
		relations: Array.isArray(p.relations) ? p.relations.filter(isRelation) : [],
		fetchedAt: typeof p.fetchedAt === "string" ? p.fetchedAt : new Date().toISOString(),
	};
}
/** Offline fixture so the panel is never blank when the engine is down. */
export function offlineOntology(): OntologySnapshot {
	const offline = (id: string, label: string, type: OntologyEntity["type"]): OntologyEntity => ({
		id,
		label,
		type,
	});
	return {
		source: "offline",
		entities: [
			{ ...offline("geo-seoul", "Seoul", "domain"), latitude: 37.5665, longitude: 126.978 },
			{ ...offline("geo-tokyo", "Tokyo", "domain"), latitude: 35.6762, longitude: 139.6503 },
			{ ...offline("geo-london", "London", "domain"), latitude: 51.5074, longitude: -0.1278 },
			{ ...offline("geo-newyork", "New York", "domain"), latitude: 40.7128, longitude: -74.006 },
			offline("concept-climate", "Climate Risk", "concept"),
			offline("concept-supply", "Supply Chain", "concept"),
			offline("concept-cyber", "Cyber Threat", "concept"),
			offline("agent-pythia", "Pythia Engine", "agent"),
			offline("agent-ontograph", "Ontograph Core", "agent"),
		],
		relations: [
			{ id: "r1", source: "concept-climate", target: "geo-seoul", label: "monitors" },
			{ id: "r2", source: "concept-climate", target: "geo-tokyo", label: "monitors" },
			{ id: "r3", source: "concept-supply", target: "geo-london", label: "routes" },
			{ id: "r4", source: "concept-supply", target: "geo-newyork", label: "routes" },
			{ id: "r5", source: "concept-cyber", target: "geo-tokyo", label: "flags" },
			{ id: "r6", source: "agent-pythia", target: "concept-climate", label: "summarizes" },
			{ id: "r7", source: "agent-pythia", target: "concept-cyber", label: "summarizes" },
			{ id: "r8", source: "agent-ontograph", target: "agent-pythia", label: "feeds" },
		],
		fetchedAt: new Date().toISOString(),
	};
}
/** GET /api/ontograph/snapshot — full entity + relation graph. */
export async function fetchOntologySnapshot(): Promise<OntologySnapshot> {
	try {
		const res = await fetch("/api/ontograph/snapshot", { credentials: "include" });
		if (!res.ok) throw new Error(`Ontograph snapshot returned HTTP ${res.status}`);
		return normalizeOntology(await res.json());
	} catch {
		return offlineOntology();
	}
}
/**
 * Relations touching one entity (in + out), for the selected-entity viewer.
 */
export function relationsFor(
	snapshot: OntologySnapshot,
	entityId: string,
): { inbound: OntologyRelation[]; outbound: OntologyRelation[] } {
	const inbound: OntologyRelation[] = [];
	const outbound: OntologyRelation[] = [];
	for (const r of snapshot.relations) {
		if (r.target === entityId) inbound.push(r);
		if (r.source === entityId) outbound.push(r);
	}
	return { inbound, outbound };
}
// ---------------------------------------------------------------------------
// Pythia graph explanation (Token-Free Gateway)
// ---------------------------------------------------------------------------
export interface ExplainGraphRequest {
	query: string;
	results: { id: string; label: string; type?: string; relations?: string }[];
}
export interface ExplainGraphResult {
	query: string;
	explanation: string;
	provider: string;
	latencyMs: number;
	cost: string;
}
/**
 * POST /api/pythia/explain-graph — ask the keyless LLM mesh to explain the
 * selected entity's neighborhood in plain language. Never throws for network
 * issues alone: the panel surfaces the error message instead.
 */
export async function pythiaExplainGraph(req: ExplainGraphRequest): Promise<ExplainGraphResult> {
	const res = await fetch("/api/pythia/explain-graph", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		credentials: "include",
		body: JSON.stringify(req),
	});
	if (!res.ok) throw new Error(`Explain graph failed: HTTP ${res.status}`);
	return (await res.json()) as ExplainGraphResult;
}
/**
 * Convenience: builds the explain request for one entity and its relations,
 * mirroring what the OntologyGraphPanel shows for a selection.
 */
export function explainRequestFor(
	snapshot: OntologySnapshot,
	entity: OntologyEntity,
): ExplainGraphRequest {
	const { inbound, outbound } = relationsFor(snapshot, entity.id);
	const relStrings = [
		...outbound.map((r) => `→ ${r.label} ${r.target}`),
		...inbound.map((r) => `← ${r.label} ${r.source}`),
	];
	return {
		query: `Explain the entity "${entity.label}" (${entity.type}) in the ontology graph.`,
		results: [
			{
				id: entity.id,
				label: entity.label,
				type: entity.type,
				...(relStrings.length > 0 ? { relations: relStrings.join("; ") } : {}),
			},
		],
	};
}
