/**
 * Byzantine behavior detector.
 *
 * The simplest cryptographic proof of misbehavior in BFT is *equivocation*:
 * the same participant signed two distinct proposals for the same
 * (view, seq). Once two such proposals are observed, every honest node
 * can independently prove the proposer is faulty.
 *
 * This module also tracks timeout-driven failures: a participant that
 * never votes within a phase deadline is treated as silent-Byzantine.
 */

import type { SignedProposal } from "./proposal.js";
import { proposalKey, valueKey } from "./proposal.js";

export type ByzantineReason =
	| { kind: "equivocation"; agentId: string; evidence: [SignedProposal, SignedProposal] }
	| { kind: "timeout"; agentId: string; phase: "prepare" | "commit" };

export interface ByzantineReport {
	reasons: ByzantineReason[];
	/** Agent IDs that have been proven Byzantine — a set for O(1) lookup. */
	agents: Set<string>;
}

export class ByzantineDetector {
	private readonly seenByKey = new Map<string, SignedProposal>(); // proposalKey → proposal
	private readonly reasons: ByzantineReason[] = [];
	private readonly agents = new Set<string>();

	/** Record a proposal. If equivocation is detected, append a reason and return true. */
	observe(proposal: SignedProposal): boolean {
		const key = proposalKey(proposal);
		const prior = this.seenByKey.get(key);
		if (!prior) {
			this.seenByKey.set(key, proposal);
			return false;
		}
		// Same (view, seq, proposerId) — distinct payloads prove equivocation.
		if (prior.payloadHash !== proposal.payloadHash) {
			const reason: ByzantineReason = {
				kind: "equivocation",
				agentId: proposal.proposerId,
				evidence: [prior, proposal],
			};
			this.reasons.push(reason);
			this.agents.add(proposal.proposerId);
			return true;
		}
		// Identical re-broadcast — ignore.
		return false;
	}

	/** Mark an agent as having timed out in a phase. Idempotent per (agent, phase). */
	reportTimeout(agentId: string, phase: "prepare" | "commit"): void {
		const already = this.reasons.some(
			(r) => r.kind === "timeout" && r.agentId === agentId && r.phase === phase,
		);
		if (already) return;
		this.reasons.push({ kind: "timeout", agentId, phase });
		this.agents.add(agentId);
	}

	report(): ByzantineReport {
		return { reasons: [...this.reasons], agents: new Set(this.agents) };
	}

	hasEvidenceAgainst(agentId: string): boolean {
		return this.agents.has(agentId);
	}
}

/** Tally distinct voter IDs per (view, seq, payloadHash). */
export class VoteTally {
	private readonly votes = new Map<string, Set<string>>(); // valueKey → voters

	add(proposal: SignedProposal, voterId: string): void {
		const k = valueKey(proposal);
		let bucket = this.votes.get(k);
		if (!bucket) {
			bucket = new Set();
			this.votes.set(k, bucket);
		}
		bucket.add(voterId);
	}

	/** Returns the (payloadHash, voter count) pair with the most votes, or null. */
	leader(): { payloadHash: string; votes: number; voters: Set<string> } | null {
		let best: { payloadHash: string; votes: number; voters: Set<string> } | null = null;
		for (const [key, voters] of this.votes) {
			const payloadHash = key.split(":").slice(2).join(":");
			const v = voters.size;
			if (!best || v > best.votes) best = { payloadHash, votes: v, voters };
		}
		return best;
	}

	count(proposal: SignedProposal): number {
		return this.votes.get(valueKey(proposal))?.size ?? 0;
	}
}
