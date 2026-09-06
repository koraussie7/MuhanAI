import type { ContributionEvent } from "@agentmesh/core";

/**
 * Persistent, append-only credit ledger for a single actor.
 *
 * Used by services/api to expose `/api/credits/balance` for the
 * Welcome Credits first-impression banner + sidebar live balance chip.
 */
export interface TokenLedger {
  /** Record a contribution event, updating the actor's running balance. */
  record(event: ContributionEvent): Promise<void>;
  /** Current balance for an actor. New actors receive the welcome grant. */
  balance(actorId: string): Promise<number>;
}

/**
 * Welcome credits granted to first-time members.
 * BigInt-backed to avoid floating-point drift on large token grants.
 */
export const WELCOME_CREDITS = 1_000_000n;

/**
 * In-memory token ledger. Singleton instance shared across the API server
 * for the lifetime of the process. Persists across requests; resets on restart.
 *
 * Suitable for Phase 1 wire-up. Replace with a Postgres-backed implementation
 * when multi-instance deploys land (see ADR-001).
 */
export class InMemoryTokenLedger implements TokenLedger {
  private readonly balances = new Map<string, bigint>();

  async record(event: ContributionEvent): Promise<void> {
    const current = this.balances.get(event.actorId) ?? WELCOME_CREDITS;
    const delta = BigInt(Math.round(event.reward * event.quality));
    this.balances.set(event.actorId, current + delta);
  }

  async balance(actorId: string): Promise<number> {
    const value = this.balances.get(actorId) ?? WELCOME_CREDITS;
    // BigInt → string to avoid Number precision loss on values > 2^53.
    return Number(value.toString());
  }
}

/** Process-wide ledger singleton. */
export const ledger = new InMemoryTokenLedger();
