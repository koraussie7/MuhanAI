/**
 * AGENTMESH_HEARTBEAT service.
 *
 * Periodically emits a SignedPulse envelope describing the local
 * character's liveness + tags to the MuhanAI gossip layer. One service
 * per character keeps the heartbeat tied to the runtime's natural
 * lifecycle, so the pulse stops cleanly when elizaOS shuts the
 * character down.
 */

import type { IAgentRuntime } from "@elizaos/core";
import { Service } from "@elizaos/core";
import { getClient } from "../runtime.js";

export const HEARTBEAT_DEFAULT_INTERVAL_MS = 30_000;

export interface HeartbeatConfig {
	intervalMs?: number;
	tags?: string[];
}

export class AgentMeshHeartbeatService extends Service {
	static override serviceType = "AGENTMESH_HEARTBEAT";

	private timer: ReturnType<typeof setInterval> | null = null;
	private intervalMs: number;
	private tags: string[];
	private nonce = 0;
	private runtime: IAgentRuntime | null = null;

	constructor(runtime: IAgentRuntime, config?: Record<string, unknown>) {
		super();
		this.runtime = runtime;
		this.intervalMs =
			typeof config?.intervalMs === "number" ? config.intervalMs : HEARTBEAT_DEFAULT_INTERVAL_MS;
		this.tags = Array.isArray(config?.tags)
			? (config.tags as unknown[]).filter((t): t is string => typeof t === "string")
			: [];
	}

	override async initialize(
		_runtime: IAgentRuntime,
		_config?: Record<string, unknown>,
	): Promise<void> {
		this.timer = setInterval(() => {
			void this.tick().catch(() => {
				/* swallow — heartbeat errors should not crash elizaOS */
			});
		}, this.intervalMs);
		this.timer.unref?.();
	}

	override async stop(): Promise<void> {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
		this.runtime = null;
	}

	private async tick(): Promise<void> {
		if (!this.runtime) return;
		try {
			const { client, peerId } = getClient(this.runtime);
			await client.broadcastHeartbeat({
				v: 1,
				peerId,
				nonce: ++this.nonce,
				ts: Date.now(),
				characterName: this.runtime.character.name,
				tags: this.tags,
			});
		} catch {
			/* dropped — next tick will retry */
		}
	}
}
