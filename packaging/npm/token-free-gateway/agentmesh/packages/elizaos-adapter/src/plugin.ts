/**
 * Top-level elizaOS plugin assembly.
 *
 * Consumers add this to a character's `plugins` array:
 *
 *   {
 *     "name": "trader-bot",
 *     "plugins": ["@agentmesh/elizaos-adapter", ...],
 *     "settings": {
 *       "AGENTMESH_RPC_URL": "https://mesh.example/api",
 *       "AGENTMESH_PEER_ID": "<64-char hex>",
 *       "AGENTMESH_TOKEN": "<bearer>"
 *     }
 *   }
 */
import type { Plugin } from "@elizaos/core";
import { AGENTMESH_CAST_TASK } from "./actions/cast-task.js";
import { AGENTMESH_EARN_CREDITS } from "./actions/earn-credits.js";
import { createReputationProvider } from "./providers/reputation.js";
import { AgentMeshHeartbeatService } from "./services/heartbeat.js";

export const agentMeshPlugin: Plugin = {
	name: "@agentmesh/elizaos-adapter",
	description:
		"Bridge this character into the MuhanAI AgentMesh mesh — Cast / Reputation / Credits / Pulse gossip.",
	providers: [createReputationProvider()],
	actions: [AGENTMESH_CAST_TASK, AGENTMESH_EARN_CREDITS],
	services: [AgentMeshHeartbeatService],
};
