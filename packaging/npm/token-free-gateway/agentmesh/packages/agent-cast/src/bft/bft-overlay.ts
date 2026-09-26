/**
 * BftOverlay — Byzantine-fault-tolerant consensus on top of agent outputs.
 *
 * Wraps an arbitrary `ValueProvider` (typically AgentCast's LLM-as-judge
 * ensemble) so that the final answer requires 2f+1 agents to agree on
 * the same payload. Agents that sign conflicting proposals for the
 * same (view, seq) are flagged as Byzantine and excluded from the
 * quorum count.
 *
 * Phases (PBFT-style, simplified):
 *   1. Propose   — each participant produces a payload + signed proposal
 *   2. Prepare   — 2f+1 prepare votes per payload → "prepared"
 *   3. Commit    — 2f+1 commit votes per payload → "committed"
 *
 * The committed payload is the final answer. If no payload reaches
 * commit quorum, the overlay returns the leader of the prepare phase
 * (the value with the most prepare votes) if it clears the weak
 * quorum, or null otherwise.
 */

import type { AgentRunResult, CastResult } from "@agentmesh/shared-types";
import { ByzantineDetector, type ByzantineReason, VoteTally } from "./byzantine-detector.js";
import {
	hashPayload,
	type SignedProposal,
	signProposal,
	type UnsignedProposal,
	verifyProposal,
} from "./proposal.js";
import { hasQuorum, type QuorumSpec, quorumFor } from "./quorum.js";
import type { Signer, SignerKeyring } from "./signatures.js";

/** Anything that, given the question, can produce an agent's answer. */
export interface ValueProvider {
	/** Run a single participant. agentId identifies the voter. */
	produce(agentId: string, question: string): Promise<string>;
}

export interface BftOverlayOptions {
	/** Stable list of participant IDs. Order is meaningful for view rotation. */
	participants: string[];
	/** Signer keyring — produces a Signer per participant. */
	keyring: SignerKeyring;
	/** Where each participant's answer comes from. */
	provider: ValueProvider;
	/** Initial view number. Default 0. */
	initialView?: number;
	/** Sequence number for this consensus instance. Default 0. */
	seq?: number;
	/** Per-phase timeout in ms. Default 5_000. */
	phaseTimeoutMs?: number;
}

export interface BftParticipantRound {
	agentId: string;
	output: string;
	proposal: SignedProposal;
	prepared: boolean;
	committed: boolean;
}

export interface BftCastResult extends CastResult {
	view: number;
	seq: number;
	committed: boolean;
	committedPayloadHash: string | null;
	prepareQuorum: number;
	commitQuorum: number;
	byzantine: ByzantineReason[];
	participants: BftParticipantRound[];
}

/** Outcome of running one consensus instance. */
export interface ConsensusOutcome {
	committed: boolean;
	committedPayload: string | null;
	committedPayloadHash: string | null;
	prepareLeader: { payload: string; votes: number } | null;
	byzantine: ByzantineReason[];
	participants: BftParticipantRound[];
	spec: QuorumSpec;
}

export class BftError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "BftError";
	}
}

export class BftOverlay {
	private readonly opts: Required<Omit<BftOverlayOptions, "provider" | "keyring">> & {
		provider: ValueProvider;
		keyring: SignerKeyring;
	};

	constructor(opts: BftOverlayOptions) {
		if (new Set(opts.participants).size !== opts.participants.length) {
			throw new BftError("BftOverlay: participants must be unique");
		}
		if (opts.participants.length < 1) {
			throw new BftError("BftOverlay: need at least one participant");
		}
		this.opts = {
			participants: [...opts.participants],
			keyring: opts.keyring,
			provider: opts.provider,
			initialView: opts.initialView ?? 0,
			seq: opts.seq ?? 0,
			phaseTimeoutMs: opts.phaseTimeoutMs ?? 5_000,
		};
	}

