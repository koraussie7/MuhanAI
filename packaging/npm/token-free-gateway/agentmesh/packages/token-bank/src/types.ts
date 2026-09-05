/**
 * @agentmesh/token-bank — Token Bank & Credit Ledger (Agent 2)
 *
 * Implements the token economy for the Agent Mesh:
 * - Contribution tracking & token minting
 * - Credit ledger with balances, transfers, stakes
 * - Reward distribution & slashing
 * - In-memory implementation (swap for DB in production)
 */
import type {
  ContributionEvent,
  ContributionType,
  TokenBalance,
  CreditLedger,
} from "@agentmesh/core";

/** Default reward rates per contribution type (tokens per unit). */
export type RewardPolicy = Record<string, number>;
export const DEFAULT_REWARD_POLICY: RewardPolicy = {
  compute: 10,
  storage: 5,
  bandwidth: 2,
  model_inference: 15,
  data_labeling: 8,
  code_review: 12,
  testing: 6,
  documentation: 4,
  governance: 20,
  human_feedback: 25,
};

/** In-memory ledger entry. */
export interface LedgerEntry {
  id: string;
  actorId: string;
  type: "mint" | "transfer" | "stake" | "slash" | "reward" | "burn";
  amount: number;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/** Token Bank implementation. */
export class TokenBank {
  private readonly balances = new Map<string, TokenBalance>();
  private readonly ledger: LedgerEntry[] = [];
  private readonly rewardPolicy: RewardPolicy;
  private readonly mintedTotal = { value: 0 };

  constructor(rewardPolicy: RewardPolicy = DEFAULT_REWARD_POLICY) {
    this.rewardPolicy = rewardPolicy;
  }

  // ── CreditLedger interface ──────────────────────────────────────

  async balance(actorId: string): Promise<TokenBalance> {
    return (
      this.balances.get(actorId) ?? {
        actorId,
        available: 0,
        staked: 0,
        pendingRewards: 0,
        lifetimeEarned: 0,
        lifetimeSpent: 0,
      }
    );
  }

  async transfer(
    from: string,
    to: string,
    amount: number,
    memo?: string,
  ): Promise<boolean> {
    if (amount <= 0) return false;
    const fromBal = await this.balance(from);
    if (fromBal.available < amount) return false;

    this.adjustAvailable(from, -amount);
    this.adjustAvailable(to, amount);
    this.recordEntry({
      actorId: from,
      type: "transfer",
      amount: -amount,
      metadata: { to, memo },
    });
    this.recordEntry({
      actorId: to,
      type: "transfer",
      amount,
      metadata: { from, memo },
    });
    return true;
  }

  async stake(actorId: string, amount: number): Promise<boolean> {
    if (amount <= 0) return false;
    const bal = await this.balance(actorId);
    if (bal.available < amount) return false;

    this.adjustAvailable(actorId, -amount);
    this.adjustStaked(actorId, amount);
    this.recordEntry({ actorId, type: "stake", amount });
    return true;
  }

  async unstake(actorId: string, amount: number): Promise<boolean> {
    if (amount <= 0) return false;
    const bal = await this.balance(actorId);
    if (bal.staked < amount) return false;

    this.adjustStaked(actorId, -amount);
    this.adjustAvailable(actorId, amount);
    this.recordEntry({ actorId, type: "stake", amount: -amount });
    return true;
  }

  async slash(actorId: string, amount: number, reason: string): Promise<boolean> {
    if (amount <= 0) return false;
    const bal = await this.balance(actorId);
    const total = bal.available + bal.staked;
    if (total < amount) return false;

    // Slash from available first, then staked
    let remaining = amount;
    if (bal.available > 0) {
      const fromAvail = Math.min(bal.available, remaining);
      this.adjustAvailable(actorId, -fromAvail);
      remaining -= fromAvail;
    }
    if (remaining > 0) {
      this.adjustStaked(actorId, -remaining);
    }
    this.recordEntry({
      actorId,
      type: "slash",
      amount: -amount,
      metadata: { reason },
    });
    return true;
  }

  // ── TokenBank specific ──────────────────────────────────────────

