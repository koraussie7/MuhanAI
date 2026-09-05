/**
 * @agentmesh/token-bank — Token Bank & Credit Ledger (Agent 2)
 *
 * Token economy for the Agent Mesh:
 * - TokenBank: mint, transfer, stake, slash, reward, burn
 * - CreditLedger interface implementation
 * - In-memory with full audit trail
 */
export {
  TokenBank,
  createTokenBank,
  DEFAULT_REWARD_POLICY,
  type RewardPolicy,
  type LedgerEntry,
} from "./types.js";

export type { ContributionEvent } from "@agentmesh/core";
export type { TokenBalance, CreditLedger } from "@agentmesh/core";