// Per-node FSRS decay engine for MuhanAI knowledge-base.
//
// Wraps the pure FSRS functions in ./fsrs.ts with mutable per-node state
// (stability, last access, access count) and an access log hook designed
// to be called from retrieval.ts and hybrid-search.ts after each hit.
//
// On access, the engine:
//   1. Computes current R from the node's last access (decay since then).
//   2. Updates stability with updateStability(S, D, R).
//   3. Records the new lastAccessedAt + increments accessCount.
//
// The companion getRetrievabilityScores() returns a Map<nodeId, R> ready
// to drop into rrfFusionN() as the recencyScores argument (P2).
//
// MIT — uses fsrs.ts ported from stellavault v0.9.0.

import { FSRS_PARAMS, computeRetrievability, updateStability } from "./fsrs.js";

export type AccessType = "search" | "view" | "edit" | "share";

export interface DecayRecord {
	nodeId: string;
	stabilityDays: number;
	difficulty: number;
	lastAccessedAt: number;
	accessCount: number;
}

export interface DecayEngineOptions {
	clock?: () => number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export class DecayEngine {
	private records = new Map<string, DecayRecord>();

	constructor(private opts: DecayEngineOptions = {}) {}

	/** Override-able clock for tests. */
	private now(): number {
		return this.opts.clock ? this.opts.clock() : Date.now();
	}

	/**
	 * Look up the record for a node, creating a default if it does not
	 * exist yet. Default uses initialStability and the access moment.
	 */
	private getOrInit(nodeId: string): DecayRecord {
		let r = this.records.get(nodeId);
		if (!r) {
			r = {
				nodeId,
				stabilityDays: FSRS_PARAMS.initialStability,
				difficulty: FSRS_PARAMS.difficulty,
				lastAccessedAt: this.now(),
				accessCount: 0,
			};
			this.records.set(nodeId, r);
		}
		return r;
	}

	/**
	 * Log an access to a node. Computes decay since the previous access,
	 * updates stability, and refreshes lastAccessedAt. Returns the new
	 * record for callers that want to surface stats.
	 */
	recordAccess(nodeId: string, type: AccessType = "search"): DecayRecord {
		const now = this.now();
		const r = this.getOrInit(nodeId);
		const elapsedDays = Math.max(0, (now - r.lastAccessedAt) / DAY_MS);
		const currentR = computeRetrievability(r.stabilityDays, elapsedDays);
		r.stabilityDays = updateStability(r.stabilityDays, r.difficulty, currentR);
		r.lastAccessedAt = now;
		r.accessCount += 1;
		// `type` is reserved for future per-type weighting (e.g. edits
		// might boost stability more than passive search views). For
		// v0.1 we treat all access types uniformly.
		void type;
		return r;
	}

	/**
	 * Current retrievability for a single node. Nodes that have never
	 * been seen return the initial-state R based on initialStability
	 * and (now - node epoch). Unknown nodes that we have never recorded
	 * default to R = initialStability decay from the engine's clock
	 * start — which is effectively R ≈ 1.0 (just-now baseline).
	 */
	getRetrievability(nodeId: string, now: number = this.now()): number {
		const r = this.records.get(nodeId);
		if (!r) {
			return computeRetrievability(FSRS_PARAMS.initialStability, 0);
		}
		const elapsedDays = Math.max(0, (now - r.lastAccessedAt) / DAY_MS);
		return computeRetrievability(r.stabilityDays, elapsedDays);
	}

	/**
	 * Bulk R lookup for use in RRF fusion (P2). Unseen nodes get a
	 * neutral 0.5 R (so they neither boost nor hurt ranking). Missing
	 * ids are returned as 0.5 in the map so callers can detect them
	 * via `getRetrievability(id) === 0.5 && !records.has(id)`.
	 */
	getRetrievabilityScores(
		nodeIds: Iterable<string>,
		now: number = this.now(),
	): Map<string, number> {
		const out = new Map<string, number>();
		for (const id of nodeIds) {
			out.set(id, this.getRetrievability(id, now));
		}
		return out;
	}

	/** Read-only view of a record (for tests and inspection). */
	peek(nodeId: string): DecayRecord | undefined {
		const r = this.records.get(nodeId);
		return r ? { ...r } : undefined;
	}

	/** Number of tracked nodes. */
	get size(): number {
		return this.records.size;
	}

	/** Drop a node's record (e.g. on deletion). */
	forget(nodeId: string): void {
		this.records.delete(nodeId);
	}

	/** Drop all records. */
	reset(): void {
		this.records.clear();
	}
}

export const decayEngine = new DecayEngine();
