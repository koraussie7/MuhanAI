import type {
  PeerDescriptor, PeerProtocol, P2PMessage, P2PMeshEvent, toMeshEvent,
  NetworkTopology,
} from "./types.ts";
import { PeerRegistry } from "./peer-registry.ts";
import { MessageRouter } from "./message-router.ts";
import { MemoryTransport } from "./transports/memory-transport.ts";

export interface P2PNetworkOptions {
  /** Local peer descriptor; generated automatically if omitted. */
  localPeer?: PeerDescriptor;
  /** Message TTL in seconds (default 60). */
  messageTtlSec?: number;
}

export type P2PNetworkEvent =
  | { type: "started"; localPeerId: string }
  | { type: "stopped" }
  | { type: P2PMeshEvent["type"]; data: Omit<P2PMeshEvent, "type"> };

/**
 * Central P2P orchestrator — wires registry, router, and transport together.
 * Emits events that can be forwarded to the Mesh event bus via `toMeshEvent`.
 *
 * Usage:
 * ```ts
 * const net = new P2PNetwork();
 * await net.start();
 * net.on("p2p.peer.connected", (ev) => { ... });
 * await net.connect(peerDescriptor);
 * await net.send({ ... });
 * await net.stop();
 * ```
 */
export class P2PNetwork {
  private registry: PeerRegistry;
  private router: MessageRouter;
  private transport: MemoryTransport;
  private listeners = new Map<string, Set<(event: P2PNetworkEvent) => void>>();
  private started = false;
  private localPeerId = "";

  constructor(options: P2PNetworkOptions = {}) {
    this.registry = new PeerRegistry();
    this.router = new MessageRouter(this.registry, options.messageTtlSec ?? 60);
    this.transport = new MemoryTransport(this.registry, this.router);

    // Wire transport messages → event emission
    this.transport.onMessage = (msg: P2PMessage) => {
      this.emit("p2p.message.received", { messageId: msg.id, from: msg.from, timestamp: Date.now() });
    };

    this.transport.onConnectionChange = (info) => {
      if (info.state === "connected") {
        this.emit("p2p.peer.connected", { peerId: info.peerId, protocol: "memory", timestamp: Date.now() });
      } else if (info.state === "disconnected") {
        this.emit("p2p.peer.disconnected", { peerId: info.peerId, timestamp: Date.now() });
      }
    };

    // Register local peer if provided
    if (options.localPeer) {
      this.registry.register(options.localPeer);
      this.localPeerId = options.localPeer.id.id;
    }
  }

  // ── Lifecycle ─────────────────────────────────────────────────

  async start(): Promise<string> {
    if (this.started) return this.localPeerId;

    // Auto-generate a local peer id when none was provided
    if (!this.localPeerId) {
      const id = crypto.randomUUID();
      this.localPeerId = id;
      const descriptor: PeerDescriptor = {
        id: { id },
        protocol: "memory",
        addresses: ["memory://local"],
        capabilities: [],
      };
      this.registry.register(descriptor);
    }

    await this.transport.connect(this.registry.get(this.localPeerId)!);
    this.started = true;
    this.emit("started", { localPeerId: this.localPeerId });
    return this.localPeerId;
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    await this.transport.stop();
    this.started = false;
    this.emit("stopped", {});
  }

  get isRunning(): boolean {
    return this.started;
  }

  get localId(): string {
    return this.localPeerId;
  }

  // ── Peer operations ───────────────────────────────────────────

  /** Register a remote peer (e.g. after discovery). */
  registerPeer(descriptor: PeerDescriptor): void {
    this.registry.register(descriptor);
  }

  /** Get a known peer by id. */
  getPeer(id: string): PeerDescriptor | undefined {
    return this.registry.get(id);
  }

  /** List all known peers, optionally filtered by capability. */
  listPeers(capabilities?: string[]): PeerDescriptor[] {
    return this.registry.list(capabilities);
  }

  /** Connected peer count. */
  get peerCount(): number {
    return this.registry.connectedPeers().length;
  }

  // ── Messaging ─────────────────────────────────────────────────

  async send(message: Omit<P2PMessage, "id" | "from" | "timestamp">): Promise<string> {
    const id = crypto.randomUUID();
    const full: P2PMessage = {
      ...message,
      id,
      from: this.localPeerId,
      timestamp: Date.now(),
    };
    const receipt = await this.transport.send(full);
    this.emit("p2p.message.sent", { messageId: id, to: message.to, timestamp: Date.now() });
    return receipt.status === "delivered" ? id : "";
  }

  async broadcast(message: Omit<P2PMessage, "id" | "from" | "timestamp">, exclude?: string[]): Promise<number> {
    const full: P2PMessage = {
      ...message,
      id: crypto.randomUUID(),
      from: this.localPeerId,
      timestamp: Date.now(),
    };
    const receipt = await this.transport.broadcast(full, exclude);
    return receipt.deliveredTo.length;
  }

  // ── Topology ──────────────────────────────────────────────────

  /** Compute a simple network topology from current connections. */
  topology(): NetworkTopology {
    const peers = this.registry.list();
    const connected = this.registry.connectedPeers();
    const nodeIds = peers.map((p) => p.id.id);
    const edges = connected.map((c) => ({
      source: this.localPeerId,
      target: c.peerId,
      weight: 1,
    }));
    return {
      nodes: peers.map((p) => ({
        id: p.id.id,
        degree: connected.filter((c) => c.peerId === p.id.id).length,
        peers: connected.filter((c) => c.peerId === p.id.id).map((c) => c.peerId),
      })),
      edges,
      diameter: connected.length,
    };
  }

  // ── Eventing ──────────────────────────────────────────────────

  on(type: P2PNetworkEvent["type"], handler: (event: P2PNetworkEvent) => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(handler);
  }

  off(type: P2PNetworkEvent["type"], handler: (event: P2PNetworkEvent) => void): void {
    this.listeners.get(type)?.delete(handler);
  }

  private emit(type: P2PNetworkEvent["type"], data: Record<string, unknown>): void {
    const event: P2PNetworkEvent = { type, ...data } as P2PNetworkEvent;
    this.listeners.get(type)?.forEach((h) => h(event));
    // Also emit under the generic "p2p.*" wildcard
    this.listeners.get("p2p.*")?.forEach((h) => h(event));
  }
}