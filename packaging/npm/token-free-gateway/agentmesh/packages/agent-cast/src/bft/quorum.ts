/**
 * BFT quorum calculator.
 *
 * Given n participants, the system tolerates up to f = floor((n-1)/3)
 * Byzantine (malicious or faulty) nodes. To make progress despite those f
 * failures, every phase must collect 2f+1 matching votes — i.e. a strict
 * majority of more than two-thirds.
 *
 * Why 2/3 + 1?
 *   - With n = 3f + 1, any two quorums of size 2f+1 must overlap in at
 *     least f+1 honest nodes (quorum intersection property).
 *   - That overlap guarantees that once a value is committed, no other
 *     conflicting value can gather a quorum.
 */

export interface QuorumSpec {
	/** Total participants. */
	n: number;
	/** Maximum number of Byzantine nodes this system can mask. */
	f: number;
	/** Minimum matching votes required at each phase (2f+1). */
	quorum: number;
	/** Strict threshold below which consensus is impossible. */
	weakQuorum: number;
}

/**
 * Compute the fault tolerance and quorum sizes for a given participant
 * count. Throws if n < 1.
 */
export function quorumFor(n: number): QuorumSpec {
	if (!Number.isInteger(n) || n < 1) {
		throw new Error(`bft.quorumFor: n must be a positive integer (got ${n})`);
	}
	const f = Math.max(0, Math.floor((n - 1) / 3));
	const quorum = 2 * f + 1;
	// Below f+1 distinct votes, no quorum is even theoretically reachable.
	const weakQuorum = f + 1;
	return { n, f, quorum, weakQuorum };
}

/** Returns true if a vote count clears the prepare/commit quorum. */
export function hasQuorum(votes: number, spec: QuorumSpec): boolean {
	return votes >= spec.quorum;
}

/** Returns the maximum number of faults that could still be tolerated given observed votes. */
export function maxByzantineObserved(votes: number, spec: QuorumSpec): number {
	return Math.max(0, spec.n - votes - 1);
}
