/**
 * @agentmesh/moltmesh-adapter — optional MoltMesh (OpenMolt Network) adapter.
 *
 * Bridges the muhanai API and dashboard to a local MoltMesh daemon over gRPC:
 * agent discovery (Ed25519-signed Agent Cards), task lifecycle with leases,
 * and durable messaging.
 *
 * **Node-only.** `@grpc/grpc-js` needs raw HTTP/2 sockets, so this package must
 * not be imported by the Cloudflare Worker bundle. `services/api` loads it
 * behind `MOLTMESH_ENABLED=1` via dynamic import, mirroring the society
 * protocol pattern.
 *
 * See `docs/MOLTMESH_INTEGRATION.md` and `proto/README.md`.
 */

export { MoltmeshClient, type MoltmeshClientOptions } from "./client.ts";

export {
	collectStream,
	createStub,
	defaultAddress,
	type GrpcStub,
	loadProto,
	resolveProtoPath,
	serverStream,
	unary,
} from "./grpc.ts";

export {
	type AgentCardToDescriptorOptions,
	agentCardToDescriptor,
	CAPABILITY_PREFIX,
	capabilityNames,
	capabilityTitle,
	capabilityToAgentCapability,
	inferAgentType,
	isMoltmeshDid,
} from "./mapper.ts";

export {
	inferWorkType,
	leaseIsActive,
	leaseRemainingMs,
	type TaskToWorkItemOptions,
	taskStatusToDashboard,
	taskStatusToProgress,
	taskToWorkItem,
	type WorkItemView,
} from "./task-mapper.ts";

export * from "./types.ts";
