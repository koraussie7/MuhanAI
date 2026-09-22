/**
 * Projections — rebuild read models from the append-only log.
 *
 * The log is the only source of truth; everything the cosmic space shows is
 * derived here. Keeping projection pure (log in → state out) is what allows a
 * full rebuild at any time without drift, and lets the same code answer both
 * "what is true now" and "what was true at sequence N".
 */

import { amplify, statusForScore, type ReactionSample } from "./amplification.js";
import { conceptIdsOf } from "./log.js";
import { createConcept, observeConcept, projectRelation, relationId } from "./ontology.js";
import type {
	ConceptStatus,
	CosmosEvent,
	OntologyConcept,
	OntologyRelation,
	RelationType,
} from "./types.js";

interface MutableRelationDraft {
	sourceId: string;
	targetId: string;
	predicate: RelationType;
	proposals: { strength: number; confidence: number; eventId: string; proposedAt: number }[];
}

export interface ConceptProjection {
	concepts: Map<string, OntologyConcept>;
	relations: Map<string, OntologyRelation>;
	/** Highest sequence folded into this projection. */
	lastSequence: number;
	/** Reactions per target id, retained so relation convergence can be scored. */
	reactionsByTarget: Map<string, ReactionSample[]>;
	/** Convergence scratch state (not serialized; rebuilt with the projection). */
	relationDrafts: Map<string, MutableRelationDraft>;
}

/** Empty projection shell. */
export function emptyProjection(): ConceptProjection {
	return {
		concepts: new Map(),
		relations: new Map(),
		lastSequence: 0,
		reactionsByTarget: new Map(),
		relationDrafts: new Map(),
	};
}

/**
 * Fold one event into the projection. Mutates `projection` in place — callers
 * that need immutability should clone first; the server keeps one live
 * projection and rebuilds wholesale on restart.
 */
export function applyEvent(projection: ConceptProjection, event: CosmosEvent): void {
	if (event.sequence > projection.lastSequence) projection.lastSequence = event.sequence;

	switch (event.kind) {
		case "ontology_node": {
			const { conceptId, label, domain, status } = event.payload;
			const existing = projection.concepts.get(conceptId);
			if (existing) {
				projection.concepts.set(
					conceptId,
					observeConcept(existing, {
						...(event.payload.upstreamId !== undefined
							? { upstreamId: event.payload.upstreamId }
							: {}),
						seenAt: event.timestamp,
					}),
				);
				break;
			}
			projection.concepts.set(
				conceptId,
				createConcept({
					id: conceptId,
					label,
					domain,
					status,
					...(event.payload.upstreamId !== undefined
						? { upstreamId: event.payload.upstreamId }
						: {}),
					firstSeen: event.timestamp,
				}),
			);
			break;
		}

		case "world_event":
		case "prediction":
		case "agent_action": {
			// Concept *existence* comes from ontology_node events; feed events only
			// advance lastSeen so a concept that keeps being mentioned stays warm.
			for (const conceptId of conceptIdsOf(event)) {
				const existing = projection.concepts.get(conceptId);
				if (!existing) continue;
				projection.concepts.set(conceptId, observeConcept(existing, { seenAt: event.timestamp }));
			}
			break;
		}

		case "user_reaction": {
			const samples = projection.reactionsByTarget.get(event.payload.targetId) ?? [];
			const sample: ReactionSample = {
				reaction: event.payload.reaction,
				timestamp: event.timestamp,
			};
			if (event.actorId !== undefined) sample.actorId = event.actorId;
			samples.push(sample);
			projection.reactionsByTarget.set(event.payload.targetId, samples);

			const concept = projection.concepts.get(event.payload.targetId);
			if (concept) {
				const reactions = { ...concept.reactions };
				reactions[event.payload.reaction] = (reactions[event.payload.reaction] ?? 0) + 1;
				projection.concepts.set(event.payload.targetId, {
					...concept,
					reactions,
					reactionCount: concept.reactionCount + 1,
				});
			}
			break;
		}

		case "relation_event": {
			const { sourceId, targetId, predicate } = event.payload;
			const id = relationId(sourceId, predicate, targetId);
			const entry = projection.relationDrafts.get(id) ?? {
				sourceId,
				targetId,
				predicate,
				proposals: [],
			};
			entry.proposals.push({
				strength: event.payload.strength,
				confidence: 0.5,
				eventId: event.id,
				proposedAt: event.timestamp,
			});
			projection.relationDrafts.set(id, entry);

			projection.relations.set(
				id,
				projectRelation({ sourceId, targetId, predicate, proposals: entry.proposals }),
			);
			break;
		}

		case "amplification": {
			const concept = projection.concepts.get(event.payload.conceptId);
			if (!concept) break;
			const signals = [
				event.payload.signal,
				...concept.signals.filter((signal) => signal !== event.payload.signal),
			];
			projection.concepts.set(event.payload.conceptId, { ...concept, signals });
			break;
		}
	}
}
