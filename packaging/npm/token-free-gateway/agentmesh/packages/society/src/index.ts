/**
 * @agentmesh/society — Society Protocol integration bridge.
 *
 * Wraps the `society-protocol` npm package and adapts it to AgentMesh:
 *   - SocietyTransport  -> PeerTransport (protocol: "libp2p")
 *   - SocietyKnowledge  -> CRDT knowledge pool over society
 *   - connectSocietyMesh -> typed client factory
 *
 * Node.js >= 20 only. Do NOT import from Cloudflare Workers / browser.
 */

export {
	connectSocietyMesh,
	createClient,
	type PeerInfo,
	type SDKConfig,
	type SocietyClient,
	type SocietyMeshConfig,
	society,
} from "./society-client.js";
export { SocietyKnowledge, type SocietyKnowledgeOptions } from "./society-knowledge.js";
export { SocietyTransport, type SocietyTransportOptions } from "./society-transport.js";

export {
	createTeamCycle,
	requestTeamAction,
	resolveTeamApproval,
	type TeamCycleActionRequest,
	type TeamCycleState,
} from "./team-cycle.js";

export {
	evaluatePreflight,
	type GatewayPreflight,
	isGatewayWorker,
	matchGatewayModel,
	type TfgCatalogFetch,
	type TfgModelEntry,
} from "./team-gateway.js";

export {
	type AgentResourceRequirements,
	type AgentTeam,
	APPROVAL_LEVELS,
	type ApprovalLevel,
	type AuditEvent,
	type ChannelPolicySpec,
	type DesiredState,
	isApprovalLevel,
	type ManagerConfig,
	type ManagerSpec,
	type ManagerStatus,
	type MCPServerRef,
	type TeamCheckpoint,
	type TeamMemberSpec,
	type TeamMemberStatus,
	type TeamPhase,
	type TeamSpec,
	type TeamStatus,
	type TeamWorker,
	type TeamWorkerRef,
	type WorkerPhase,
	type WorkerRuntime,
	type WorkerSpec,
	type WorkerStatus,
} from "./team-types.js";
