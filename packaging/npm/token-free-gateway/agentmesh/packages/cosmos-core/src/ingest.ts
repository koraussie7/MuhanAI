/**
 * Ingest — normalize upstream world feeds into the append-only cosmic log.
 *
 * The shapes here are deliberately structural (`WorldFeedEvent`, `WorldFeedBrief`)
 * rather than importing `services/api` types: the core package must stay
 * dependency-free, and the world routes already coerce upstream payloads into
 * exactly this shape (see `world-routes.ts` → `WorldEvent`/`WorldBrief`).
 *
 * Every normalizer is total: unknown/absent fields degrade to defaults instead
 * of throwing, because a malformed feed item must never take down ingestion.
 */

import { randomUUID } from "node:crypto";
import { conceptId, clamp01 } from "./ontology.js";
import type {
	AppendOnlyLog,
	CosmosEvent,
	CosmosEventInput,
	CosmosEventSource,
	PredictionHorizon,
	WorldSeverity,
} from "./types.js";

// ---------------------------------------------------------------------------
// Upstream feed shape (mirrors services/api world-routes)
// ---------------------------------------------------------------------------

/** Matches `WorldEvent` in `services/api/src/world-routes.ts`. */
export interface WorldFeedEvent {
	id: string;
	title: string;
	domain: string;
	location?: string;
	severity: WorldSeverity;
	source: string;
	timestamp: string;
}

/** Matches `WorldPrediction` in `services/api/src/world-routes.ts`. */
export interface WorldFeedPrediction {
	id: string;
	title: string;
	horizon: PredictionHorizon;
	probability: number;
	confidence: number;
	rationale: string;
}

/** Matches `WorldBrief` in `services/api/src/world-routes.ts`. */
export interface WorldFeedBrief {
	source: "pythia" | "offline";
	summary: string;
	domains: string[];
	events: WorldFeedEvent[];
	predictions: WorldFeedPrediction[];
	fetchedAt: string;
}

export interface IngestOptions {
	/** Event source tag; defaults to `pythia`. */
	source?: CosmosEventSource;
	/** Epoch millis override (tests). */
	now?: number;
}

/** Parse an ISO timestamp, falling back to `now` when unparseable. */
function parseTimestamp(value: string, now: number): number {
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : now;
}

// ---------------------------------------------------------------------------
// Normalizers
// ---------------------------------------------------------------------------

/**
 * World event → `world_event` + the concepts it touches.
 *
 * A world event contributes two concepts: the event itself (domain `world`) and
 * the domain it belongs to. Domain-level concepts are what let "conflict" or
 * "cyber" accumulate signal across many unrelated headlines.
 */
export function normalizeWorldEvent(
	event: WorldFeedEvent,
	options: IngestOptions = {},
): { event: CosmosEventInput; conceptIds: string[] } {
	const now = options.now ?? Date.now();
	const timestamp = parseTimestamp(event.timestamp, now);
	const domain = event.domain || "general";

	const eventConcept = conceptId("world", event.title);
	const domainConcept = conceptId("domain", domain);
	const conceptIds = [eventConcept, domainConcept];

	const payload: Extract<CosmosEventInput, { kind: "world_event" }>["payload"] = {
		domain,
		title: event.title,
		severity: event.severity,
		upstreamId: event.id,
		conceptIds,
		raw: { source: event.source, timestamp: event.timestamp },
	};
	if (event.location) payload.location = event.location;

	return {
		event: {
			kind: "world_event",
			timestamp,
			source: options.source ?? "pythia",
			payload,
		},
		conceptIds,
	};
}

/**
 * Prediction → `prediction` event. Predictions are the raw material for the
 * `prediction_accuracy` signal: once reality catches up, a matching world event
 * makes the originating concepts measurably more trustworthy.
 */
export function normalizePrediction(
	prediction: WorldFeedPrediction,
	options: IngestOptions = {},
): { event: CosmosEventInput; conceptIds: string[] } {
	const now = options.now ?? Date.now();
	const conceptIds = [conceptId("prediction", prediction.title)];

	return {
		event: {
			kind: "prediction",
			timestamp: now,
			source: options.source ?? "pythia",
			payload: {
				domain: "prediction",
				title: prediction.title,
				horizon: prediction.horizon,
				probability: clamp01(prediction.probability),
				confidence: clamp01(prediction.confidence),
				rationale: prediction.rationale,
				upstreamId: prediction.id,
				conceptIds,
			},
		},
		conceptIds,
	};
}

