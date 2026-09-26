/**
 * WebRTCTransport — Transport implementation over WebRTC datachannels.
 *
 * Implements the `Transport` interface using an injected RTCPeerConnection
 * factory. In production the factory wires up the browser's native
 * RTCPeerConnection (or the `wrtc` npm package on Node.js). In tests
 * we inject a stub factory — no WebRTC required.
 *
 * Peer discovery is intentionally external: this class assumes peers
 * were already discovered (typically by UdpDiscovery) and that signaling
 * happened out of band (UDP multicast SDP, server-side relay, QR code…).
 * The `connect()` method performs the offer/answer flow locally; the
 * resulting SDP is intended to be passed back through the same channel.
 *
 * Why a separate transport and not just "another carrier in HybridTransport"?
 *   - HybridTransport already accepts a `webrtc?: Transport` slot
 *   - Keeping the implementation in its own file keeps the surface
 *     area focused (datachannel + connection state)
 *   - This file is browser/Node-safe by NOT importing RTCPeerConnection
 *     directly — that's the factory's job.
 */

import type {
	A2ARequest,
	A2AResponse,
	AgentCard,
	InboundMessage,
	JsonRpcRequest,
	JsonRpcResponse,
	OutboundMessage,
	Peer,
	PeerId,
	TopologySnapshot,
	Transport,
	TransportHooks,
	TransportOptions,
} from "./types.js";

/** Minimal RTCPeerConnection surface this transport depends on. */
export type RtcPeerConnectionState =
	| "new"
	| "connecting"
	| "connected"
	| "disconnected"
	| "failed"
	| "closed";
export type RtcDataChannelState = "connecting" | "open" | "closing" | "closed";

export interface RtcConfiguration {
	iceServers?: Array<{ urls: string | string[]; username?: string; credential?: string }>;
	iceTransportPolicy?: "all" | "relay";
	bundlePolicy?: "balanced" | "max-compat" | "max-bundle";
	rtcpMuxPolicy?: "negotiate" | "require";
	[key: string]: unknown;
}

export interface RtcPeerConnectionLike {
	createDataChannel(label: string, init?: { ordered?: boolean }): RtcDataChannelLike;
	createOffer(): Promise<RtcSessionDescriptionLike>;
	createAnswer(): Promise<RtcSessionDescriptionLike>;
	setLocalDescription(desc: RtcSessionDescriptionLike): Promise<void>;
	setRemoteDescription(desc: RtcSessionDescriptionLike): Promise<void>;
	addEventListener(type: string, listener: (ev: unknown) => void): void;
	removeEventListener?(type: string, listener: (ev: unknown) => void): void;
	close(): void;
	readonly localDescription: RtcSessionDescriptionLike | null;
	readonly connectionState?: RtcPeerConnectionState;
}

export interface RtcDataChannelLike {
	send(data: string | Uint8Array): void;
	close(): void;
	addEventListener(type: string, listener: (ev: unknown) => void): void;
	removeEventListener?(type: string, listener: (ev: unknown) => void): void;
	readonly readyState: RtcDataChannelState;
	readonly bufferedAmount: number;
}

export interface RtcSessionDescriptionLike {
	type: "offer" | "answer" | "pranswer" | "rollback";
	sdp: string;
}

/** Factory the caller injects at construction time. */
export type RtcPeerConnectionFactory = (config?: RtcConfiguration) => RtcPeerConnectionLike;

export interface WebRtcTransportOptions extends TransportOptions {
	peerId: PeerId;
	factory: RtcPeerConnectionFactory;
	rtcConfig?: RtcConfiguration;
}

interface DataChannelEntry {
	channel: RtcDataChannelLike;
	conn: RtcPeerConnectionLike;
	peerId: PeerId;
	/** Inbound messages queued while a recv() call is pending. */
	queue: InboundMessage[];
	resolvers: Array<(msg: InboundMessage | null) => void>;
}

