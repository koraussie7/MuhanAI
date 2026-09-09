export { AxlClient, AxlPeerIdError, AxlTransportError, lastTopology } from "./axl-client.js";
export { HybridTransport } from "./hybrid-transport.js";
export type { HybridPolicy, HybridTransportOptions } from "./hybrid-transport.js";
export {
	axlPeerIdFromDid,
	DID_METHOD,
	didFromAxlPeerId,
	IdentityRegistry,
	normalizePeerId,
} from "./identity-bridge.js";
export type { IdentityRecord } from "./identity-bridge.js";
export type {
	A2ARequest,
	A2AResponse,
	AgentCard,
	InboundMessage,
	JsonRpcRequest,
	JsonRpcResponse,
	McpSession,
	OutboundMessage,
	Peer,
	PeerId,
	TopologySnapshot,
	Transport,
	TransportHooks,
	TransportOptions,
} from "./types.js";
