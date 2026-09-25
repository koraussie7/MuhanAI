/**
 * cosmos-core types — event-log-first cosmic knowledge core.
 *
 * Design rules (agreed plan):
 *  1. Every change enters the system as an append-only event. Nothing is
 *     mutated in place; graph/state/reaction aggregates are *projections*
 *     rebuilt from the log.
 *  2. Ontology concepts are exposed as candidates whose meaning is confirmed
 *     by interaction (reaction → record → amplify).
 *  3. Sources: Pythia World Engine (world-routes), Osiris world state,
 *     ShadowBroker geospatial OSINT, users, and agents all emit into the
 *     same stream.
 */

// ---------------------------------------------------------------------------
// Event taxonomy
// ---------------------------------------------------------------------------

/**
 * Where an event came from.
 *
 * `shadowbroker` carries geospatial OSINT observations (aircraft, vessels,
 * satellites, GPS jamming) from github.com/BigBodyCobain/Shadowbroker. Keeping
 * it distinct from `pythia` matters: Pythia emits *forecasts*, ShadowBroker
 * emits *observed positions*. Temporal correlation rules match the two, so a
 * forecast and its confirming observation must stay separable in the log.
 */
export type CosmosEventSource = "pythia" | "shadowbroker" | "osiris" | "user" | "agent" | "system";

/** Reaction verbs a user or agent can apply to a concept/relation/event. */
export type ReactionType =
	| "confirm"
	| "deny"
	| "connect_suggest"
	| "correct"
	| "question"
	| "prioritize"
	| "note_attach";

/** Amplification signal kinds derived from recorded reactions. */
export type SignalType =
	| "reaction_volume"
	| "reaction_strength"
	| "cross_agent"
	| "relation_convergence"
	| "temporal_clustering"
	| "citations"
	| "prediction_accuracy";

/** Ontology lifecycle: raw → validated → amplified (deprecated is terminal). */
export type ConceptStatus = "raw" | "validated" | "amplified" | "deprecated";

/** Relation predicates available in the initial ontology. */
export type RelationType =
	| "related_to"
	| "causes"
	| "precedes"
	| "part_of"
	| "contradicts"
	| "amplifies"
	| "mitigates"
	| "instance_of"
	| "derived_from";

/** Severity mirrored from the Pythia world feed. */
export type WorldSeverity = "info" | "watch" | "alert";

/** Forecast horizons mirrored from the Pythia world feed. */
export type PredictionHorizon = "24h" | "1w" | "1m" | "1y";

// ---------------------------------------------------------------------------
// Event payloads
// ---------------------------------------------------------------------------

/** Shared envelope fields every event carries. */
export interface CosmosEventBase {
	id: string;
	/** Monotonic position in the log (assigned by the log on append). */
	sequence: number;
	/** Epoch millis. */
	timestamp: number;
	source: CosmosEventSource;
	/** Optional actor (user id, agent id) when the source is user/agent. */
	actorId?: string;
}

/** A live world fact ingested from Pythia/Osiris/ShadowBroker feeds. */
export interface WorldEventIngested extends CosmosEventBase {
	kind: "world_event";
	payload: {
		domain: string;
		title: string;
		severity: WorldSeverity;
		location?: string;
		/**
		 * GeoJSON-style point, present only on geospatial sources
		 * (ShadowBroker). Lat/lng are degrees; `altitudeM` is metres when known.
		 */
		geo?: { lat: number; lng: number; altitudeM?: number };
		upstreamId: string;
		/** Concept ids this event touched (concept = domain::label). */
		conceptIds: string[];
		raw?: Record<string, unknown>;
	};
}

/** A forecast issued by the world engine. */
export interface PredictionIssued extends CosmosEventBase {
	kind: "prediction";
	payload: {
		domain: string;
		title: string;
		horizon: PredictionHorizon;
		probability: number;
		confidence: number;
		rationale: string;
		upstreamId: string;
		conceptIds: string[];
	};
}

/** First observation of a (possibly new) ontology concept. */
export interface OntologyNodeObserved extends CosmosEventBase {
	kind: "ontology_node";
	payload: {
		conceptId: string;
		label: string;
		domain: string;
		status: ConceptStatus;
		upstreamId?: string;
	};
}

/** A user or agent reacting to something already in the space. */
export interface UserReactionRecorded extends CosmosEventBase {
	kind: "user_reaction";
	payload: {
		/** Concept/relation/event id being reacted to. */
		targetId: string;
		reaction: ReactionType;
		/** Free-form context (selection text, note body, UI surface…). */
		context?: string;
	};
}

/** A proposed relation between two concepts (awaits validation). */
export interface RelationProposed extends CosmosEventBase {
	kind: "relation_event";
	payload: {
		sourceId: string;
		targetId: string;
		predicate: RelationType;
		/** 0..1 — how strongly the emitter believes this link holds. */
		strength: number;
		evidenceEventIds?: string[];
		reason?: string;
	};
}

/** A derived amplification signal applied to a concept. */
export interface AmplificationRecorded extends CosmosEventBase {
	kind: "amplification";
	payload: {
		conceptId: string;
		signal: SignalType;
		/** Signal magnitude, 0..1. */
		magnitude: number;
		/** Ids of the events that produced this signal. */
		evidenceEventIds?: string[];
	};
}

