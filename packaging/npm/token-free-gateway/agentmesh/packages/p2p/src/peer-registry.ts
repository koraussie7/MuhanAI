import type { PeerDescriptor, PeerId, ConnectionInfo, ConnectionState } from "./types.ts";

/**
 * In-memory peer registry — single source of truth for known peers.
 * Thread-safe for serial usage (single-node); for distributed use swap in
 * a DHT-backed implementation (see AXL/gensyn pattern ref).
 */
export class PeerRegistry {
  private readonly peers = new Map<string, PeerDescriptor>();
  private readonly connections = new Map<string, ConnectionInfo>();

  // ── Registration ──────────────────────────────────────────────

  register(descriptor: PeerDescriptor): void {
    const key = descriptor.id.id;
    const existing = this.peers.get(key);
    if (existing) {
      // Merge addresses & capabilities on re-registration
      existing.addresses.push(
        ...descriptor.addresses.filter((a) => !existing.addresses.includes(a)),
      );
      existing.capabilities.push(
        ...descriptor.capabilities.filter((c) => !existing.capabilities.includes(c)),
      );
      existing.metadata = { ...existing.metadata, ...descriptor.metadata };
    } else {
      this.peers.set(key, descriptor);
    }
  }

  unregister(peerId: string): void {
    this.peers.delete(peerId);
    this.connections.delete(peerId);
  }

  get(peerId: string): PeerDescriptor | undefined {
    return this.peers.get(peerId);
  }

  list(capabilities?: string[]): PeerDescriptor[] {
    const all = Array.from(this.peers.values());
    if (!capabilities || capabilities.length === 0) return all;
    return all.filter((p) =>
      capabilities.every((c) => p.capabilities.includes(c)),
    );
  }

  count(): number {
    return this.peers.size;
  }

  // ── Connection tracking ───────────────────────────────────────

  updateConnection(peerId: string, state: ConnectionState): ConnectionInfo {
    let info = this.connections.get(peerId);
    if (!info) {
      info = { peerId, state };
      this.connections.set(peerId, info);
    }
    info.state = state;
    if (state === "connected") {
      info.connectedAt ??= Date.now();
      info.lastSeen = Date.now();
    }
    return info;
  }

  getConnection(peerId: string): ConnectionInfo | undefined {
    return this.connections.get(peerId);
  }

  connectedPeers(): ConnectionInfo[] {
    return Array.from(this.connections.values()).filter(
      (c) => c.state === "connected",
    );
  }

  // ── Peer ID helpers ───────────────────────────────────────────

  /** Create a simple PeerId from a string. */
  static simpleId(id: string): PeerId {
    return { id };
  }
}