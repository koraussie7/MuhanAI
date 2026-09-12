import type { CategoryContext, Skill } from "@agentmesh/shared-types";

/**
 * Bitterbot Worker configuration.
 *
 * The worker runs in two modes:
 *   - `p2p: null` → local-only mode. Skills/memory work against the local
 *     personal-mcp store; no libp2p node is created.
 *   - `p2p: {...}` → joins the AgentMesh P2P overlay (mDNS + optional
 *     bootstrap relays) so skills and memory can be advertised/replicated.
 */
export interface BitterbotWorkerConfig {
	/** Optional P2P overlay. Omit for local-only mode. */
	p2p?: {
		/** Path to the ed25519 identity file (created if missing). */
		identityPath: string;
		listen?: string[];
		bootstrapPeers?: string[];
		/** Discovery mechanisms; defaults to mDNS only. */
		discovery?: Array<"mdns" | "bootstrap">;
	};
}

export interface BitterbotStatus {
	started: boolean;
	mode: "local" | "p2p";
	peerId: string | null;
	multiaddrs: string[];
}

export interface RememberOptions {
	context?: CategoryContext;
	importance?: number;
	memoryType?: "episodic" | "semantic" | "fact";
}

export type { Skill };