/** Agent-side action observation (exploration, hypothesis, tool run…). */
export interface AgentActionRecorded extends CosmosEventBase {
	kind: "agent_action";
	payload: {
		action: string;
		conceptIds?: string[];
		outcome?: "ok" | "error" | "inconclusive";
		detail?: string;
	};
}

/** The full event union stored in the log. */
export type CosmosEvent =
	| WorldEventIngested
	| PredictionIssued
	| OntologyNodeObserved
	| UserReactionRecorded
	| RelationProposed
	| AmplificationRecorded
	| AgentActionRecorded;

export type CosmosEventKind = CosmosEvent["kind"];

/** Input shape accepted by `append()` — id/sequence are assigned by the log.
 *
 * Defined as an explicit union (not `Omit<CosmosEvent, ...>`) because TypeScript
 * collapses `Omit` over a union into an intersection, which breaks the `Extract<...>`
 * pattern used in `ingest.ts` to narrow each variant's payload.
 *
 * Each arm has `{ id?: string }` intersected individually so the optional `id` is
 * visible on every variant (the bare `| { id?: string }` at the end would be
 * swallowed by union-intersection precedence).
 */
export type CosmosEventInput =
	| (Omit<WorldEventIngested, "id" | "sequence"> & { id?: string })
	| (Omit<PredictionIssued, "id" | "sequence"> & { id?: string })
	| (Omit<OntologyNodeObserved, "id" | "sequence"> & { id?: string })
	| (Omit<UserReactionRecorded, "id" | "sequence"> & { id?: string })
	| (Omit<RelationProposed, "id" | "sequence"> & { id?: string })
	| (Omit<AmplificationRecorded, "id" | "sequence"> & { id?: string })
	| (Omit<AgentActionRecorded, "id" | "sequence"> & { id?: string });

// ---------------------------------------------------------------------------
// Ontology
// ---------------------------------------------------------------------------

/**
 * An ontology concept as exposed in the cosmic space. Concepts are candidates:
 * `signalScore`/`reactionCount` grow as users and agents react, which is how
 * "meaningful information" is distilled out of raw feed noise.
 */
export interface OntologyConcept {
	/** Stable id derived from `domain::normalized label`. */
	id: string;
	label: string;
	domain: string;
	/** Upstream ids that first introduced this concept. */
	upstreamIds: string[];
	status: ConceptStatus;
	/** Epoch millis of the first/last observation. */
	firstSeen: number;
	lastSeen: number;
	/** Aggregated reaction counters (projection, not source of truth). */
	reactionCount: number;
	/** Per-verb reaction tallies. */
	reactions: Partial<Record<ReactionType, number>>;
	/** 0..1 significance score derived from amplification signals. */
	signalScore: number;
	/** Signals that contributed to `signalScore` (latest first). */
	signals: SignalType[];
	parentIds?: string[];
	metadata?: Record<string, unknown>;
}

/** A relation between two concepts as projected from relation events. */
export interface OntologyRelation {
	id: string;
	sourceId: string;
	targetId: string;
	predicate: RelationType;
	/** 0..1 accumulated strength across contributing proposals. */
	strength: number;
	/** 0..1 average confidence of the proposals. */
	confidence: number;
	/** Number of distinct proposals that asserted this relation. */
	proposalCount: number;
	evidenceEventIds: string[];
	firstSeen: number;
	lastSeen: number;
}

/** Query filter for log reads/streams. */
export interface EventFilter {
	kinds?: CosmosEventKind[];
	sources?: CosmosEventSource[];
	/** Only events whose sequence is greater than this value. */
	sinceSequence?: number;
	/** Only events at/after this epoch-millis timestamp. */
	sinceTimestamp?: number;
	actorId?: string;
	/** Only events referencing this concept id in their payload. */
	conceptId?: string;
}

/** Cursor returned by `tail()` so callers can resume incrementally. */
export interface LogCursor {
	sequence: number;
}

/** Append-only event log contract. */
export interface AppendOnlyLog {
	/** Append one event; assigns `id` (when absent) and `sequence`. */
	append(event: CosmosEventInput): Promise<CosmosEvent>;
	/** Append many events atomically in ordering terms (same lock). */
	appendMany(events: CosmosEventInput[]): Promise<CosmosEvent[]>;
	/** Read events in `(from, to]` sequence order. */
	getRange(fromSequence: number, toSequence: number): Promise<CosmosEvent[]>;
	/** All events matching the filter, oldest first. */
	query(filter?: EventFilter): Promise<CosmosEvent[]>;
	/** Newest `limit` events, oldest-first in the returned array. */
	tail(limit: number, filter?: EventFilter): Promise<CosmosEvent[]>;
	/** Current highest sequence (0 when empty). */
	lastSequence(): Promise<number>;
	/** Total number of stored events. */
	size(): Promise<number>;
	/**
	 * Subscribe to newly appended events. Returns an async iterator that yields
	 * events as they are appended (optionally replaying `sinceSequence` first)
	 * and an unsubscribe function.
	 */
	subscribe(
		filter?: EventFilter,
		options?: { sinceSequence?: number },
	): { events: AsyncIterable<CosmosEvent>; unsubscribe: () => void };
	/** Remove all events (tests / dev reset only). */
	reset(): Promise<void>;
}
