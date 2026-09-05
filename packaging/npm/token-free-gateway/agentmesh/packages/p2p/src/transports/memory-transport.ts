import type {
  P2PMessage,
  MessageReceipt,
  TransportStats,
  PeerProtocol,
  ConnectionInfo,
  PeerDescriptor,
} from "../types.ts";
import { PeerRegistry } from "../peer-registry.ts";
import { MessageRouter } from "../message-router.ts";

/**
 * In-memory peer transport — peers communicate through an event bus local
 * to this process. Perfect for testing, single-node simulations, and as a
 * fallback when no libp2p/WebRTC transport is configured.
 *
 * Protocol identifier: "memory"
 */
export class MemoryTransport {
  readonly protocol: PeerProtocol = "memory";

  /** Global message bus shared across all MemoryTransport instances. */
  private static readonly bus = new Map<string, (msg: P2PMessage) => void>();

  private readonly registry: PeerRegistry;
  private readonly router: MessageRouter;
  private _onMessage?: (msg: P2PMessage) => void;
  private _onConnectionChange?: (info: ConnectionInfo) => void;
  private localPeerId = "";
  private running = false;

  // Statistics
  private bytesSent = 0;
  private bytesReceived = 0;
  private messagesSent = 0;
  private messagesReceived = 0;

  constructor(registry: PeerRegistry, router: MessageRouter) {
    this.registry = registry;
    this.router = router;
  }

  // ── Message handler wiring ────────────────────────────────────

  set onMessage(handler: (msg: P2PMessage) => void) {
    this._onMessage = handler;
  }

  set onConnectionChange(handler: (info: ConnectionInfo) => void) {
    this._onConnectionChange = handler;
  }

  // ── Transport API ─────────────────────────────────────────────

  async connect(peer: PeerDescriptor): Promise<ConnectionInfo> {
    this.localPeerId = peer.id.id;
    this.registry.register(peer);
    const info = this.registry.updateConnection(peer.id.id, "connected");
    this.running = true;

    // Subscribe to the shared bus under our peer id
    MemoryTransport.bus.set(this.localPeerId, (msg: P2PMessage) => {
      this.bytesReceived += JSON.stringify(msg).length;
      this.messagesReceived++;
      this.router.receive(msg);
      this._onMessage?.(msg);
    });

    this._onConnectionChange?.(info);
    return info;
  }

  async disconnect(peerId: string): Promise<void> {
    this.registry.updateConnection(peerId, "disconnected");
    MemoryTransport.bus.delete(peerId);
    this._onConnectionChange?.({ peerId, state: "disconnected" });
  }

  async send(message: P2PMessage): Promise<MessageReceipt> {
    const json = JSON.stringify(message);
    this.bytesSent += json.length;
    this.messagesSent++;
    return this.router.send(message);
  }

  async broadcast(message: P2PMessage, exclude?: string[]): Promise<MessageReceipt> {
    const json = JSON.stringify(message);
    this.bytesSent += json.length;
    this.messagesSent++;
    return this.router.broadcast(message, exclude);
  }

  stats(): TransportStats {
    return {
      bytesSent: this.bytesSent,
      bytesReceived: this.bytesReceived,
      messagesSent: this.messagesSent,
      messagesReceived: this.messagesReceived,
      connections: this.registry.connectedPeers().length,
    };
  }

  // ── Lifecycle ─────────────────────────────────────────────────

  async stop(): Promise<void> {
    if (this.localPeerId) {
      MemoryTransport.bus.delete(this.localPeerId);
    }
    this.running = false;
  }
}