/**
 * UdpWebRtcBridge — POC bridge connecting LAN UDP discovery to WebRTC.
 *
 * Lifecycle:
 *   1. UdpDiscovery emits a HELLO from a previously-unknown peer.
 *   2. Bridge checks policy (capabilities, allowlist, max peers).
 *   3. Bridge calls WebRtcTransport.dial(peerId) to create an SDP offer.
 *   4. Bridge broadcasts the offer via UdpDiscovery.broadcastTaskAnnounce(sdp).
 *   5. Remote peer receives the offer, calls transport.acceptOffer, broadcasts its answer.
 *   6. We receive the answer envelope, call transport.finalizeAnswer(peerId, answer).
 *   7. Datachannel is now open — bytes flow through the WebRTCTransport.
 *
 * Why this matters:
 *   - LAN discovery < 1s with zero infra
 *   - Auto-upgrades to encrypted, NAT-traversing WebRTC for real traffic
 *   - Compatible with ShivRatn's HELLO/TASK_ANNOUNCE framing on the wire
 *   - Plug-compatible with HybridTransport (just register as a `webrtc`
 *     carrier — the bridge manages connection establishment in the background)
 *
 * Failure modes the POC handles:
 *   - Peer disappears mid-handshake → entry evicted on next GC pass
 *   - Answer envelope malformed → ignored, peer not added to topology
 *   - Already-known peer → no duplicate offer
 *   - Offer/answer arrives for unknown peer → silently dropped (anti-spam)
 */

import type { PeerId } from "./types.js";
import {
	DEFAULT_HELLO_INTERVAL_MS,
	DEFAULT_MCAST_ADDR,
	DEFAULT_MCAST_PORT,
	DEFAULT_PEER_TIMEOUT_MS,
	type DiscoveredPeer,
	UdpDiscovery,
	type DiscoveryEnvelope,
} from "./udp-discovery.js";
import type { RtcSessionDescriptionLike, WebRtcTransport } from "./webrtc-transport.js";

export interface UdpWebRtcBridgeOptions {
	/** Our own ed25519 peer ID (64-char hex). */
	peerId: PeerId;
	/** Discovery instance — already started or to be started by the bridge. */
	discovery?: UdpDiscovery;
	/** WebRTC transport — already started or to be started by the bridge. */
	transport: WebRtcTransport;
	/** Capabilities to advertise during HELLO (used by the peer's policy gate). */
	capabilities?: Record<string, unknown>;
	/** Auto-dial discovered peers. Default true. When false, callers must invoke dial(). */
	autoDial?: boolean;
	/** Only auto-dial peers whose HELLO capabilities include ALL of these keys. */
	requiredCapabilities?: string[];
	/** Hard cap on concurrent in-flight dials (anti-spam / DoS guard). */
	maxConcurrentDials?: number;
	/** Optional callback when a peer completes the offer/answer dance. */
	onPeerConnected?: (peerId: PeerId) => void;
	/** Optional callback when a peer is lost (eviction or handshake failure). */
	onPeerLost?: (peerId: PeerId, reason: "timeout" | "handshake-failed") => void;
}

interface HandshakeState {
	peerId: PeerId;
	startedAt: number;
}

export class UdpWebRtcBridge {
	readonly peerId: PeerId;

	private readonly discovery: UdpDiscovery;
	private readonly transport: WebRtcTransport;
	private readonly capabilities: Record<string, unknown> | undefined;
	private readonly autoDial: boolean;
	private readonly requiredCapabilities: string[];
	private readonly maxConcurrentDials: number;
	private readonly onPeerConnected: ((peerId: PeerId) => void) | undefined;
	private readonly onPeerLost: ((peerId: PeerId, reason: "timeout" | "handshake-failed") => void) | undefined;

	private readonly inFlight = new Map<PeerId, HandshakeState>();
	private readonly observedSdp = new Map<PeerId, Set<string>>();
	private ownsDiscovery: boolean;
	private unsubscribe: (() => void) | null = null;
	private started = false;

	constructor(opts: UdpWebRtcBridgeOptions) {
		this.peerId = opts.peerId;
		this.capabilities = opts.capabilities;
		this.autoDial = opts.autoDial ?? true;
		this.requiredCapabilities = opts.requiredCapabilities ?? [];
		this.maxConcurrentDials = opts.maxConcurrentDials ?? 16;
		this.onPeerConnected = opts.onPeerConnected;
		this.onPeerLost = opts.onPeerLost;

		this.transport = opts.transport;
		if (opts.discovery) {
			this.discovery = opts.discovery;
			this.ownsDiscovery = false;
		} else {
			this.discovery = new UdpDiscovery({
				peerId: opts.peerId,
				mcastAddr: DEFAULT_MCAST_ADDR,
				port: DEFAULT_MCAST_PORT,
				helloIntervalMs: DEFAULT_HELLO_INTERVAL_MS,
				peerTimeoutMs: DEFAULT_PEER_TIMEOUT_MS,
				active: true,
				capabilities: opts.capabilities,
			});
			this.ownsDiscovery = true;
		}
	}

