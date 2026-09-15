/**
 * Commitment scheme for sealed-bid auctions.
 *
 * Vickrey auctions require bid privacy until reveal. We implement a
 * classical commit-reveal protocol using SHA-256:
 *
 *   commit = H(amount || ":" || nonce)     ← posted during commit phase
 *   reveal = (amount, nonce)               ← posted during reveal phase
 *
 * The auctioneer verifies SHA-256(amount || ":" || nonce) === commit
 * before counting the bid. Nonces are 32 random bytes (hex) to make
 * brute-force reversal infeasible.
 */

import { createHash, randomBytes } from "node:crypto";

const NONCE_BYTES = 32;

export interface BidCommitment {
	/** Hex SHA-256 of `amount || ":" || nonce`. */
	hash: string;
	/** Random hex nonce (32 bytes). Kept secret until reveal. */
	nonce: string;
	/** Numeric bid amount (credits / tokens / whatever the unit). */
	amount: number;
}

export class CommitmentError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "CommitmentError";
	}
}

/** Generate a fresh random nonce as 64-char hex. */
export function generateNonce(): string {
	return randomBytes(NONCE_BYTES).toString("hex");
}

/**
 * Build the canonical bytes that get hashed. The separator must not
 * appear inside a numeric `amount` (decimal digits only) or inside
 * hex `nonce` (0-9a-f only), so ambiguity is impossible.
 */
function canonicalBytes(amount: number, nonce: string): string {
	if (!Number.isFinite(amount) || amount < 0 || !Number.isInteger(amount)) {
		throw new CommitmentError(`commitment: amount must be a non-negative integer (got ${amount})`);
	}
	if (!/^[0-9a-f]+$/i.test(nonce)) {
		throw new CommitmentError(`commitment: nonce must be hex`);
	}
	return `${amount}:${nonce.toLowerCase()}`;
}

/** Compute the hex SHA-256 commitment for `(amount, nonce)`. */
export function commitTo(amount: number, nonce: string): string {
	return createHash("sha256").update(canonicalBytes(amount, nonce)).digest("hex");
}

/**
 * Build a fresh BidCommitment. Returns the (hash, nonce, amount)
 * triple — the caller must keep `nonce` secret until reveal.
 */
export function createBidCommitment(amount: number, providedNonce?: string): BidCommitment {
	const nonce = providedNonce ?? generateNonce();
	const hash = commitTo(amount, nonce);
	return { hash, nonce, amount };
}

/**
 * Verify that a reveal matches a previously-posted commitment.
 * Returns true iff SHA-256(amount || ":" || nonce) === commitment.
 */
export function verifyReveal(commitment: string, amount: number, nonce: string): boolean {
	try {
		return commitTo(amount, nonce) === commitment;
	} catch {
		return false;
	}
}