const DATA_CHANNEL_LABEL = "agentmesh";
const RECV_POLL_MS = 50;

export class WebRtcTransport implements Transport {
	readonly name = "webrtc";

	private readonly peerId: PeerId;
	private readonly factory: RtcPeerConnectionFactory;
	private readonly hooks: TransportHooks;
	private readonly rtcConfig: RtcConfiguration | undefined;

	private readonly channels = new Map<PeerId, DataChannelEntry>();
	private started = false;

	constructor(opts: WebRtcTransportOptions) {
		this.peerId = opts.peerId;
		this.factory = opts.factory;
		this.hooks = opts.hooks ?? {};
		this.rtcConfig = opts.rtcConfig;
	}

	async start(): Promise<void> {
		this.started = true;
	}

	async stop(): Promise<void> {
		this.started = false;
		for (const entry of this.channels.values()) {
			try {
				entry.channel.close();
				entry.conn.close();
			} catch {
				// shutdown — ignore close errors
			}
			for (const resolve of entry.resolvers) resolve(null);
		}
		this.channels.clear();
	}

	async getTopology(): Promise<TopologySnapshot> {
		const peers: Peer[] = [];
		for (const [peerId, entry] of this.channels) {
			peers.push({
				peerId,
				online: entry.channel.readyState === "open",
				transport: "webrtc",
				lastSeen: Date.now(),
			});
		}
		return {
			ourPublicKey: this.peerId,
			peers,
			fetchedAt: Date.now(),
		};
	}

	async send(message: OutboundMessage): Promise<{ sentBytes: number }> {
		const entry = await this.ensureChannel(message.destinationPeerId);
		const payload =
			message.payload instanceof Uint8Array
				? message.payload
				: new TextEncoder().encode(JSON.stringify(message.payload));
		if (entry.channel.readyState !== "open") {
			throw new Error(`webrtc: datachannel to ${message.destinationPeerId} not open`);
		}
		entry.channel.send(payload);
		this.hooks.onSend?.(message.destinationPeerId, payload.byteLength);
		return { sentBytes: payload.byteLength };
	}

	async recv(timeoutMs = 5_000): Promise<InboundMessage | null> {
		// Round-robin across channels; the first one with a queued message wins.
		const deadline = Date.now() + timeoutMs;
		for (;;) {
			for (const entry of this.channels.values()) {
				const msg = entry.queue.shift();
				if (msg) return msg;
			}
			if (Date.now() >= deadline) return null;
			await new Promise((r) => setTimeout(r, Math.min(RECV_POLL_MS, timeoutMs)));
		}
	}

	async callMcp(
		_peerId: PeerId,
		_service: string,
		_request: JsonRpcRequest,
		_options?: { sessionId?: string },
	): Promise<{ response: JsonRpcResponse; sessionId?: string }> {
		throw new Error("webrtc: MCP over datachannel not implemented in POC — use AXL or libp2p");
	}

	async callA2a(_peerId: PeerId, _request: A2ARequest): Promise<A2AResponse> {
		throw new Error("webrtc: A2A over datachannel not implemented in POC — use AXL or libp2p");
	}

	async getAgentCard(_peerId: PeerId): Promise<AgentCard | null> {
		return null;
	}

	/** Initiate an offer to a previously-unseen peer; returns the SDP to deliver out of band. */
	async dial(peerId: PeerId): Promise<RtcSessionDescriptionLike> {
		const conn = this.factory(this.rtcConfig);
		const channel = conn.createDataChannel(DATA_CHANNEL_LABEL, { ordered: true });
		const entry: DataChannelEntry = {
			channel,
			conn,
			peerId,
			queue: [],
			resolvers: [],
		};
		this.channels.set(peerId, entry);
		conn.addEventListener("datachannel", (ev: unknown) => {
			const e = ev as { channel: RtcDataChannelLike };
			this.wireDataChannel(peerId, conn, e.channel);
		});
		const offer = await conn.createOffer();
		await conn.setLocalDescription(offer);
		return conn.localDescription ?? offer;
	}

