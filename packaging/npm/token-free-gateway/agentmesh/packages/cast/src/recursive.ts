/**
 * Recursive agent delegation (Phase C1).
 *
 * One agent's `execute()` can call back into the cast via
 * `RecursiveCast.delegate()`. The agent that calls `delegate()` is
 * asking: "use any other agent in the registry that fits this skill /
 * requiredCapabilities, and tell me what they answered". The cast then
 * either:
 *
 *   - picks another local agent and forwards the call (depth 1+), or
 *   - if `peerRouter` is provided, can also resolve the requested
 *     capability against a remote peer (this is the Phase B3 wire-up;
 *     for now we only project local agents and surface "no peer"
 *     gracefully).
 *
 * Safety:
 *   - `maxDepth` (default 3) caps how deep the chain can go.
 *   - `ancestorIds` are tracked per-request: a request that revisits an
 *     agent id from its own ancestry is rejected as a cycle.
 *   - `budget` is a coarse token-equivalent cost cap; the caller decides
 *     what counts as one unit. Calls that would exceed it return
 *     `{ ok: false, reason: "budget_exceeded" }` rather than throwing.
 */

import type { AgentExecutor, AgentRegistry } from "@agentmesh/agent";
import type { AgentRequest, AgentResult } from "@agentmesh/core";
import { fanOut } from "./fanout.js";
import {
	type CallReceipt,
	canonicalReceiptBytes,
	canonicalReceiptId,
	ReceiptLedger,
	type ReceiptSigner,
} from "./receipt.js";

export interface RecursiveDelegateInput {
	request: AgentRequest;
	/** Agents that may NOT be chosen (the caller itself + ancestors). */
	excludeAgentIds: string[];
	/** Hint: a capability or skill. Currently unused at this layer — kept
	 *  for the Phase B3 wire-up where peer-routing will resolve the
	 *  capability to a remote agent. */
	requiredCapability?: string;
	/** Max recursion depth including this call. 0 means "leaf only". */
	maxDepth?: number;
	/** Total units available; each `delegate()` counts as one unit. */
	budget?: number;
}

export type RecursiveDelegateResult =
	| { ok: true; result: AgentResult; depth: number }
	| {
			ok: false;
			reason: "depth_exceeded" | "budget_exceeded" | "cycle_detected" | "no_agent_available";
			agentIds: string[];
	  };

const DEFAULT_MAX_DEPTH = 3;

/**
 * A pluggable hook that lets the caller route a delegate call to a
 * remote peer (Phase B3) instead of a local agent. Returning `null` means
 * "no peer available for this capability" and the cast falls back to
 * selecting a local agent.
 */
export type PeerRouter = (input: {
	request: AgentRequest;
	requiredCapability?: string;
	depth: number;
}) => Promise<AgentResult | null> | AgentResult | null;

export interface RecursiveCastOptions {
	/** Append-only ledger that records a receipt per delegate hop. */
	receiptLedger?: ReceiptLedger;
	/** Local signer; if absent, the caller signature is left empty and
	 *  the receipt is rejected by `verifyReceiptStructure`. */
	signer?: ReceiptSigner;
	/** Peer id of the local node (used as `calleePeerId` for hops that
	 *  originate locally). */
	localPeerId?: string;
}

/**
 * Hook the cast calls to obtain the peer id of the delegated agent.
 * Without it, the ledger records receipts with `calleePeerId = "local"`,
 * which is still useful for in-process debugging but won't settle against
 * remote peer-mesh keys.
 */
export type ResolvePeerId = (agentId: string) => string | undefined;

export class RecursiveCast {
	private budgetUsed = 0;
	private readonly ledger: ReceiptLedger;
	private readonly signer?: ReceiptSigner;
	private readonly localPeerId: string;

	constructor(
		private readonly executor: AgentExecutor,
		private readonly registry: AgentRegistry,
		private readonly peerRouter?: PeerRouter,
		private readonly resolvePeerId?: ResolvePeerId,
		options: RecursiveCastOptions = {},
	) {
		this.ledger = options.receiptLedger ?? new ReceiptLedger();
		this.signer = options.signer;
		this.localPeerId = options.localPeerId ?? "local";
	}

	/** Read-only view of the running budget consumption (for tests / dashboards). */
	get consumedBudget(): number {
		return this.budgetUsed;
	}

