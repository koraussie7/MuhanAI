/**
 * Ontograph routes — knowledge-graph read model for the /world sidebar.
 *
 * The OntologyGraphPanel (apps/web) renders ontology entities and relations
 * as a sidebar next to the Pythia globe. Rather than importing
 * @ontograph/core (or the heavier cosmos projection types) into the browser —
 * which would violate the thin-client guarantee that apps/web never pulls
 * Node-only transitive deps — the panel talks to this API surface:
 *
 *   GET /api/ontograph/snapshot   → entities + relations (one round trip)
 *   GET /api/ontograph/health     → graph population status
 *
 * Entities come straight from the live cosmos projection
 * (`conceptViews()`/`relationViews()` in cosmos-routes): the same concepts
 * Pythia analyses flow into. An empty graph returns a deterministic offline
 * fixture (mirroring buildOfflineBrief) so the sidebar is never blank.
 */
import type { FastifyInstance } from "fastify";
import { clientError, formatZodError } from "./error-shapes.js";
import { type GraphConceptView, cosmosProjection, conceptViews, relationViews } from "./cosmos-routes.js";
import { z } from "zod";
const QuerySchema = z.object({
	limit: z.coerce.number().int().min(1).max(200).optional(),
});
/** Entity type the sidebar understands (OntologyGraphPanel's type union). */
export type OntographEntityType = "domain" | "concept" | "event" | "agent";
export interface OntographEntity {
	id: string;
	label: string;
	type: OntographEntityType;
	latitude?: number;
	longitude?: number;
	/** Concept lifecycle from the cosmos projection (raw → amplified). */
	status?: "raw" | "validated" | "amplified" | "deprecated";
	signalScore?: number;
	domain?: string;
}
export interface OntographRelation {
	id: string;
	source: string;
	target: string;
	label: string;
	strength?: number;
}
export interface OntographSnapshot {
	source: "ontograph" | "offline";
	entities: OntographEntity[];
	relations: OntographRelation[];
	fetchedAt: string;
}
/** Map a cosmos concept id ("domain::label") to the sidebar's entity type. */
export function entityTypeFor(conceptDomain: string, status?: string): OntographEntityType {
	if (conceptDomain === "geo" || conceptDomain === "location") return "domain";
	if (conceptDomain === "event") return "event";
	if (conceptDomain === "agent" || conceptDomain === "system") return "agent";
	return "concept";
}
/** Deterministic offline fixture — same UTC hour → same payload. */
export function buildOfflineOntograph(): OntographSnapshot {
	const hour = Math.floor(Date.now() / (60 * 60 * 1000));
	const stamp = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate())).toISOString();
	const entity = (id: string, label: string, type: OntographEntityType): OntographEntity => ({
		id,
		label,
		type,
		status: "raw" as const,
	});
	return {
		source: "offline",
		entities: [
			{ ...entity(`geo-seoul-${hour}`, "Seoul", "domain"), latitude: 37.5665, longitude: 126.978, domain: "geo" },
			{ ...entity(`geo-tokyo-${hour}`, "Tokyo", "domain"), latitude: 35.6762, longitude: 139.6503, domain: "geo" },
			{ ...entity(`geo-london-${hour}`, "London", "domain"), latitude: 51.5074, longitude: -0.1278, domain: "geo" },
			{ ...entity(`geo-newyork-${hour}`, "New York", "domain"), latitude: 40.7128, longitude: -74.006, domain: "geo" },
			entity(`concept-climate-${hour}`, "Climate Risk", "concept"),
			entity(`concept-supply-${hour}`, "Supply Chain", "concept"),
			entity(`concept-cyber-${hour}`, "Cyber Threat", "concept"),
			entity(`agent-pythia-${hour}`, "Pythia Engine", "agent"),
			entity(`agent-ontograph-${hour}`, "Ontograph Core", "agent"),
		],
		relations: [
			{ id: `r-cl-seoul-${hour}`, source: `concept-climate-${hour}`, target: `geo-seoul-${hour}`, label: "related_to", strength: 0.6 },
			{ id: `r-cl-tokyo-${hour}`, source: `concept-climate-${hour}`, target: `geo-tokyo-${hour}`, label: "related_to", strength: 0.6 },
			{ id: `r-sp-london-${hour}`, source: `concept-supply-${hour}`, target: `geo-london-${hour}`, label: "related_to", strength: 0.5 },
			{ id: `r-sp-ny-${hour}`, source: `concept-supply-${hour}`, target: `geo-newyork-${hour}`, label: "related_to", strength: 0.5 },
			{ id: `r-cy-tokyo-${hour}`, source: `concept-cyber-${hour}`, target: `geo-tokyo-${hour}`, label: "related_to", strength: 0.55 },
			{ id: `r-py-cl-${hour}`, source: `agent-pythia-${hour}`, target: `concept-climate-${hour}`, label: "amplifies", strength: 0.7 },
			{ id: `r-py-cy-${hour}`, source: `agent-pythia-${hour}`, target: `concept-cyber-${hour}`, label: "amplifies", strength: 0.7 },
			{ id: `r-og-py-${hour}`, source: `agent-ontograph-${hour}`, target: `agent-pythia-${hour}`, label: "part_of", strength: 0.4 },
		],
		fetchedAt: stamp,
	};
}
/**
 * Live snapshot from the cosmos projection, mapped into the sidebar shape.
 * Concepts become entities; projected relations become edges. Entity types
 * are derived from the concept domain so the sidebar filters stay honest.
 */
