/**
 * Bayesian-EMA reputation score (HiveBear crates/hivebear-mesh/src/trust/reputation.rs port).
 *
 * Original: https://github.com/BeckhamLabsLLC/HiveBear
 *   crates/hivebear-mesh/src/trust/reputation.rs (6769 bytes)
 * License: MIT (verbatim port — attribution preserved per MIT §4(b))
 *
 * Model:
 *   posterior(α, β) — Beta distribution parameters updated by positive/negative signals
 *   mean     = α / (α + β)                 ∈ [0, 1]
 *   variance = αβ / ((α+β)²(α+β+1))         uncertainty
 *
 * Update rule:
 *   positive signal: α ← α + w
 *   negative signal: β ← β + w
 *   prior:           α = β = 1   (uniform Beta(1, 1))
 *
 * Local changes from Rust original:
 *   - Rust Result<T, E> → TS throwing / Result-union via explicit return
 *   - Removed async (HiveBear persists to sled; we keep in-memory in M1, Prisma in Phase 4+)
 *   - `weight: f64` allows fractional signals (e.g. minor dispute = 0.5)
 */

export interface ReputationState {
	peerId: string;
	alpha: number;
	beta: number;
	updatedAt: number;
}

export interface ReputationSignal {
	peerId: string;
	positive: boolean;
	weight?: number;
	timestamp: number;
}

export const REPUTATION_PRIOR_ALPHA = 1;
export const REPUTATION_PRIOR_BETA = 1;

export function initialReputation(peerId: string, now: number = Date.now()): ReputationState {
	return {
		peerId,
		alpha: REPUTATION_PRIOR_ALPHA,
		beta: REPUTATION_PRIOR_BETA,
		updatedAt: now,
	};
}

export function applySignal(state: ReputationState, signal: ReputationSignal): ReputationState {
	const w = signal.weight ?? 1.0;
	if (w < 0) throw new Error(`reputation: negative weight not allowed (got ${w})`);
	if (!Number.isFinite(w)) throw new Error(`reputation: non-finite weight (got ${w})`);
	return signal.positive
		? {
				peerId: state.peerId,
				alpha: state.alpha + w,
				beta: state.beta,
				updatedAt: signal.timestamp,
			}
		: {
				peerId: state.peerId,
				alpha: state.alpha,
				beta: state.beta + w,
				updatedAt: signal.timestamp,
			};
}

export function mean(state: ReputationState): number {
	return state.alpha / (state.alpha + state.beta);
}

export function variance(state: ReputationState): number {
	const sum = state.alpha + state.beta;
	return (state.alpha * state.beta) / (sum * sum * (sum + 1));
}

export class ReputationStore {
	private states = new Map<string, ReputationState>();

	ensure(peerId: string, now: number = Date.now()): ReputationState {
		let s = this.states.get(peerId);
		if (!s) {
			s = initialReputation(peerId, now);
			this.states.set(peerId, s);
		}
		return s;
	}

	update(signal: ReputationSignal): ReputationState {
		const current = this.ensure(signal.peerId, signal.timestamp);
		const next = applySignal(current, signal);
		this.states.set(signal.peerId, next);
		return next;
	}

	get(peerId: string): ReputationState | undefined {
		return this.states.get(peerId);
	}

	all(): ReputationState[] {
		return Array.from(this.states.values());
	}

	size(): number {
		return this.states.size;
	}

	remove(peerId: string): boolean {
		return this.states.delete(peerId);
	}
}