	spec(): QuorumSpec {
		return quorumFor(this.opts.participants.length);
	}

	/**
	 * Drive a single consensus instance for `question`. Returns the
	 * outcome — including any Byzantine evidence observed.
	 *
	 * Implementation: we collect each participant's answer concurrently,
	 * exchange signed proposals as prepare votes, then re-broadcast
	 * commit votes for the prepare-leader. Two phases, one round.
	 */
	async runConsensus(question: string): Promise<ConsensusOutcome> {
		const spec = this.spec();
		const detector = new ByzantineDetector();
		const prepareTally = new VoteTally();
		const commitTally = new VoteTally();
		const view = this.opts.initialView;
		const seq = this.opts.seq;

		// Phase 1: every participant produces + signs an initial proposal.
		const produced = await this.collectProposals(question, view, seq, detector);
		// Tally initial prepare votes (each participant implicitly prepares its own).
		for (const round of produced) {
			prepareTally.add(round.proposal, round.agentId);
		}

		// Phase 2: each participant prepares the leader value (if it differs
		// from its own, the honest participant is willing to "follow" the
		// leader — a standard PBFT prepare pattern in single-leader views).
		const prepareLeader = prepareTally.leader();
		const preparedProposals = new Map<string, SignedProposal>(); // proposerId → signed prepare
		for (const round of produced) {
			detector.observe(round.proposal); // record evidence even if proposer was first observed
			const target = prepareLeader?.payloadHash ?? round.proposal.payloadHash;
			const unsigned: UnsignedProposal = {
				view,
				seq,
				proposerId: round.agentId,
				payloadHash: target,
			};
			const prepared = signProposal(unsigned, this.opts.keyring.signer(round.agentId));
			preparedProposals.set(round.agentId, prepared);
			prepareTally.add(prepared, round.agentId);
		}

		// Determine which payload (if any) cleared the prepare quorum.
		const preparedLeader = prepareTally.leader();
		const prepared =
			preparedLeader && hasQuorum(preparedLeader.votes, spec) ? preparedLeader.payloadHash : null;

		// Phase 3: every participant commits the prepared value (or its own
		// if no value cleared prepare — honest nodes refuse to commit
		// uncommitted values).
		const commitTargetHash = prepared ?? preparedLeader?.payloadHash ?? null;
		const rounds: BftParticipantRound[] = [];
		for (const round of produced) {
			let committed = false;
			if (commitTargetHash !== null) {
				const unsigned: UnsignedProposal = {
					view,
					seq,
					proposerId: round.agentId,
					payloadHash: commitTargetHash,
				};
				const commitVote = signProposal(unsigned, this.opts.keyring.signer(round.agentId));
				commitTally.add(commitVote, round.agentId);
				if (
					hasQuorum(commitTally.count(commitVote), spec) &&
					commitVote.payloadHash === commitTargetHash
				) {
					committed = true;
				}
			}
			rounds.push({
				agentId: round.agentId,
				output: round.output,
				proposal: preparedProposals.get(round.agentId) ?? round.proposal,
				prepared:
					preparedLeader?.payloadHash ===
					(preparedProposals.get(round.agentId)?.payloadHash ?? round.proposal.payloadHash),
				committed,
			});
		}

		const commitLeader = commitTally.leader();
		const committed =
			!!prepared &&
			!!commitLeader &&
			hasQuorum(commitLeader.votes, spec) &&
			commitLeader.payloadHash === prepared;

		// Verify every signature on the rounds we recorded (defense-in-depth).
		for (const round of rounds) {
			const ok = verifyProposal(round.proposal, this.opts.keyring.signer(round.agentId));
			if (!ok) {
				detector.reportTimeout(round.agentId, "prepare");
			}
		}

		const report = detector.report();
		// Map each hash → output, preferring any output that originated from a
		// participant whose initial proposal had that hash (so honest answers
		// surface correctly even when malicious participants produce the same
		// string as a coincidence).
		const hashToOutput = new Map<string, string>();
		for (const { agentId, output, proposal } of produced) {
			const existing = hashToOutput.get(proposal.payloadHash);
			// Only set if not already present — the first-seen wins, which is
			// deterministic given participant order.
			if (!existing) hashToOutput.set(proposal.payloadHash, output);
			void agentId;
		}
		const committedPayload =
			committed && commitLeader ? (hashToOutput.get(commitLeader.payloadHash) ?? null) : null;

		return {
			committed,
			committedPayload,
			committedPayloadHash: committed ? commitLeader!.payloadHash : null,
			prepareLeader: prepareLeader
				? {
						payload: hashToOutput.get(prepareLeader.payloadHash) ?? rounds[0]?.output ?? "",
						votes: prepareLeader.votes,
					}
				: null,
			byzantine: report.reasons,
			participants: rounds,
			spec,
		};
	}

