/**
 * 4-tier credit account (pinkybrain src/credit_system.py port).
 *
 * Original: https://github.com/pinkybrain-p2p/pinkybrain
 *   src/credit_system.py (16987 bytes)
 * License: MIT (verbatim port — attribution preserved per MIT §4(b))
 *
 * Tiers:
 *   free        : reputation < 0.2  — new peers, grace tokens only
 *   contributor : 0.2 <= r < 0.5    — earns base + reputation-weighted bonus
 *   power       : 0.5 <= r < 0.8    — earns base + monthly_rewards
 *   unlimited   : r >= 0.8          — full monthly_rewards + no spend cap
 *
 * Model:
 *   tier        = f(reputation)                              deterministic mapping
 *   allocation  = baseAllocation + ⌊reputation × monthlyRewards⌋
 *   carryOver   = ⌊prevBalance × CARRY_OVER_PCT⌋ + baseAllocation   monthly rollover
 *
 * Local changes from Python original:
 *   - Python int → TS number for allocations (Python uses Decimal/uint64; we use float
 *     with Math.floor for deterministic non-negative integer credit units)
 *   - Pinkybrain's MongoDB-backed AccountBook → TS in-memory Map (Prisma in Phase 4+)
 *   - Tier thresholds extracted to named constants for testability
 */

export type CreditTier = "free" | "contributor" | "power" | "unlimited";

export const BASE_ALLOCATION = 100;
export const CARRY_OVER_PCT = 0.5;
export const REPUTATION_THRESHOLDS = {
	contributor: 0.2,
	power: 0.5,
	unlimited: 0.8,
} as const;

export interface CreditAccount {
	peerId: string;
	tier: CreditTier;
	monthlyRewards: number;
	baseAllocation: number;
	carryOverPct: number;
	balance: number;
	reputation: number;
}

export function tierForReputation(reputation: number): CreditTier {
	if (!Number.isFinite(reputation)) {
		throw new Error(`credit-account: reputation must be finite (got ${reputation})`);
	}
	if (reputation < 0 || reputation > 1) {
		throw new Error(`credit-account: reputation must be in [0, 1] (got ${reputation})`);
	}
	if (reputation < REPUTATION_THRESHOLDS.contributor) return "free";
	if (reputation < REPUTATION_THRESHOLDS.power) return "contributor";
	if (reputation < REPUTATION_THRESHOLDS.unlimited) return "power";
	return "unlimited";
}

export function monthlyCreditFor(account: CreditAccount): number {
	return account.baseAllocation + Math.floor(account.reputation * account.monthlyRewards);
}

export function applyCarryOver(
	prevBalance: number,
	baseAllocation: number = BASE_ALLOCATION,
): number {
	if (!Number.isFinite(prevBalance) || prevBalance < 0) {
		throw new Error(`credit-account: prevBalance must be non-negative finite (got ${prevBalance})`);
	}
	return Math.floor(prevBalance * CARRY_OVER_PCT) + baseAllocation;
}

export class CreditAccountBook {
	private accounts = new Map<string, CreditAccount>();

	upsert(peerId: string, reputation: number, monthlyRewards = 0): CreditAccount {
		const account: CreditAccount = {
			peerId,
			tier: tierForReputation(reputation),
			monthlyRewards,
			baseAllocation: BASE_ALLOCATION,
			carryOverPct: CARRY_OVER_PCT,
			balance: 0,
			reputation,
		};
		this.accounts.set(peerId, account);
		return account;
	}

	get(peerId: string): CreditAccount | undefined {
		return this.accounts.get(peerId);
	}

	tierOf(peerId: string): CreditTier | undefined {
		return this.accounts.get(peerId)?.tier;
	}

	all(): CreditAccount[] {
		return Array.from(this.accounts.values());
	}

	size(): number {
		return this.accounts.size;
	}

	remove(peerId: string): boolean {
		return this.accounts.delete(peerId);
	}
}
