// Ported from stellavault (MIT) — github.com/Evanciel/stellavault v0.9.0
// Source: packages/core/src/intelligence/fsrs.ts
//
// FSRS-6 power forgetting curve and stability update. Pure functions — no
// IO, no module-level state. Safe to use in any context (server, edge,
// worker thread). The companion DecayEngine in ./engine.ts wraps these
// functions with per-node state and access logging.
//
// MIT License — Copyright (c) 2026 Evan (KHS). All rights reserved.

/**
 * Default FSRS parameters (anchored at 7-day initial stability, moderate
 * difficulty). Mirrors stellavault v0.9.0 fsrs.ts:14-19. Tuned for
 * flashcard-style knowledge notes; we keep the defaults unchanged for
 * v0.1 and may re-tune per P2 measurements against the MuhanAI corpus.
 */
export const FSRS_PARAMS = {
	initialStability: 7.0,
	difficulty: 5.0,
	a: 0.4,
	b: 0.6,
	c: 0.2,
	d: 1.0,
	sizeFactor: 0.5,
	connectionFactor: 1.0,
} as const;

/**
 * R(t) = (1 + t/(9S))^(-1) — FSRS power forgetting curve.
 *
 * Returns the probability that a node with the given stability (in days)
 * is still retrievable after `elapsedDays` days have passed since last
 * access. Boundary cases match stellavault v0.9.0:
 *   - elapsedDays <= 0  → 1.0 (just seen)
 *   - stabilityDays <= 0 → 0.0 (no memory)
 *
 * Example: computeRetrievability(7, 1) ≈ 0.674.
 */
export function computeRetrievability(
	stabilityDays: number,
	elapsedDays: number,
): number {
	if (elapsedDays <= 0) return 1.0;
	if (stabilityDays <= 0) return 0.0;
	return Math.pow(1 + elapsedDays / (9 * stabilityDays), -1);
}

/**
 * S' = S * (1 + a * D^(-b) * S^(-c) * (e^(d*(1-R)) - 1)), capped at 365.
 *
 * Updates stability after a successful recall. Higher currentR (easier
 * recall) → larger growth factor → stability climbs. The 365-day cap
 * matches stellavault v0.9.0 and prevents runaway values for repeatedly
 * accessed nodes.
 *
 * The growth term is clamped at 0 so pathological inputs (negative
 * exponent results, NaN) cannot shrink stability.
 */
export function updateStability(
	currentS: number,
	difficulty: number,
	currentR: number,
): number {
	const { a, b, c, d } = FSRS_PARAMS;
	const growth =
		a *
		Math.pow(difficulty, -b) *
		Math.pow(currentS, -c) *
		(Math.exp(d * (1 - currentR)) - 1);
	return Math.min(currentS * (1 + Math.max(0, growth)), 365);
}
