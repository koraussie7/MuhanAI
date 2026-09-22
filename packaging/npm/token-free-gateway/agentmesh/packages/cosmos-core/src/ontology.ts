/**
 * Ontology mapping helpers.
 *
 * The bridge between raw feed text and stable concept identity. Everything the
 * cosmic space exposes is keyed by a concept id of the form
 * `domain::normalized label`, so the same real-world thing mentioned by Pythia,
 * Osiris, a user, or an agent collapses onto one node instead of fragmenting
 * into near-duplicates.
 *
 * Rules kept intentionally boring and deterministic: trimming, case folding,
 * whitespace collapsing, and edge-punctuation stripping. Anything fancier
 * (stemming, translation, embeddings) belongs in a *merge proposal* — i.e. a
 * derivation that users and agents can confirm — never in the identity function.
 */

import type {
	ConceptStatus,
	OntologyConcept,
	OntologyRelation,
	RelationType,
} from "./types.js";

/** Clamp any number into the 0..1 range (NaN → 0). */
export function clamp01(value: number): number {
	if (!Number.isFinite(value)) return 0;
	if (value <= 0) return 0;
	if (value >= 1) return 1;
	return value;
}

/** Lowercase, collapse whitespace, drop edge punctuation. */
export function normalizeLabel(label: string): string {
	return label
		.normalize("NFKC")
		.toLowerCase()
		.replace(/\s+/g, " ")
		.replace(/^[\s"'“”‘’()[\]{}<>.,;:!?~|/\\-]+/, "")
		.replace(/[\s"'“”‘’()[\]{}<>.,;:!?~|/\\-]+$/, "")
		.trim();
}

/** Lowercase and slug the domain segment so `Cyber ` and `cyber` agree. */
export function normalizeDomain(domain: string): string {
	return (
		normalizeLabel(domain)
			.replace(/\s+/g, "_")
			.replace(/[^a-z0-9_\-가-힣]/g, "") || "general"
	);
}

/** Stable concept id. Empty labels degrade to a `general` bucket, never throw. */
export function conceptId(domain: string, label: string): string {
	const normalized = normalizeLabel(label);
	return `${normalizeDomain(domain)}::${normalized || "untitled"}`;
}

/** Split a concept id back into its parts (id contract: `domain::label`). */
export function parseConceptId(id: string): { domain: string; label: string } {
	const index = id.indexOf("::");
	if (index === -1) return { domain: "general", label: id };
	return {
		domain: id.slice(0, index),
		label: id.slice(index + 2),
	};
}

/** Deterministic relation id so repeated proposals land on one edge. */
export function relationId(
	sourceId: string,
	predicate: RelationType,
	targetId: string,
): string {
	return `${sourceId}|${predicate}|${targetId}`;
}

/**
 * Fold a new observation into an existing concept projection.
 *
 * `lastSeen` always advances; `firstSeen` never moves. Upstream ids accumulate
 * without duplicates so provenance survives repeated ingestion from the same
 * feed. Returns a new object — projections are values, the log stays the only
 * mutation point.
 */
export function observeConcept(
	existing: OntologyConcept,
	observation: { upstreamId?: string; seenAt: number },
): OntologyConcept {
	const upstreamIds = [...existing.upstreamIds];
	if (observation.upstreamId && !upstreamIds.includes(observation.upstreamId)) {
		upstreamIds.push(observation.upstreamId);
	}
	return {
		...existing,
		upstreamIds,
		lastSeen: Math.max(existing.lastSeen, observation.seenAt),
		firstSeen: Math.min(existing.firstSeen, observation.seenAt),
	};
}

/** One relation proposal feeding the relation projection. */
export interface RelationProposal {
	strength: number;
	confidence: number;
	eventId: string;
	proposedAt: number;
}

/**
 * Project a relation from its accumulated proposals. Strength blends the mean
 * of proposal strengths with a small convergence bonus so repeated independent
 * proposals outrank one loud claim.
 */
export function projectRelation(input: {
	sourceId: string;
	targetId: string;
	predicate: RelationType;
	proposals: RelationProposal[];
}): OntologyRelation {
	const { proposals } = input;
	const count = proposals.length;
	if (count === 0) {
		return {
			id: relationId(input.sourceId, input.predicate, input.targetId),
			sourceId: input.sourceId,
			targetId: input.targetId,
			predicate: input.predicate,
			strength: 0,
			confidence: 0,
			proposalCount: 0,
			evidenceEventIds: [],
			firstSeen: 0,
			lastSeen: 0,
		};
	}

	let strengthSum = 0;
	let confidenceSum = 0;
	let firstSeen = Number.POSITIVE_INFINITY;
	let lastSeen = 0;
	const evidenceEventIds: string[] = [];

	for (const proposal of proposals) {
		strengthSum += clamp01(proposal.strength);
		confidenceSum += clamp01(proposal.confidence);
		firstSeen = Math.min(firstSeen, proposal.proposedAt);
		lastSeen = Math.max(lastSeen, proposal.proposedAt);
		evidenceEventIds.push(proposal.eventId);
	}

	const meanStrength = strengthSum / count;
	const convergenceBonus = Math.min(0.25, (count - 1) * 0.05);

	return {
		id: relationId(input.sourceId, input.predicate, input.targetId),
		sourceId: input.sourceId,
		targetId: input.targetId,
		predicate: input.predicate,
		strength: clamp01(meanStrength + convergenceBonus),
		confidence: clamp01(confidenceSum / count),
		proposalCount: count,
		evidenceEventIds,
		firstSeen: Number.isFinite(firstSeen) ? firstSeen : 0,
		lastSeen,
	};
}

export function createConcept(input: {
	id: string;
	label: string;
	domain: string;
	status?: ConceptStatus;
	upstreamId?: string;
	firstSeen: number;
	metadata?: Record<string, unknown>;
}): OntologyConcept {
	const concept: OntologyConcept = {
		id: input.id,
		label: input.label,
		domain: input.domain,
		upstreamIds: input.upstreamId ? [input.upstreamId] : [],
		status: input.status ?? "raw",
		firstSeen: input.firstSeen,
		lastSeen: input.firstSeen,
		reactionCount: 0,
		reactions: {},
		signalScore: 0,
		signals: [],
	};
	if (input.metadata) concept.metadata = input.metadata;
	return concept;
}
