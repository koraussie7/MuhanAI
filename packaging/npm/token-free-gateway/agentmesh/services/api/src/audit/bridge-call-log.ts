/**
 * Append-only audit sink for OpsMaxx MCP bridge calls (track T3-B).
 *
 * Every recognized tool call — T3-A's read surface and T3-B's write
 * surface alike — emits exactly one `bridge_call` event per attempt,
 * including denials (`verdict: "denied"`) and bridge errors
 * (`verdict: "error"`), so a model decision can be reconstructed after
 * the fact (see "Threat model" in docs/agentmesh/OPSMAXX-INTEGRATION.md).
 *
 * ## Why the log records `argsHash`, never the raw args
 *
 * `opsmaxx_vault_set` and `opsmaxx_ssh_exec` take user-supplied
 * arguments that routinely contain secrets (vault secret values, shell
 * commands with inline credentials, SQL literals). Persisting raw args
 * would turn the audit log into a second copy of every credential the
 * vault already protects — anyone who can read the log reads the
 * secrets. We therefore log only a SHA-256 hash of the canonical JSON
 * args:
 *
 *   - stable: two identical calls share an `argsHash`, so repeat use of
 *     the same approval can be correlated after the fact;
 *   - one-way: the log cannot leak `secret`/`cmd` contents;
 *   - it is exactly the key the approval gate uses —
 *     `(capability, argsHash)` mirrors
 *     `bridge.security.isApprovedByUser(capability, args)`.
 *
 * The sink is pluggable (`setBridgeCallSink`) so tests can silence it
 * and the dashboard can swap the default pino line for a durable store
 * without touching call sites. `getRecentBridgeCalls` serves the audit
 * page over a bounded in-memory ring; long-term retention is a sink
 * concern, not this module's.
 */

import { createHash } from "node:crypto";
import type { RiskClass } from "@agentmesh/opsmaxx-bridge";
import { getLogger } from "@agentmesh/shared-types";

export type BridgeCallVerdict = "ok" | "denied" | "error";

export interface BridgeCallEvent {
	/** ISO-8601 timestamp of the attempt. */
	ts: string;
	/** MCP tool name, e.g. `opsmaxx_db_write`. */
	capability: string;
	/** SHA-256 of the canonical JSON request args — never the raw args. */
	argsHash: string;
	risk: RiskClass;
	verdict: BridgeCallVerdict;
	durationMs: number;
	/** Custom JSON-RPC code (4001..4004) or the `BridgeErrorCode`. */
	errorCode?: number | string;
	/** Optional owner id when the caller resolved one (HMAC `sub`). */
	userId?: string;
}

export type BridgeCallSink = (event: BridgeCallEvent) => void;

const MAX_RETAINED_EVENTS = 1000;
const retained: BridgeCallEvent[] = [];

let sink: BridgeCallSink = (event) => {
	getLogger().info(event, "bridge_call");
};

/**
 * Swap the sink and return the previous one. Tests use this to silence
 * the default pino line; a dashboard build can install a durable store.
 */
export function setBridgeCallSink(next: BridgeCallSink): BridgeCallSink {
	const previous = sink;
	sink = next;
	return previous;
}

/** SHA-256 over `JSON.stringify(args ?? null)` — the audit/approval key. */
export function hashArgs(args: unknown): string {
	return createHash("sha256")
		.update(JSON.stringify(args ?? null))
		.digest("hex");
}

/** Append one event. Callers must emit exactly once per call attempt. */
export function recordBridgeCall(event: BridgeCallEvent): void {
	retained.push(event);
	if (retained.length > MAX_RETAINED_EVENTS) retained.shift();
	sink(event);
}

/**
 * Newest-first read for the dashboard audit page. Bounded by the
 * in-memory ring; swap the sink for durable storage beyond that.
 */
export async function getRecentBridgeCalls(
	opts: { userId?: string; limit?: number } = {},
): Promise<BridgeCallEvent[]> {
	const limit = Math.max(0, Math.min(opts.limit ?? 50, MAX_RETAINED_EVENTS));
	const filtered = opts.userId
		? retained.filter((event) => event.userId === opts.userId)
		: retained;
	return filtered.slice(Math.max(0, filtered.length - limit)).reverse();
}

/** Test helper: drop retained events (the sink itself is fire-and-forget). */
export function clearBridgeCalls(): void {
	retained.length = 0;
}
