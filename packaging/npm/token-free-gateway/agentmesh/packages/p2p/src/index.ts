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
export { P2PNetwork } from "./network.ts";
export type { P2PNetworkOptions, P2PNetworkEvent } from "./network.ts";

export { PeerRegistry } from "./peer-registry.ts";
export { MessageRouter } from "./message-router.ts";
export { MemoryTransport } from "./transports/memory-transport.ts";

export type {
  // Types (single file)
  PeerProtocol,
  PeerId,
  PeerDescriptor,
  ConnectionState,
  ConnectionInfo,
  P2PMessage,
  MessageStatus,
  MessageReceipt,
  DiscoveryEvent,
  DiscoveryProvider,
  PeerTransport,
  TransportStats,
  TopologyNode,
  NetworkTopology,
  // Mesh events
  P2PMeshEvent,
} from "./types.ts";
export { toMeshEvent } from "./types.ts";