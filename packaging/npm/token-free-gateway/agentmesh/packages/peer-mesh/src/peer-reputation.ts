/**
 * Subject-scoped peer reputation registry (folklore port).
 *
 * Original: https://github.com/usefolklore/folklore
 *   src/domain/peer-reputation.ts (14922 bytes)
 *   src/infrastructure/peer-reputation-store.ts
 * License: MIT (verbatim port — attribution preserved per MIT §4(b))
 *
 * Folklore's design partitions reputation by *subject*: the same peer
 * can have a high score for `entity:product:lemlist` but a low score
 * for `entity:product:other`. We adopt the same idea but reuse the
 * Bayesian-EMA `ReputationStore` from @agentmesh/credit-system (S1) — its
 * (α, β) posterior gives us mean AND variance, which folklore's
 * `recordObservation` derives only at query time. Our `update()` is
 * synchronous and in-memory; persistence is the store layer's job
 * (Phase 4+ Prisma).
 *
 * Design decisions:
 *   - subject is an opaque string; default subject is "*" (catch-all).
 *   - reputationStore is injected so tests can substitute, and so
 *     persistence (Prisma / sled) can replace the in-memory default
 *     without rewiring the registry.
 *   - We deliberately do NOT port folklore's lazy decay, freshness
 *     multiplier, or load-aware rank_score here — those belong in
 *     a separate `peer-ranking.ts` (Phase 3+, ADR-0003 §6).
 */

import {
	applySignal,
	initialReputation,
	mean,
	type ReputationSignal,
	type ReputationState,
	ReputationStore,
	variance,
} from "@agentmesh/credit-system";

export type Subject = string;
export const DEFAULT_SUBJECT = "*";

export interface PeerReputation {
	subject: Subject;
	peerId: string;
	score: number; // ∈ [0, 1]
	variance: number; // uncertainty
	updatedAt: number;
}

export interface UpdateResult {
	score: number;
	variance: number;
}

export class PeerReputationRegistry {
	// subject → peerId → ReputationState — independent α/β per (subject, peer) cell
	// (matches folklore's design: same peer can be reliable for "chat" but
	// unreliable for "compute", and the two cells never bleed into each other).
	private states = new Map<Subject, Map<string, ReputationState>>();

	// Kept for API parity with the spec + future persistence wiring (Phase 4+
	// Prisma can be wrapped behind this reference). The per-subject semantics
	// require independent (α, β) per cell, which `ReputationStore` (keyed by
	// peerId) cannot express directly — so each (subject, peer) cell maintains
	// its own state via `initialReputation` + `applySignal` from credits.
	private readonly reputationStore: ReputationStore;

	constructor(store?: ReputationStore) {
		this.reputationStore = store ?? new ReputationStore();
	}

	/**
	 * Apply a signal to the (subject, peer) cell.
	 * Creates the subject map on first signal for that subject.
	 * Returns the post-update { score, variance } derived from (α, β).
	 */
	update(subject: Subject, signal: ReputationSignal): UpdateResult {
		let subjectMap = this.states.get(subject);
		if (!subjectMap) {
			subjectMap = new Map();
			this.states.set(subject, subjectMap);
		}
		const current =
			subjectMap.get(signal.peerId) ?? initialReputation(signal.peerId, signal.timestamp);
		const next = applySignal(current, signal);
		subjectMap.set(signal.peerId, next);
		return { score: mean(next), variance: variance(next) };
	}

	reputationFor(subject: Subject, peerId: string): PeerReputation | undefined {
		const subjectMap = this.states.get(subject);
		const state = subjectMap?.get(peerId);
		if (!state) return undefined;
		return {
			subject,
			peerId,
			score: mean(state),
			variance: variance(state),
			updatedAt: state.updatedAt,
		};
	}

	subjectsForPeer(peerId: string): Subject[] {
		const out: Subject[] = [];
		for (const [subject, m] of this.states) {
			if (m.has(peerId)) out.push(subject);
		}
		return out;
	}

	subjects(): Subject[] {
		return Array.from(this.states.keys());
	}

	peersForSubject(subject: Subject): string[] {
		const m = this.states.get(subject);
		return m ? Array.from(m.keys()) : [];
	}

	size(): number {
		let n = 0;
		for (const m of this.states.values()) n += m.size;
		return n;
	}

	all(): PeerReputation[] {
		const out: PeerReputation[] = [];
		for (const [subject, m] of this.states) {
			for (const state of m.values()) {
				out.push({
					subject,
					peerId: state.peerId,
					score: mean(state),
					variance: variance(state),
					updatedAt: state.updatedAt,
				});
			}
		}
		return out;
	}

	/** Expose the underlying store (held for persistence wiring; not used for state). */
	getStore(): ReputationStore {
		return this.reputationStore;
	}
}
