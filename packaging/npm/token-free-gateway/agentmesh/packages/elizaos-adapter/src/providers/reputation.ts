/**
 * AGENTMESH_REPUTATION provider.
 *
 * Injects a short, structured snippet of the local character's peer
 * reputation into every elizaOS `state` so the model can reason about
 * its own trust posture when deciding whether to accept a Cast task or
 * sign a credit transfer. Cached for `cacheMs` to keep RPC traffic at
 * one call per ~30s even with high message volume.
 */
import type { Provider } from "@elizaos/core";
import { AgentMeshRpcError } from "../rpc.js";
import { getClient } from "../runtime.js";
import type { ReputationSnapshot } from "../types.js";

export const REPUTATION_CACHE_DEFAULT_MS = 30_000;

export interface ReputationProviderConfig {
	cacheMs?: number;
}

interface CachedSnapshot {
	snapshot: ReputationSnapshot;
	expiresAt: number;
}

export function createReputationProvider(config: ReputationProviderConfig = {}): Provider {
	const cacheMs = config.cacheMs ?? REPUTATION_CACHE_DEFAULT_MS;
	const cache = new Map<string, CachedSnapshot>();

	return {
		name: "AGENTMESH_REPUTATION",
		description:
			"Injects the local character's peer reputation (score, variance, signals) from the MuhanAI mesh.",
		async get(runtime, _message, _state) {
			try {
				const { client, peerId } = getClient(runtime);
				const now = Date.now();
				const hit = cache.get(peerId);
				if (hit && hit.expiresAt > now) {
					return renderReputation(hit.snapshot, "cached");
				}
				const snapshot = await client.getReputation(peerId);
				cache.set(peerId, { snapshot, expiresAt: now + cacheMs });
				return renderReputation(snapshot, "fresh");
			} catch (e) {
				const reason = e instanceof AgentMeshRpcError ? `${e.code}: ${e.message}` : String(e);
				return {
					text: `[agentmesh] reputation unavailable (${reason}). Proceed with low-confidence defaults.`,
					values: { agentmesh_reputation_error: reason },
					data: { source: "error" },
				};
			}
		},
	};
}

function renderReputation(
	s: ReputationSnapshot,
	source: "fresh" | "cached",
): {
	text: string;
	values: Record<string, unknown>;
	data: Record<string, unknown>;
} {
	const text =
		`[agentmesh] peer ${s.peerId.slice(0, 10)}… reputation=${s.score.toFixed(3)} ` +
		`signals=${s.signals} variance=${s.variance.toFixed(4)} (${source})`;
	return {
		text,
		values: {
			agentmesh_peer_id: s.peerId,
			agentmesh_reputation: s.score,
			agentmesh_signals: s.signals,
			agentmesh_variance: s.variance,
		},
		data: { source, asOf: s.asOf },
	};
}
