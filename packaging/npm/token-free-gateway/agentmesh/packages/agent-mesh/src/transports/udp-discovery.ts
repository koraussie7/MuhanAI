/**
 * UdpDiscovery — LAN peer discovery via UDP multicast.
 *
 * Implements a subset of the ShivRatn/agentic-factory-swarm protocol
 * (HELLO / TASK_ANNOUNCE) so existing agents on the same LAN can be
 * found without DNS, signaling servers, or PKI. Self-healing: peers
 * are evicted after a heartbeat timeout and re-added on next HELLO.
 *
 * Why UDP?
 *   - Zero infrastructure: works on any LAN with multicast enabled
 *   - Sub-millisecond discovery latency for LAN-local coordination
 *   - Complements WebRTC: discover quickly over UDP, then upgrade
 *     to a WebRTC datachannel for the actual byte stream.
 *
 * Browser note: browsers can't open raw UDP sockets, so this module
 * is server-side / Node.js only. The WebRTC transport that consumes
 * these events is browser-safe.
 */

import { createSocket, type Socket } from "node:dgram";
import type { PeerId } from "./types.js";

/** Default multicast group used by the ShivRatn reference agent. */
export const DEFAULT_MCAST_ADDR = "224.1.1.1";
/** Default UDP port. */
export const DEFAULT_MCAST_PORT = 5007;
/** HELLO broadcast cadence (ms). */
export const DEFAULT_HELLO_INTERVAL_MS = 3_000;
/** Peer eviction timeout — if we don't hear from a peer within this window, drop it. */
export const DEFAULT_PEER_TIMEOUT_MS = 10_000;

export type DiscoveryMessageKind = "HELLO" | "BYE" | "TASK_ANNOUNCE" | "PING" | "PONG";

export interface DiscoveryEnvelope {
	v: 1;
	kind: DiscoveryMessageKind;
	peerId: PeerId;
	/** Sender's self-reported capabilities (opaque to the discovery layer). */
	capabilities?: Record<string, unknown>;
	/** Optional SDP payload — used by the bridge to deliver WebRTC offers. */
	sdp?: unknown;
	/** Monotonically increasing per-sender nonce; receivers MUST drop duplicates. */
	nonce: number;
	/** Sender clock (ms since epoch). */
	ts: number;
}

export interface DiscoveredPeer {
	peerId: PeerId;
	address: string;
	capabilities?: Record<string, unknown>;
	firstSeen: number;
	lastSeen: number;
}

export type DiscoveryListener = (msg: DiscoveryEnvelope, fromAddr: string) => void;

export interface UdpDiscoveryOptions {
	/** Local ed25519 peer ID (64-char hex). */
	peerId: PeerId;
	/** Multicast group address. */
	mcastAddr?: string;
	/** Multicast port. */
	port?: number;
	/** HELLO interval (ms). */
	helloIntervalMs?: number;
	/** Peer eviction timeout (ms). */
	peerTimeoutMs?: number;
	/** When true, join the multicast group (set false on the bridge / passive listener). */
	active?: boolean;
	/** Self-reported capabilities to advertise. */
	capabilities?: Record<string, unknown>;
	/** Bounded replay-protection window (per-peer). Default 256. */
	nonceWindow?: number;
}

export class UdpDiscovery {
	readonly peerId: PeerId;
	readonly address: string;

	private readonly mcastAddr: string;
	private readonly port: number;
	private readonly helloIntervalMs: number;
	private readonly peerTimeoutMs: number;
	private readonly active: boolean;
	private readonly capabilities: Record<string, unknown> | undefined;

	private socket: Socket | null = null;
	private helloTimer: NodeJS.Timeout | null = null;
	private gcTimer: NodeJS.Timeout | null = null;

	private readonly peers = new Map<PeerId, DiscoveredPeer>();
	private readonly nonces = new Map<PeerId, number[]>();
	private readonly nonceWindow: number;

	private readonly listeners = new Set<DiscoveryListener>();
	private nonceCounter = 0;

	constructor(opts: UdpDiscoveryOptions) {
		this.peerId = opts.peerId;
		this.address = `${opts.mcastAddr ?? DEFAULT_MCAST_ADDR}:${opts.port ?? DEFAULT_MCAST_PORT}`;
		this.mcastAddr = opts.mcastAddr ?? DEFAULT_MCAST_ADDR;
		this.port = opts.port ?? DEFAULT_MCAST_PORT;
		this.helloIntervalMs = opts.helloIntervalMs ?? DEFAULT_HELLO_INTERVAL_MS;
		this.peerTimeoutMs = opts.peerTimeoutMs ?? DEFAULT_PEER_TIMEOUT_MS;
		this.active = opts.active ?? true;
		this.capabilities = opts.capabilities;
		this.nonceWindow = opts.nonceWindow ?? 256;
	}

