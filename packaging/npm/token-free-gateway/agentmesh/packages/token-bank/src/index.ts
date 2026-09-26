/**
 * @agentmesh/token-bank — Token Bank & Credit Ledger (Agent 2)
 *
 * Token economy for the Agent Mesh:
 * - TokenBank: mint, transfer, stake, slash, reward, burn
 * - CreditLedger interface implementation
 * - In-memory with full audit trail
 */

export type { ContributionEvent, CreditLedger, TokenBalance } from "@agentmesh/core";
export {
	createTokenBank,
	DEFAULT_REWARD_POLICY,
	type LedgerEntry,
	type RewardPolicy,
	TokenBank,
} from "./types.js";
