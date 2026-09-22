/**
 * @agentmesh/elizaos-adapter
 *
 * elizaOS plugin that bridges any character into the MuhanAI AgentMesh
 * network. Adds one provider (peer reputation context), two actions
 * (Cast dispatch + credit ledger entry), and one service (heartbeat /
 * pulse gossip).
 *
 * Quick start:
 *
 *   import { agentMeshPlugin } from "@agentmesh/elizaos-adapter";
 *
 *   const character = {
 *     name: "trader-bot",
 *     plugins: ["@agentmesh/elizaos-adapter"],
 *     settings: {
 *       AGENTMESH_RPC_URL: process.env.AGENTMESH_RPC_URL ?? "http://localhost:5174",
 *       AGENTMESH_PEER_ID: process.env.AGENTMESH_PEER_ID,
 *       AGENTMESH_TOKEN: process.env.AGENTMESH_TOKEN,
 *     },
 *   };
 *
 * The plugin is duck-typed against `@elizaos/core` >= 1.0; no
 * MuhanAI package is required at runtime.
 */

export { AGENTMESH_CAST_TASK } from "./actions/cast-task.js";
export { AGENTMESH_EARN_CREDITS } from "./actions/earn-credits.js";
export { agentMeshPlugin } from "./plugin.js";
export {
	createReputationProvider,
	REPUTATION_CACHE_DEFAULT_MS,
	type ReputationProviderConfig,
} from "./providers/reputation.js";
export { AgentMeshRpcError, createAgentMeshRpcClient } from "./rpc.js";
export {
	type ClientEntry,
	getClient,
	resolveRpcConfig,
	setClientForCharacter,
} from "./runtime.js";
export {
	AgentMeshHeartbeatService,
	HEARTBEAT_DEFAULT_INTERVAL_MS,
	type HeartbeatConfig,
} from "./services/heartbeat.js";
export type {
	AgentMeshRpcClient,
	AgentMeshRpcConfig,
	CastTaskRequest,
	CastTaskResult,
	CreditLedgerEntry,
	HeartbeatEnvelope,
	ReputationSnapshot,
} from "./types.js";