/**
 * Project cosmos concepts onto sidebar entities, lifting geo metadata onto
 * `latitude`/`longitude` so the globe can focus on a selection.
 *
 * Ingestion writes the GeoJSON shape `{ geo: { lat, lng } }`; events written
 * before the ShadowBroker pipeline used flat `{ latitude, longitude }`. Both
 * are accepted so replaying an older log still places concepts correctly.
 */
export function toEntities(
	concepts: ReadonlyArray<
		Pick<GraphConceptView, "id" | "label" | "domain" | "status" | "signalScore" | "metadata">
	>,
): OntographEntity[] {
	return concepts.map((c) => {
		const out: OntographEntity = {
			id: c.id,
			label: c.label,
			type: entityTypeFor(c.domain, c.status),
			status: c.status,
			signalScore: c.signalScore,
			domain: c.domain,
		};
		const meta = c.metadata;
		if (meta && typeof meta === "object") {
			const record = meta as Record<string, unknown>;
			const nested = record.geo as Record<string, unknown> | undefined;
			const lat = nested?.lat ?? record.latitude;
			const lng = nested?.lng ?? record.longitude;
			if (typeof lat === "number" && typeof lng === "number") {
				out.latitude = lat;
				out.longitude = lng;
			}
		}
		return out;
	});
}

export async function buildLiveOntograph(): Promise<OntographSnapshot | null> {
	try {
		const live = await cosmosProjection();
		const concepts = conceptViews(live);
		if (concepts.length === 0) return null;
		const entities = toEntities(concepts);
		const known = new Set(entities.map((e) => e.id));
		const relations: OntographRelation[] = relationViews(live)
			.filter((r) => known.has(r.sourceId) && known.has(r.targetId))
			.map((r) => ({
				id: r.id,
				source: r.sourceId,
				target: r.targetId,
				label: r.predicate,
				strength: r.strength,
			}));
		return {
			source: "ontograph",
			entities,
			relations,
			fetchedAt: new Date().toISOString(),
		};
	} catch {
		return null;
	}
}
export async function ontographRoutes(app: FastifyInstance) {
	app.get("/api/ontograph/snapshot", async (request, reply) => {
		const parse = QuerySchema.safeParse(request.query);
		if (!parse.success) {
			return clientError(reply, 400, formatZodError(parse.error), request.id);
		}
		const live = await buildLiveOntograph();
		const snapshot = live ?? buildOfflineOntograph();
		const { limit } = parse.data;
		if (limit !== undefined) {
			return {
				...snapshot,
				entities: snapshot.entities.slice(0, limit),
				relations: snapshot.relations
					.filter((r) =>
						snapshot.entities.slice(0, limit).some((e) => e.id === r.source || e.id === r.target),
					)
					.slice(0, limit),
			};
		}
		return snapshot;
	});
	app.get("/api/ontograph/health", async () => {
		const live = await buildLiveOntograph();
		return {
			source: live ? "ontograph" : "offline",
			concepts: live?.entities.length ?? 0,
			relations: live?.relations.length ?? 0,
			checkedAt: new Date().toISOString(),
		};
	});
}