  /** Record a contribution event and mint tokens accordingly. */
  async recordContribution(event: ContributionEvent): Promise<number> {
    const rate = this.rewardPolicy[event.type] ?? 0;
    const quantity = event.quantity ?? 1;
    const tokens = quantity * rate;
    if (tokens <= 0) return 0;

    const bal = await this.balance(event.actorId);
    this.adjustAvailable(event.actorId, tokens);
    this.adjustLifetimeEarned(event.actorId, tokens);
    this.mintedTotal.value += tokens;

    this.recordEntry({
      actorId: event.actorId,
      type: "mint",
      amount: tokens,
      metadata: { contributionType: event.type, quantity: event.quantity, evidenceRef: event.evidenceRef },
    });

    return tokens;
  }

  /** Distribute rewards to an actor (e.g., from protocol fees). */
  async reward(actorId: string, amount: number, source: string): Promise<void> {
    if (amount <= 0) return;
    this.adjustPendingRewards(actorId, amount);
    this.recordEntry({
      actorId,
      type: "reward",
      amount,
      metadata: { source },
    });
  }

  /** Claim pending rewards to available balance. */
  async claimRewards(actorId: string): Promise<number> {
    const bal = await this.balance(actorId);
    const claimed = bal.pendingRewards;
    if (claimed <= 0) return 0;

    this.adjustPendingRewards(actorId, -claimed);
    this.adjustAvailable(actorId, claimed);
    this.recordEntry({ actorId, type: "reward", amount: claimed, metadata: { action: "claim" } });
    return claimed;
  }

  /** Burn tokens (reduce supply). */
  async burn(actorId: string, amount: number): Promise<boolean> {
    if (amount <= 0) return false;
    const bal = await this.balance(actorId);
    if (bal.available < amount) return false;

    this.adjustAvailable(actorId, -amount);
    this.adjustLifetimeSpent(actorId, amount);
    this.mintedTotal.value -= amount;
    this.recordEntry({ actorId, type: "burn", amount: -amount });
    return true;
  }

  /** Total tokens minted since genesis. */
  get totalMinted(): number {
    return this.mintedTotal.value;
  }

  /** Get full ledger history for an actor. */
  getHistory(actorId: string): LedgerEntry[] {
    return this.ledger.filter((e) => e.actorId === actorId);
  }

  /** Get all ledger entries (for auditing). */
  getAllEntries(): LedgerEntry[] {
    return [...this.ledger];
  }

  // ── Internal helpers ────────────────────────────────────────────

  private adjustAvailable(actorId: string, delta: number): void {
    const bal = this.balances.get(actorId) ?? {
      actorId,
      available: 0,
      staked: 0,
      pendingRewards: 0,
      lifetimeEarned: 0,
      lifetimeSpent: 0,
    };
    bal.available = Math.max(0, bal.available + delta);
    this.balances.set(actorId, bal);
  }

  private adjustStaked(actorId: string, delta: number): void {
    const bal = this.balances.get(actorId) ?? {
      actorId,
      available: 0,
      staked: 0,
      pendingRewards: 0,
      lifetimeEarned: 0,
      lifetimeSpent: 0,
    };
    bal.staked = Math.max(0, bal.staked + delta);
    this.balances.set(actorId, bal);
  }

  private adjustPendingRewards(actorId: string, delta: number): void {
    const bal = this.balances.get(actorId) ?? {
      actorId,
      available: 0,
      staked: 0,
      pendingRewards: 0,
      lifetimeEarned: 0,
      lifetimeSpent: 0,
    };
    bal.pendingRewards = Math.max(0, bal.pendingRewards + delta);
    this.balances.set(actorId, bal);
  }

  private adjustLifetimeEarned(actorId: string, delta: number): void {
    const bal = this.balances.get(actorId) ?? {
      actorId,
      available: 0,
      staked: 0,
      pendingRewards: 0,
      lifetimeEarned: 0,
      lifetimeSpent: 0,
    };
    bal.lifetimeEarned += delta;
    this.balances.set(actorId, bal);
  }

  private adjustLifetimeSpent(actorId: string, delta: number): void {
    const bal = this.balances.get(actorId) ?? {
      actorId,
      available: 0,
      staked: 0,
      pendingRewards: 0,
      lifetimeEarned: 0,
      lifetimeSpent: 0,
    };
    bal.lifetimeSpent += delta;
    this.balances.set(actorId, bal);
  }

  private recordEntry(entry: Omit<LedgerEntry, "id" | "timestamp">): void {
    this.ledger.push({
      ...entry,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    });
  }
}

/** Factory for creating a TokenBank with custom policy. */
export function createTokenBank(policy?: Partial<Record<string, number>>): TokenBank {
  return new TokenBank({ ...DEFAULT_REWARD_POLICY, ...policy } as RewardPolicy);
}