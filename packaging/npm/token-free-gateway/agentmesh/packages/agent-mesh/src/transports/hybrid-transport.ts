import { AxlTransportError } from "./axl-client.js";
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

/**
 * Routing policy for HybridTransport. Selects which underlying
 * transport (or fallback chain) handles an outbound operation.
 *
 *   - "axl-first" (default): try AXL; on topology miss, fall back to WebRTC
 *   - "webrtc-first": opposite
 *   - "axl-only" / "webrtc-only": single-carrier (testing / restricted envs)
 */
export type HybridPolicy = "axl-first" | "webrtc-first" | "axl-only" | "webrtc-only";

export interface HybridTransportOptions extends TransportOptions {
	policy?: HybridPolicy;
	/** Required: at least the AXL transport (we cover WebRTC later). */
	axl: Transport;
	webrtc?: Transport;
}

export class HybridTransport implements Transport {
	readonly name = "hybrid";

	private readonly axl: Transport;
	private readonly webrtc: Transport | undefined;
	private readonly policy: HybridPolicy;
	private readonly hooks: TransportHooks;
	private readonly ownPeerId?: PeerId;
	private cachedTopology?: TopologySnapshot;
	private peerTransport = new Map<PeerId, Transport["name"] extends string ? string : string>();

	constructor(opts: HybridTransportOptions) {
		this.axl = opts.axl;
		this.webrtc = opts.webrtc;
		this.policy = opts.policy ?? "axl-first";
		this.hooks = opts.hooks ?? {};
		this.ownPeerId = (opts as { peerId?: PeerId }).peerId;
	}

	async start(): Promise<void> {
		await this.axl.start();
		if (this.webrtc) await this.webrtc.start();
		// Refresh topology to learn which peer lives on which transport.
		await this.refreshTopology();
	}

	async stop(): Promise<void> {
		await this.axl.stop();
		if (this.webrtc) await this.webrtc.stop();
		this.peerTransport.clear();
		this.cachedTopology = undefined;
	}

	async getTopology(): Promise<TopologySnapshot> {
		return this.refreshTopology();
	}

	async send(message: OutboundMessage): Promise<{ sentBytes: number }> {
		const carrier = this.pickCarrier(message.destinationPeerId);
		return carrier.send(message);
	}

	async recv(timeoutMs?: number): Promise<InboundMessage | null> {
		const axlMsg = await this.axl.recv(timeoutMs);
		if (axlMsg) return axlMsg;
		if (this.webrtc) return this.webrtc.recv(timeoutMs);
		return null;
	}

	async callMcp(
		peerId: PeerId,
		service: string,
		request: JsonRpcRequest,
		options?: { sessionId?: string },
	): Promise<{ response: JsonRpcResponse; sessionId?: string }> {
		const carrier = this.pickCarrier(peerId);
		return carrier.callMcp(peerId, service, request, options);
	}

	async callA2a(peerId: PeerId, request: A2ARequest): Promise<A2AResponse> {
		const carrier = this.pickCarrier(peerId);
		return carrier.callA2a(peerId, request);
	}

	async getAgentCard(peerId: PeerId): Promise<AgentCard | null> {
		const carrier = this.pickCarrier(peerId);
		return carrier.getAgentCard(peerId);
	}

	/** Inspect the carrier that would be used for a given peer. */
	routeFor(peerId: PeerId): Transport | null {
		return this.pickCarrier(peerId);
	}

	/** Returns peers known to both transports, deduplicated. */
	knownPeers(): Peer[] {
		const snap = this.cachedTopology;
		return snap ? snap.peers : [];
	}

	private pickCarrier(peerId: PeerId): Transport {
		const tagged = this.peerTransport.get(peerId);
		if (tagged === "webrtc" && this.webrtc) return this.webrtc;
		if (tagged === "axl") return this.axl;

		// No cached route — fall back to policy.
		switch (this.policy) {
			case "webrtc-only":
				if (this.webrtc) return this.webrtc;
				throw new AxlTransportError(503, "hybrid", "webrtc transport not configured");
			case "axl-only":
				return this.axl;
			case "webrtc-first":
				if (this.webrtc) return this.webrtc;
				return this.axl;
			case "axl-first":
			default:
				return this.axl;
		}
	}

	private async refreshTopology(): Promise<TopologySnapshot> {
		try {
			const snap = await this.axl.getTopology();
			this.cachedTopology = snap;
			// AXL reports itself for every peer — record it.
			for (const p of snap.peers) this.peerTransport.set(p.peerId, "axl");
			// If webrtc also exposes peers, prefer it for peers it already knows about.
			if (this.webrtc) {
				try {
					const wrtcSnap = await this.webrtc.getTopology();
					for (const p of wrtcSnap.peers) this.peerTransport.set(p.peerId, "webrtc");
				} catch (err) {
					const e = err instanceof Error ? err : new Error(String(err));
					this.hooks.onError?.(e, "webrtc.getTopology");
				}
			}
			return snap;
		} catch (err) {
			const e = err instanceof Error ? err : new Error(String(err));
			this.hooks.onError?.(e, "axl.getTopology");
			throw e;
		}
	}

	// Allow tests to seed the routing table without calling start().
	_seedRoute(peerId: PeerId, transport: "axl" | "webrtc"): void {
		this.peerTransport.set(peerId, transport);
	}
}