	/**
	 * Accept an inbound offer from a peer who dialed us first.
	 * Returns the answer SDP — callers MUST deliver it back to the peer
	 * over the signaling channel so they can finalize the connection.
	 */
	async acceptOffer(
		peerId: PeerId,
		offer: RtcSessionDescriptionLike,
	): Promise<RtcSessionDescriptionLike> {
		const conn = this.factory(this.rtcConfig);
		conn.addEventListener("datachannel", (ev: unknown) => {
			const e = ev as { channel: RtcDataChannelLike };
			this.wireDataChannel(peerId, conn, e.channel);
		});
		await conn.setRemoteDescription(offer);
		const answer = await conn.createAnswer();
		await conn.setLocalDescription(answer);
		const channel = conn.createDataChannel(DATA_CHANNEL_LABEL);
		const entry: DataChannelEntry = {
			channel,
			conn,
			peerId,
			queue: [],
			resolvers: [],
		};
		this.channels.set(peerId, entry);
		return conn.localDescription ?? answer;
	}

	/** Finalize a connection when the remote peer delivers our answer. */
	async finalizeAnswer(peerId: PeerId, answer: RtcSessionDescriptionLike): Promise<void> {
		const entry = this.channels.get(peerId);
		if (!entry) {
			throw new Error(`webrtc: no datachannel for ${peerId} — dial first`);
		}
		await entry.conn.setRemoteDescription(answer);
	}

	private async ensureChannel(peerId: PeerId): Promise<DataChannelEntry> {
		if (peerId === this.peerId) throw new Error("webrtc: cannot send to self");
		const existing = this.channels.get(peerId);
		if (existing && existing.channel.readyState === "open") return existing;
		// Channel is staged but not yet open — wait until open or fail.
		return new Promise<DataChannelEntry>((resolve, reject) => {
			const channel = existing?.channel ?? this.channels.get(peerId)?.channel;
			if (!channel) {
				reject(new Error(`webrtc: no datachannel for ${peerId} — dial first`));
				return;
			}
			const onState = () => {
				if (channel.readyState === "open") {
					channel.removeEventListener?.("open", onState);
					channel.removeEventListener?.("close", onState);
					const entry = this.channels.get(peerId);
					if (entry) resolve(entry);
					else reject(new Error(`webrtc: lost channel for ${peerId}`));
				} else if (channel.readyState === "closed") {
					channel.removeEventListener?.("open", onState);
					channel.removeEventListener?.("close", onState);
					reject(new Error(`webrtc: datachannel to ${peerId} closed before open`));
				}
			};
			channel.addEventListener("open", onState);
			channel.addEventListener("close", onState);
			onState();
		});
	}

	private wireDataChannel(
		peerId: PeerId,
		conn: RtcPeerConnectionLike,
		channel: RtcDataChannelLike,
	): void {
		const entry: DataChannelEntry = {
			channel,
			conn,
			peerId,
			queue: [],
			resolvers: [],
		};
		this.channels.set(peerId, entry);
		channel.addEventListener("message", (ev: unknown) => {
			const e = ev as { data: string | ArrayBuffer | Uint8Array };
			const payload =
				typeof e.data === "string"
					? new TextEncoder().encode(e.data)
					: e.data instanceof Uint8Array
						? e.data
						: new Uint8Array(e.data as ArrayBuffer);
			const inbound: InboundMessage = {
				fromPeerId: peerId,
				payload,
				receivedAt: Date.now(),
			};
			this.hooks.onRecv?.(peerId, payload.byteLength);
			const waiting = entry.resolvers.shift();
			if (waiting) waiting(inbound);
			else entry.queue.push(inbound);
		});
	}

	private reportError(err: unknown, op: string): void {
		const e = err instanceof Error ? err : new Error(String(err));
		this.hooks.onError?.(e, op);
	}
}
