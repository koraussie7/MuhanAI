import type { P2PMessage, MessageReceipt } from "./types.ts";
import { PeerRegistry } from "./peer-registry.ts";

/** Default TTL for messages (seconds). */
const DEFAULT_TTL = 60;

/**
 * In-memory message router — delivers messages to connected peers and
 * tracks delivery status. In a production deployment this would sit on top
 * of libp2p request/response streams or WebRTC data-channels.
 */
export class MessageRouter {
  private readonly pending = new Map<string, { message: P2PMessage; sentAt: number }>();
  private readonly delivered = new Set<string>();
  private ttlMs: number;

  constructor(
    private readonly registry: PeerRegistry,
    ttlSec = DEFAULT_TTL,
  ) {
    this.ttlMs = ttlSec * 1000;
  }

  // ── Send ──────────────────────────────────────────────────────

  /**
   * Route a message to the target peer.
   * If the target is not connected the message is queued briefly; callers
   * should listen for receipts and decide on expiry.
   */
  async send(message: P2PMessage): Promise<MessageReceipt> {
    if (!message.timestamp) message.timestamp = Date.now();
    message.ttl ??= DEFAULT_TTL;
    this.pending.set(message.id, { message, sentAt: Date.now() });

    const target = this.registry.get(message.to);
    if (!target) {
      return this.fail(message.id, [`unknown peer: ${message.to}`]);
    }

    const conn = this.registry.getConnection(message.to);
    if (!conn || conn.state !== "connected") {
      // Peer known but offline — queue is acceptable in a mesh topology
      return {
        messageId: message.id,
        status: "pending",
        deliveredTo: [],
        errors: [`peer ${message.to} not connected`],
      };
    }

    this.delivered.add(message.id);
    this.pending.delete(message.id);
    return {
      messageId: message.id,
      status: "delivered",
      deliveredTo: [message.to],
      errors: [],
    };
  }

  /**
   * Broadcast to all registered peers, optionally excluding some ids.
   * Offline peers are reported as errors rather than skipped, so callers
   * can distinguish "no route" from "nobody to send to".
   */
  async broadcast(message: P2PMessage, exclude: string[] = []): Promise<MessageReceipt> {
    const allPeers = this.registry.list().filter((p) => !exclude.includes(p.id.id));
    const deliveredTo: string[] = [];
    const errors: string[] = [];

    for (const peer of allPeers) {
      const peerId = peer.id.id;
      const copy: P2PMessage = { ...message, id: crypto.randomUUID(), to: peerId };
      const receipt = await this.send(copy);
      if (receipt.status === "delivered") deliveredTo.push(peerId);
      else errors.push(...receipt.errors);
    }

    return {
      messageId: message.id,
      status: deliveredTo.length > 0 ? "delivered" : "failed",
      deliveredTo,
      errors,
    };
  }

  // ── Receive ───────────────────────────────────────────────────

  /** Record a message as received (called by transport layer). */
  receive(message: P2PMessage): void {
    this.delivered.add(message.id);
    this.pending.delete(message.id);
  }

  // ── Expiry ────────────────────────────────────────────────────

  /** Evict messages whose TTL has expired. Return expired message ids. */
  evictExpired(): string[] {
    const now = Date.now();
    const expired: string[] = [];
    for (const [id, entry] of this.pending) {
      if (now - entry.sentAt >= this.ttlMs) {
        expired.push(id);
        this.pending.delete(id);
      }
    }
    return expired;
  }

  /** Number of messages waiting for delivery. */
  get pendingCount(): number {
    return this.pending.size;
  }

  /** Total messages delivered since creation. */
  get deliveredCount(): number {
    return this.delivered.size;
  }

  // ── Internals ─────────────────────────────────────────────────

  private fail(messageId: string, errors: string[]): MessageReceipt {
    this.pending.delete(messageId);
    return { messageId, status: "failed", deliveredTo: [], errors };
  }
}