	/** Start the UDP socket and (if active) begin broadcasting HELLO beacons. */
	async start(): Promise<void> {
		if (this.socket) return;
		await new Promise<void>((resolve, reject) => {
			const sock = createSocket({ type: "udp4", reuseAddr: true });
			sock.on("error", (err) => reject(err));
			sock.bind(this.port, () => {
				try {
					sock.setBroadcast(true);
					sock.addMembership(this.mcastAddr);
					resolve();
				} catch (e) {
					reject(e instanceof Error ? e : new Error(String(e)));
				}
			});
			this.socket = sock;
			sock.on("message", (buf, rinfo) => this.handleDatagram(buf, rinfo.address));
		});

		if (this.active) {
			this.helloTimer = setInterval(() => this.broadcastHello(), this.helloIntervalMs);
			this.helloTimer.unref?.();
			// Send one immediately so we don't wait a full interval for first discovery.
			this.broadcastHello();
		}
		this.gcTimer = setInterval(() => this.gcPeers(), this.peerTimeoutMs / 2);
		this.gcTimer.unref?.();
	}

	/** Stop broadcasting and close the socket. */
	async stop(): Promise<void> {
		if (this.helloTimer) clearInterval(this.helloTimer);
		if (this.gcTimer) clearInterval(this.gcTimer);
		this.helloTimer = null;
		this.gcTimer = null;
		const sock = this.socket;
		this.socket = null;
		if (sock) {
			await new Promise<void>((resolve) => {
				sock.close(() => resolve());
			});
		}
		this.peers.clear();
		this.nonces.clear();
	}

	/** Subscribe to inbound discovery messages. Returns an unsubscribe function. */
	onMessage(fn: DiscoveryListener): () => void {
		this.listeners.add(fn);
		return () => this.listeners.delete(fn);
	}

	/** Snapshot of currently-known peers (does not include self). */
	listPeers(): DiscoveredPeer[] {
		return Array.from(this.peers.values());
	}

	/** Manually broadcast a TASK_ANNOUNCE — used by the bridge to deliver SDP offers. */
	broadcastTaskAnnounce(sdp?: unknown): void {
		this.sendEnvelope({ kind: "TASK_ANNOUNCE", sdp });
	}

	/** Encode/decode are exported for testing and for cross-language consumers. */
	static encode(env: DiscoveryEnvelope): Uint8Array {
		return new TextEncoder().encode(JSON.stringify(env));
	}

	static decode(buf: Uint8Array): DiscoveryEnvelope | null {
		try {
			const obj = JSON.parse(new TextDecoder().decode(buf)) as Partial<DiscoveryEnvelope>;
			if (obj.v !== 1) return null;
			if (!obj.kind || !obj.peerId || typeof obj.nonce !== "number" || typeof obj.ts !== "number") {
				return null;
			}
			const validKinds: DiscoveryMessageKind[] = [
				"HELLO",
				"BYE",
				"TASK_ANNOUNCE",
				"PING",
				"PONG",
			];
			if (!validKinds.includes(obj.kind as DiscoveryMessageKind)) return null;
			return {
				v: 1,
				kind: obj.kind as DiscoveryMessageKind,
				peerId: obj.peerId as PeerId,
				capabilities: obj.capabilities,
				sdp: obj.sdp,
				nonce: obj.nonce,
				ts: obj.ts,
			};
		} catch {
			return null;
		}
	}

	private broadcastHello(): void {
		this.sendEnvelope({ kind: "HELLO" });
	}

	private sendEnvelope(partial: Omit<DiscoveryEnvelope, "v" | "peerId" | "nonce" | "ts">): void {
		if (!this.socket) return;
		const env: DiscoveryEnvelope = {
			v: 1,
			kind: partial.kind,
			peerId: this.peerId,
			capabilities: this.capabilities,
			sdp: partial.sdp,
			nonce: ++this.nonceCounter,
			ts: Date.now(),
		};
		const buf = UdpDiscovery.encode(env);
		this.socket.send(buf, 0, buf.byteLength, this.port, this.mcastAddr);
	}

	private handleDatagram(buf: Uint8Array, fromAddr: string): void {
		const env = UdpDiscovery.decode(buf);
		if (!env) return;
		if (env.peerId === this.peerId) return; // ignore self

		// Replay protection — bounded deque per peer.
		if (!this.acceptNonce(env.peerId, env.nonce)) return;

		const now = Date.now();
		const existing = this.peers.get(env.peerId);
		if (existing) {
			existing.lastSeen = now;
			if (env.capabilities) existing.capabilities = env.capabilities;
		} else if (env.kind === "HELLO" || env.kind === "TASK_ANNOUNCE") {
			this.peers.set(env.peerId, {
				peerId: env.peerId,
				address: fromAddr,
				capabilities: env.capabilities,
				firstSeen: now,
				lastSeen: now,
			});
		}

		if (env.kind === "BYE") this.peers.delete(env.peerId);

		for (const fn of this.listeners) {
			try {
				fn(env, fromAddr);
			} catch {
				// listener errors are swallowed — discovery must not crash on a bad consumer
			}
		}
	}

	private acceptNonce(peerId: PeerId, nonce: number): boolean {
		let window = this.nonces.get(peerId);
		if (!window) {
			window = [];
			this.nonces.set(peerId, window);
		}
		if (window.includes(nonce)) return false;
		window.push(nonce);
		if (window.length > this.nonceWindow) window.shift();
		return true;
	}

	private gcPeers(): void {
		const now = Date.now();
		for (const [id, peer] of this.peers) {
			if (now - peer.lastSeen > this.peerTimeoutMs) this.peers.delete(id);
		}
	}
}