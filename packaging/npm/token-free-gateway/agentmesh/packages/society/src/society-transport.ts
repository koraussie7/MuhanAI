/**
 * SocietyTransport — adapts society-protocol's room-based GossipSub messaging
 * to the AgentMesh PeerTransport interface (protocol: "libp2p").
 *
 * Society has no native point-to-point primitive — it publishes to room topics.
 * We emulate unicast by tagging each envelope with the intended recipient;
 * receivers filter by the `to` field. Broadcast uses `to: "*"`.
 *
 * Not compatible with Cloudflare Workers / browser (native libp2p modules).
 */

import type {
  P2PMessage,
  MessageReceipt,
  TransportStats,
  PeerProtocol,
  ConnectionInfo,
  PeerDescriptor,
} from "@agentmesh/p2p";
import type { SocietyClient } from "society-protocol";

/** Marker so we can distinguish mesh envelopes from raw society chat. */
interface MeshEnvelope {
  _mesh: 1;
  payload: P2PMessage;
}

function isMeshEnvelope(value: unknown): value is MeshEnvelope {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as MeshEnvelope)._mesh === 1 &&
    typeof (value as MeshEnvelope).payload === "object"
  );
}

export interface SocietyTransportOptions {
  /** A connected SocietyClient (already joined to the target room). */
  client: SocietyClient;
  /** Room id this transport publishes/subscribes on. */
  roomId: string;
}

export class SocietyTransport {
  readonly protocol: PeerProtocol = "libp2p";

  private readonly client: SocietyClient;
  private readonly roomId: string;

  private _onMessage?: (msg: P2PMessage) => void;
  private _onConnectionChange?: (info: ConnectionInfo) => void;

  private localPeerId = "";
  private started = false;

  // Statistics
  private bytesSent = 0;
  private bytesReceived = 0;
  private messagesSent = 0;
  private messagesReceived = 0;

  constructor(options: SocietyTransportOptions) {
    this.client = options.client;
    this.roomId = options.roomId;
  }

  // ── Handler wiring (kept compatible with property assignment) ────

  set onMessage(handler: (msg: P2PMessage) => void) {
    this._onMessage = handler;
  }

  set onConnectionChange(handler: (info: ConnectionInfo) => void) {
    this._onConnectionChange = handler;
  }

  // ── Transport API ─────────────────────────────────────────────

  /**
   * Register the local peer and subscribe to the room's mesh channel.
   * In society, "connecting" = joining the room (done at client setup);
   * here we bind the local descriptor and start listening for envelopes.
   */
  async connect(peer: PeerDescriptor): Promise<ConnectionInfo> {
    this.localPeerId = peer.id.id;
    this.start();

    const info: ConnectionInfo = {
      peerId: peer.id.id,
      state: "connected",
      connectedAt: Date.now(),
    };
    this._onConnectionChange?.(info);
    return info;
  }

  async disconnect(peerId: string): Promise<void> {
    this._onConnectionChange?.({ peerId, state: "disconnected" });
  }

  /**
   * Unicast: publish to the room tagged with the target peer id.
   * Receivers whose id != `to` ignore the message.
   */
  async send(message: P2PMessage): Promise<MessageReceipt> {
    const envelope: MeshEnvelope = { _mesh: 1, payload: message };
    const json = JSON.stringify(envelope);
    this.bytesSent += json.length;
    this.messagesSent++;

    await this.client.sendMessage(this.roomId, json);

    return {
      messageId: message.id,
      status: "delivered",
      deliveredTo: [message.to],
      errors: [],
    };
  }

  /** Broadcast: publish with `to: "*"` so every peer accepts it. */
  async broadcast(message: P2PMessage, exclude?: string[]): Promise<MessageReceipt> {
    const broadcastMsg: P2PMessage = { ...message, to: "*" };
    const envelope: MeshEnvelope = { _mesh: 1, payload: broadcastMsg };
    const json = JSON.stringify(envelope);
    this.bytesSent += json.length;
    this.messagesSent++;

    await this.client.sendMessage(this.roomId, json);

    return {
      messageId: message.id,
      status: "delivered",
      deliveredTo: ["*"],
      errors: [],
    };
  }

  stats(): TransportStats {
    return {
      bytesSent: this.bytesSent,
      bytesReceived: this.bytesReceived,
      messagesSent: this.messagesSent,
      messagesReceived: this.messagesReceived,
      connections: 0, // society does not expose a connection count directly
    };
  }

  // ── Lifecycle ─────────────────────────────────────────────────

  private start(): void {
    if (this.started) return;
    this.started = true;

    // Incoming chat messages on the room — decode mesh envelopes.
    this.client.on("chat:message", (_roomId: string, envelope: { body?: unknown }) => {
      const body = envelope?.body;
      if (typeof body !== "string") return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        return; // not a mesh message
      }
      if (!isMeshEnvelope(parsed)) return;

      const msg = parsed.payload;
      // Filter: accept only messages addressed to us or broadcasts.
      if (msg.to !== this.localPeerId && msg.to !== "*") return;

      this.bytesReceived += body.length;
      this.messagesReceived++;
      this._onMessage?.(msg);
    });

    // Presence updates -> connection changes.
    this.client.on("presence:update", (data: { did?: string; status?: string }) => {
      if (!data?.did) return;
      this._onConnectionChange?.({
        peerId: data.did,
        state: data.status === "online" ? "connected" : "disconnected",
        lastSeen: Date.now(),
      });
    });
  }

  async stop(): Promise<void> {
    this.started = false;
    // society client lifecycle is managed externally; we just stop listening.
  }
}
