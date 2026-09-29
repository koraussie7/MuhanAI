/**
 * @agentmesh/p2p — P2P Network layer (Agent 3)
 *
 * Provides peer discovery, in-memory transport, message routing, and
 * network topology for the Agent Mesh. Designed as an in-process building
 * block; swap transports to use libp2p, WebRTC, or gensyn-compatible
 * protocols without changing the orchestrator.
 *
 * @example
 * ```ts
 * import { P2PNetwork, PeerRegistry, MessageRouter } from "@agentmesh/p2p";
 *
 * const net = new P2PNetwork();
 * await net.start();
 * console.log(net.localId);           // uuid
 * console.log(net.peerCount);          // 0
 * net.on("p2p.peer.connected", (ev) => { ... });
 * await net.stop();
 * ```
 */

export { MessageRouter } from "./message-router.js";
export type { P2PNetworkEvent, P2PNetworkOptions } from "./network.js";
export { P2PNetwork } from "./network.js";
export { PeerRegistry } from "./peer-registry.js";
export { MemoryTransport } from "./transports/memory-transport.js";

export type {
	ConnectionInfo,
	ConnectionState,
	DiscoveryEvent,
	DiscoveryProvider,
	MessageReceipt,
	MessageStatus,
	NetworkTopology,
	// Mesh events
	P2PMeshEvent,
	P2PMessage,
	PeerDescriptor,
	PeerId,
	// Types (single file)
	PeerProtocol,
	PeerTransport,
	TopologyNode,
	TransportStats,
} from "./types.js";
export { toMeshEvent } from "./types.js";
