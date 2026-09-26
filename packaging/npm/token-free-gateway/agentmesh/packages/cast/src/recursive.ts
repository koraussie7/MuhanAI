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

import type { AgentExecutor } from "@agentmesh/agent";
import type { AgentRequest, AgentResult } from "@agentmesh/core";
import { fanOut } from "./fanout.js";

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
	| { ok: false; reason: "depth_exceeded" | "budget_exceeded" | "cycle_detected" | "no_agent_available"; agentIds: string[] };

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

export class RecursiveCast {
	private budgetUsed = 0;

	constructor(
		private readonly executor: AgentExecutor,
		private readonly peerRouter?: PeerRouter,
	) { }

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
			if (remote) return { ok: true, result: remote, depth };
			// fall through to local fan-out
		}

		// Local fan-out: pick any agent in the registry that hasn't been
		// used in this request's ancestry and that matches the caller's
		// `requiredCapabilities` hint.
		const candidates = this.selectCandidates(
			input.request,
			input.excludeAgentIds,
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
		return { ok: true, result: winner, depth };
	}

	private selectCandidates(
		request: AgentRequest,
		excludeAgentIds: string[],
		requiredCapability?: string,
	): string[] {
		const registry = this.executor["registry"] as unknown as
			| { list(): Array<{ id: string; capabilities?: string[] }> }
			| undefined;
		if (!registry) return [];

		const all = registry.list();
		const excluded = new Set([...excludeAgentIds, request.id]);
		const required = request.requiredCapabilities ?? (requiredCapability ? [requiredCapability] : []);
		return all
			.filter((agent) => !excluded.has(agent.id))
			.filter((agent) =>
				required.length === 0 ||
				required.every((cap) => agent.capabilities?.includes(cap) ?? false),
			)
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
