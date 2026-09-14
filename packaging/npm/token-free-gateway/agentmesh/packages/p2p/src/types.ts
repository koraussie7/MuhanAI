/**
 * P2P types — peer identity, message envelope, discovery signals.
 * Shared by all P2P sub-modules; kept in a single file for easy auditing.
 */
import type { MeshEvent } from "@agentmesh/core";

// ── Peer identity ──────────────────────────────────────────────────

/** Network transport protocol a peer speaks. */
export type PeerProtocol = "libp2p" | "websocket" | "webrtc" | "memory";

/** Cryptographic-style peer identity (simplified for in-process use). */
export interface PeerId {
  id: string;
  publicKey?: string;
}

/** Full descriptor of a remote (or local) peer. */
export interface PeerDescriptor {
  id: PeerId;
  displayName?: string;
  protocol: PeerProtocol;
  addresses: string[];
  capabilities: string[];
  metadata?: Record<string, unknown>;
}

// ── Connection state ───────────────────────────────────────────────

export type ConnectionState = "disconnected" | "connecting" | "connected" | "reconnecting" | "closed";

export interface ConnectionInfo {
  peerId: string;
  state: ConnectionState;
  connectedAt?: number;
  latencyMs?: number;
  lastSeen?: number;
}

// ── Message layer ──────────────────────────────────────────────────

/** Every P2P message carries an envelope for routing. */
export interface P2PMessage {
  id: string;
  type: string;
  from: string;
  to: string;
  payload: unknown;
  timestamp: number;
  ttl?: number;            // seconds before the message is dropped
  replyTo?: string;        // message id this is a reply to
}

export type MessageStatus = "pending" | "delivered" | "failed" | "expired";

export interface MessageReceipt {
  messageId: string;
  status: MessageStatus;
  deliveredTo: string[];
  errors: string[];
}

// ── Discovery ──────────────────────────────────────────────────────

export interface DiscoveryEvent {
  type: "peer.found" | "peer.lost" | "peer.updated";
  peer: PeerDescriptor;
  timestamp: number;
}

export interface DiscoveryProvider {
  readonly name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  announce(descriptor: PeerDescriptor): Promise<void>;
  findPeers(capabilities?: string[]): Promise<PeerDescriptor[]>;
  onEvent: (event: DiscoveryEvent) => void;
}

// ── Transport ──────────────────────────────────────────────────────

export interface TransportStats {
  bytesSent: number;
  bytesReceived: number;
  messagesSent: number;
  messagesReceived: number;
  connections: number;
}

export interface PeerTransport {
  readonly protocol: PeerProtocol;
  connect(peer: PeerDescriptor): Promise<ConnectionInfo>;
  disconnect(peerId: string): Promise<void>;
  send(message: P2PMessage): Promise<MessageReceipt>;
  broadcast(message: P2PMessage, exclude?: string[]): Promise<MessageReceipt>;
  stats(): TransportStats;
  stop(): Promise<void>;
  onMessage: (message: P2PMessage) => void;
  onConnectionChange: (info: ConnectionInfo) => void;
}

// ── Topology ───────────────────────────────────────────────────────

export interface TopologyNode {
  id: string;
  degree: number;
  peers: string[];
}

export interface NetworkTopology {
  nodes: TopologyNode[];
  edges: { source: string; target: string; weight: number }[];
  diameter: number;
}

// ── P2P events that flow into the Mesh event bus ───────────────────

export type P2PMeshEvent =
  | { type: "p2p.peer.connected"; peerId: string; protocol: PeerProtocol; timestamp: number }
  | { type: "p2p.peer.disconnected"; peerId: string; timestamp: number }
  | { type: "p2p.message.sent"; messageId: string; to: string; timestamp: number }
  | { type: "p2p.message.received"; messageId: string; from: string; timestamp: number };

export function toMeshEvent(event: P2PMeshEvent): MeshEvent {
  // narrow cast — MeshEvent is a union, we widen via unknown
  return event as unknown as MeshEvent;
}