/**
 * Synthesize `ontology_node` observations for every concept an event mentions.
 *
 * This is what puts raw ontology data *into* the space (plan step 3): concepts
 * become visible as candidates the moment a feed mentions them, before any
 * human or agent has judged them.
 */
export function conceptObservationEvents(
	conceptIds: string[],
	meta: { domain: string; label: string; upstreamId?: string; timestamp: number },
	source: CosmosEventSource = "pythia",
): CosmosEventInput[] {
	const seen = new Set<string>();
	const events: CosmosEventInput[] = [];

	for (const id of conceptIds) {
		if (seen.has(id)) continue;
		seen.add(id);

		const [domainPart, labelPart] = id.split("::");
		const payload: Extract<CosmosEventInput, { kind: "ontology_node" }>["payload"] = {
			conceptId: id,
			label: labelPart || meta.label,
			domain: domainPart || meta.domain,
			status: "raw",
		};
		if (meta.upstreamId) payload.upstreamId = meta.upstreamId;

		events.push({
			kind: "ontology_node",
			timestamp: meta.timestamp,
			source,
			payload,
		});
	}

	return events;
}

// ---------------------------------------------------------------------------
// Brief ingestion (dedupe + append)
// ---------------------------------------------------------------------------

export interface IngestResult {
	/** Events actually appended (deduped). */
	appended: CosmosEvent[];
	/** Upstream ids skipped because they were already ingested. */
	skippedUpstreamIds: string[];
	/** Distinct concept ids touched by this brief. */
	conceptIds: string[];
}

/** Upstream ids already present in the log for a given event kind. */
async function knownUpstreamIds(log: AppendOnlyLog): Promise<Set<string>> {
	const seen = new Set<string>();
	for (const kind of ["world_event", "prediction"] as const) {
		const events = await log.query({ kinds: [kind] });
		for (const event of events) {
			const payload = event.payload as { upstreamId?: unknown };
			if (typeof payload.upstreamId === "string") seen.add(`${kind}:${payload.upstreamId}`);
		}
	}
	return seen;
}

/**
 * Ingest a full world brief into the log.
 *
 * Idempotent by design: the world routes poll the engine on a timer, so the
 * same event id arrives repeatedly. Re-ingesting an unchanged brief appends
 * nothing, which keeps the log a record of *change* rather than of *polling*.
 *
 * Offline snapshots (`source: "offline"`) are skipped entirely — they are
 * placeholder frames, not observations, and would poison concept signal scores.
 */
export async function ingestWorldBrief(
	log: AppendOnlyLog,
	brief: WorldFeedBrief,
	options: IngestOptions = {},
): Promise<IngestResult> {
	if (brief.source === "offline") {
		return { appended: [], skippedUpstreamIds: [], conceptIds: [] };
	}

	const now = options.now ?? Date.now();
	const source = options.source ?? "pythia";
	const known = await knownUpstreamIds(log);

	const batch: CosmosEventInput[] = [];
	const skippedUpstreamIds: string[] = [];
	const touchedConcepts = new Set<string>();

	for (const raw of brief.events) {
		if (known.has(`world_event:${raw.id}`)) {
			skippedUpstreamIds.push(raw.id);
			continue;
		}
		const { event, conceptIds } = normalizeWorldEvent(raw, { source, now });
		for (const id of conceptIds) touchedConcepts.add(id);
		batch.push(
			event,
			...conceptObservationEvents(conceptIds, {
				domain: raw.domain,
				label: raw.title,
				upstreamId: raw.id,
				timestamp: parseTimestamp(raw.timestamp, now),
			}, source),
		);
	}

	for (const raw of brief.predictions) {
		if (known.has(`prediction:${raw.id}`)) {
			skippedUpstreamIds.push(raw.id);
			continue;
		}
		const { event, conceptIds } = normalizePrediction(raw, { source, now });
		for (const id of conceptIds) touchedConcepts.add(id);
		batch.push(
			event,
			...conceptObservationEvents(conceptIds, {
				domain: "prediction",
				label: raw.title,
				upstreamId: raw.id,
				timestamp: now,
			}, source),
		);
	}

	if (batch.length === 0) {
		return { appended: [], skippedUpstreamIds, conceptIds: [...touchedConcepts] };
	}

	const appended = await log.appendMany(
		batch.map((event) => ({ ...event, id: randomUUID() }) as CosmosEventInput),
	);

	return { appended, skippedUpstreamIds, conceptIds: [...touchedConcepts] };
}