	async delegate(
		input: RecursiveDelegateInput,
		ancestorIds: string[] = [],
	): Promise<RecursiveDelegateResult> {
		const depth = ancestorIds.length + 1;
		const maxDepth = input.maxDepth ?? DEFAULT_MAX_DEPTH;
		if (depth > maxDepth) {
			return { ok: false, reason: "depth_exceeded", agentIds: ancestorIds };
		}

		const budget = input.budget ?? Number.POSITIVE_INFINITY;
		if (this.budgetUsed + 1 > budget) {
			return { ok: false, reason: "budget_exceeded", agentIds: ancestorIds };
		}

		// Peer-first: if a peer router can answer, use it.
		if (this.peerRouter && input.requiredCapability) {
			this.budgetUsed += 1;
			const remote = await this.peerRouter({
				request: input.request,
				requiredCapability: input.requiredCapability,
				depth,
			});
			if (remote) {
				this.recordReceipt({
					request: input.request,
					calleeAgentId: remote.agentId,
					result: remote,
					ancestorIds,
					parentReceiptId: this.lastReceiptIdFor(ancestorIds),
				});
				return { ok: true, result: remote, depth };
			}
			// fall through to local fan-out
		}

		// Local fan-out: pick any agent in the registry that hasn't been
		// used in this request's ancestry and that matches the caller's
		// `requiredCapabilities` hint.
		const candidates = this.selectCandidates(
			input.request,
			input.excludeAgentIds,
			ancestorIds,
			input.requiredCapability,
		);

		if (candidates.length === 0) {
			return { ok: false, reason: "no_agent_available", agentIds: ancestorIds };
		}

		// Cycle guard at the executor level — the candidate set already
		// excludes ancestry, but if a caller hand-rolled a request chain
		// we still want to fail loudly rather than spin.
		for (const id of candidates) {
			if (ancestorIds.includes(id)) {
				return { ok: false, reason: "cycle_detected", agentIds: ancestorIds };
			}
		}

		this.budgetUsed += 1;
		const results = await fanOut(this.executor, candidates, input.request);
		const winner = pickWinner(results);
		if (!winner) {
			return { ok: false, reason: "no_agent_available", agentIds: candidates };
		}
		this.recordReceipt({
			request: input.request,
			calleeAgentId: winner.agentId,
			result: winner,
			ancestorIds,
			parentReceiptId: this.lastReceiptIdFor(ancestorIds),
		});
		return { ok: true, result: winner, depth };
	}

	/** Accessor for tests / dashboards; the ledger is appended to in `delegate()`. */
	get receiptLedger(): ReceiptLedger {
		return this.ledger;
	}

	private recordReceipt(input: {
		request: AgentRequest;
		calleeAgentId: string;
		result: AgentResult;
		ancestorIds: string[];
		parentReceiptId?: string;
	}): void {
		// Caller peer: when a resolvePeerId is provided we map the latest
		// ancestor's agent id to a peer id; otherwise the ancestor's agent
		// id is used as the peer id directly so the receipt graph stays
		// connected end-to-end.
		const tailAncestor =
			input.ancestorIds.length === 0 ? undefined : input.ancestorIds[input.ancestorIds.length - 1];
		const callerPeerId =
			tailAncestor === undefined
				? this.localPeerId
				: (this.resolvePeerId?.(tailAncestor) ?? tailAncestor);
		// Callee peer: when resolvePeerId is provided we map the callee
		// agent id to a peer id. For local hops with no resolvePeerId the
		// peer id is the local peer itself. For non-local hops (an
		// ancestor already pinned a remote agent) the callee's agent id
		// doubles as the peer id so the graph stays connected.
		const calleePeerId =
			input.ancestorIds.length === 0
				? (this.resolvePeerId?.(input.calleeAgentId) ?? this.localPeerId)
				: (this.resolvePeerId?.(input.calleeAgentId) ?? input.calleeAgentId);
		const modelId = readModelId(input.result);

		const draft: CallReceipt = {
			id: "",
			callerPeerId,
			calleePeerId,
			calleeAgentId: input.calleeAgentId,
			parentReceiptId: input.parentReceiptId,
			modelId,
			promptTokens: 0,
			completionTokens: 0,
			latencyMs: input.result.latencyMs,
			timestamp: Date.now(),
			signatures: {},
		};

		if (this.signer) {
			const bytes = canonicalReceiptBytes(draft);
			draft.signatures.caller = this.signer.sign(bytes);
		}

		draft.id = canonicalReceiptId(draft);
		this.ledger.append(draft, {
			now: draft.timestamp,
			requestId: input.request.id,
		});
	}

	/**
	 * Look up the receipt id of the most recent hop whose `calleeAgentId`
	 * is the entry-point into the current ancestor chain. Used to wire
	 * `parentReceiptId` so that downstream verifiers can reconstruct the
	 * call tree.
	 *
	 * Note: this scans the whole ledger rather than filtering by
	 * `requestId`, because the parent receipt was recorded under the
	 * parent agent's own request id (which the child doesn't know).
	 * Ledger scans are O(n) but bounded by `maxEntries`.
	 */
	private lastReceiptIdFor(ancestorIds: string[]): string | undefined {
		const tail = ancestorIds[ancestorIds.length - 1];
		if (!tail) return undefined;
		let latest: string | undefined;
		for (const entry of this.ledger.all()) {
			if (entry.receipt.calleeAgentId === tail) latest = entry.receipt.id;
		}
		return latest;
	}

	private selectCandidates(
		request: AgentRequest,
		excludeAgentIds: string[],
		ancestorIds: string[] = [],
		requiredCapability?: string,
	): string[] {
		const all = this.registry.all();
		const excluded = new Set([...excludeAgentIds, ...ancestorIds, request.id]);
		const required =
			request.requiredCapabilities ?? (requiredCapability ? [requiredCapability] : []);
		return all
			.filter((agent) => !excluded.has(agent.id))
			.filter((agent) => {
				if (required.length === 0) return true;
				const caps = agent.capabilities();
				return required.every((cap) => caps.includes(cap));
			})
			.map((agent) => agent.id);
	}
}

/**
 * Pick the highest-confidence non-error result. Returns `undefined` if
 * every result is an error.
 */
function pickWinner(results: AgentResult[]): AgentResult | undefined {
	let best: AgentResult | undefined;
	for (const r of results) {
		if (r.error) continue;
		if (!best || r.confidence > best.confidence) best = r;
	}
	return best;
}

function readModelId(result: AgentResult): string {
	const meta = result.metadata as { modelId?: unknown } | undefined;
	return typeof meta?.modelId === "string" ? meta.modelId : "unknown";
}
