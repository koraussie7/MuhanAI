import { useMemo } from "react";
import { useGossipPulse, type PulseConnectionStatus } from "./useGossipPulse.js";
import { getMeshStats, type MeshStats } from "../lib/mesh-stats.js";

export interface UseMeshPulseResult {
	stats: MeshStats;
	status: PulseConnectionStatus;
}

/**
 * Mesh-wide counters for the sidebar footer.
 *
 * Sidebar imported this hook before it existed, so the module never resolved
 * and `apps/web` did not typecheck. The live source is the SSE pulse stream
 * (`/api/pulse/stream`, see ADR-0004), the same stream NetworkPulse.tsx
 * already consumes -- this hook only narrows it to the presence fan-out and
 * hands the count to `getMeshStats` so demo gating stays in one place.
 *
 * Distinct peers are counted from `fromPeerId`, because presence messages
 * carry no roster field. With no stream (SSR, unsupported EventSource, or an
 * empty buffer) the counts stay `undefined` and mesh-stats renders its
 * em-dash placeholder rather than a fabricated number.
 */
export function useMeshPulse(): UseMeshPulseResult {
	const { messages, status } = useGossipPulse({ kinds: ["presence"] });

	const stats = useMemo(() => {
		const peers = new Set<string>();
		for (const msg of messages) {
			if (typeof msg.fromPeerId === "string" && msg.fromPeerId.length > 0) {
				peers.add(msg.fromPeerId);
			}
		}
		return getMeshStats({ agentsOnline: peers.size > 0 ? peers.size : undefined });
	}, [messages]);

	return { stats, status };
}