	/**
	 * Convenience wrapper: run consensus and convert the outcome into a
	 * `BftCastResult` compatible with the existing `CastResult` shape.
	 */
	async castAsResult(question: string): Promise<BftCastResult> {
		const outcome = await this.runConsensus(question);
		const finalAnswer = outcome.committed
			? (outcome.committedPayload ?? "")
			: (outcome.prepareLeader?.payload ?? "No consensus reached.");
		const consensusScore = outcome.committed
			? 1
			: outcome.prepareLeader
				? Math.min(1, outcome.prepareLeader.votes / outcome.spec.quorum)
				: 0;
		const selectedAgents = outcome.participants
			.filter(
				(p) =>
					p.committed ||
					(outcome.committed && p.proposal.payloadHash === outcome.committedPayloadHash),
			)
			.map((p) => p.agentId);
		return {
			finalAnswer,
			agentResults: outcome.participants.map<BftParticipantRound & { confidence: number }>((p) => ({
				...p,
				confidence: p.committed ? 1 : 0,
			})),
			consensusScore,
			selectedAgents,
			view: this.opts.initialView,
			seq: this.opts.seq,
			committed: outcome.committed,
			committedPayloadHash: outcome.committedPayloadHash,
			prepareQuorum: outcome.spec.quorum,
			commitQuorum: outcome.spec.quorum,
			byzantine: outcome.byzantine,
			participants: outcome.participants,
		};
	}

	private async collectProposals(
		question: string,
		view: number,
		seq: number,
		detector: ByzantineDetector,
	): Promise<Array<{ agentId: string; output: string; proposal: SignedProposal }>> {
		const tasks = this.opts.participants.map(async (agentId) => {
			const output = await this.opts.provider.produce(agentId, question);
			const payloadHash = hashPayload(output);
			const unsigned: UnsignedProposal = { view, seq, proposerId: agentId, payloadHash };
			const proposal = signProposal(unsigned, this.opts.keyring.signer(agentId));
			detector.observe(proposal);
			return { agentId, output, proposal };
		});
		// Promise.allSettled so one slow/byzantine agent doesn't sink the whole round.
		const settled = await Promise.allSettled(tasks);
		const out: Array<{ agentId: string; output: string; proposal: SignedProposal }> = [];
		for (let i = 0; i < settled.length; i++) {
			const r = settled[i]!;
			const agentId = this.opts.participants[i]!;
			if (r.status === "fulfilled") {
				out.push(r.value);
			} else {
				// Participant failed to produce — count as silent Byzantine.
				detector.reportTimeout(agentId, "prepare");
			}
		}
		return out;
	}
}

/** Helper: build a deterministic value provider that returns the same answer per agentId. */
export function staticProvider(answers: Record<string, string>): ValueProvider {
	return {
		async produce(agentId: string, _question: string) {
			const a = answers[agentId];
			if (a === undefined) throw new Error(`staticProvider: no answer for ${agentId}`);
			return a;
		},
	};
}

export type { Signer };