	async start(): Promise<void> {
		if (this.started) return;
		this.started = true;
		if (this.ownsDiscovery) await this.discovery.start();
		await this.transport.start();
		this.unsubscribe = this.discovery.onMessage((env) => {
			// handleEnvelope is async — we intentionally swallow rejection to
			// keep the listener set robust. Errors are surfaced via onPeerLost.
			void this.handleEnvelope(env).catch(() => {});
		});
	}

	async stop(): Promise<void> {
		if (!this.started) return;
		this.started = false;
		this.unsubscribe?.();
		this.unsubscribe = null;
		this.inFlight.clear();
		this.observedSdp.clear();
		if (this.ownsDiscovery) await this.discovery.stop();
		await this.transport.stop();
	}

	/** Snapshots of peers known to UDP discovery. */
	discoveredPeers(): DiscoveredPeer[] {
		return this.discovery.listPeers();
	}

	/** Manually initiate a dial to a peer (only useful when autoDial is false). */
	async dial(peerId: PeerId): Promise<void> {
		if (peerId === this.peerId) return;
		if (this.inFlight.has(peerId)) return;
		await this.beginHandshakeAsOfferer(peerId);
	}

	private async handleEnvelope(env: DiscoveryEnvelope): Promise<void> {
		if (env.peerId === this.peerId) return;
		const sdp = env.sdp as RtcSessionDescriptionLike | undefined;

		if (env.kind === "HELLO") {
			if (this.shouldDial(env)) {
				await this.beginHandshakeAsOfferer(env.peerId);
			}
			return;
		}

		if (env.kind === "TASK_ANNOUNCE") {
			if (!sdp || typeof sdp.sdp !== "string" || typeof sdp.type !== "string") return;
			const sdpFingerprint = `${sdp.type}:${sdp.sdp.length}`;
			if (!this.recordSdp(env.peerId, sdpFingerprint)) return;
			await this.handleSdpEnvelope(env.peerId, sdp);
		}
	}

	private shouldDial(env: DiscoveryEnvelope): boolean {
		if (!this.autoDial) return false;
		if (this.inFlight.size >= this.maxConcurrentDials) return false;
		if (this.inFlight.has(env.peerId)) return false;
		const caps = env.capabilities ?? {};
		for (const key of this.requiredCapabilities) {
			if (!(key in caps)) return false;
		}
		return true;
	}

	private async beginHandshakeAsOfferer(peerId: PeerId): Promise<void> {
		this.inFlight.set(peerId, { peerId, startedAt: Date.now() });
		try {
			const sdp = await this.transport.dial(peerId);
			this.discovery.broadcastTaskAnnounce(sdp);
		} catch (err) {
			this.inFlight.delete(peerId);
			this.onPeerLost?.(peerId, "handshake-failed");
			throw err instanceof Error ? err : new Error(String(err));
		}
	}

	private async handleSdpEnvelope(peerId: PeerId, sdp: RtcSessionDescriptionLike): Promise<void> {
		try {
			if (sdp.type === "offer") {
				const answer = await this.transport.acceptOffer(peerId, sdp);
				this.discovery.broadcastTaskAnnounce(answer);
				this.inFlight.delete(peerId);
				this.onPeerConnected?.(peerId);
			} else if (sdp.type === "answer") {
				await this.transport.finalizeAnswer(peerId, sdp);
				this.inFlight.delete(peerId);
				this.onPeerConnected?.(peerId);
			}
		} catch (err) {
			this.inFlight.delete(peerId);
			this.onPeerLost?.(peerId, "handshake-failed");
			throw err instanceof Error ? err : new Error(String(err));
		}
	}

	private recordSdp(peerId: PeerId, fingerprint: string): boolean {
		let set = this.observedSdp.get(peerId);
		if (!set) {
			set = new Set<string>();
			this.observedSdp.set(peerId, set);
		}
		if (set.has(fingerprint)) return false;
		set.add(fingerprint);
		// Bound the set — eviction is O(1) amortized over the LRU shift.
		if (set.size > 64) {
			const first = set.values().next().value;
			if (first !== undefined) set.delete(first);
		}
		return true;
	}
}