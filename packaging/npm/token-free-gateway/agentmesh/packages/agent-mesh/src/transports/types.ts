/**
 * Transport-level types shared by AxlClient, HybridTransport, and any
 * future WebRTC implementation. Kept deliberately small so callers can
 * swap the underlying P2P stack without rewriting the agent layer.
 */

export type PeerId = string;

/**
 * A peer in the overlay network. `transport` hints at which carrier
 * last reported the peer — useful for routing decisions in HybridTransport.
 */
export interface Peer {
	peerId: PeerId;
	publicKey?: string;
	address?: string;
	online: boolean;
	inbound?: boolean;
	transport: "axl" | "webrtc" | "libp2p" | "loopback";
	/** Last observed timestamp (ms since epoch). */
	lastSeen?: number;
}

export interface TopologySnapshot {
	/** Our own public key (hex, 64 chars for ed25519). */
	ourPublicKey: PeerId;
	/** Our own Yggdrasil IPv6 address. */
	ourAddress?: string;
	peers: Peer[];
	tree?: Array<{ publicKey: PeerId; parent: PeerId; sequence: number }>;
	fetchedAt: number;
}

/**
 * Outbound raw binary message. The transport is responsible for
 * length-prefix framing, encryption, fragmentation, etc. — callers
 * pass opaque payloads.
 */
export interface OutboundMessage {
	destinationPeerId: PeerId;
	payload: Uint8Array;
}

/**
 * Pull-model inbound message. Transports that can't actively push
 * (e.g. AXL HTTP /recv) return one item per call. Transports that
 * support subscriptions (libp2p floodsub, WebRTC datachannel) deliver
 * one item per emission.
 */
export interface InboundMessage {
	fromPeerId: PeerId;
	payload: Uint8Array;
	receivedAt: number;
}

/** MCP Streamable HTTP session info returned by /mcp/ calls. */
export interface McpSession {
	sessionId: string;
	service: string;
	peerId: PeerId;
}

/** JSON-RPC 2.0 envelope. */
export interface JsonRpcRequest {
	jsonrpc: "2.0";
	id?: string | number | null;
	method: string;
	params?: unknown;
}

export interface JsonRpcResponse {
	jsonrpc: "2.0";
	id: string | number | null;
	result?: unknown;
	error?: { code: number; message: string; data?: unknown };
}

/** A2A envelope used by /a2a/{peer_id}. Mirrors AXL's A2AMessage shape. */
export interface A2ARequest {
	a2a: true;
	agentCard?: boolean;
	request?: JsonRpcRequest;
}

export interface A2AResponse {
	a2a: true;
	response?: JsonRpcResponse;
	error?: string;
}

export interface AgentCard {
	/** Subjective identifier (may be a DID or AXL peer ID). */
	id: string;
	name?: string;
	description?: string;
	url?: string;
	version?: string;
	capabilities?: Record<string, unknown>;
}

/**
 * Transport is the abstraction the AgentCast layer talks to.
 *
 * Implementations:
 *   - AxlClient:  AXL HTTP API (Yggdrasil overlay, ed25519 peer IDs)
 *   - WebRTC*:    browser datachannels (TODO)
 *   - LoopbackTransport: tests
 *
 * The contract is intentionally narrow: discovery, raw send, raw recv,
 * plus two higher-level helpers (callMcp, callA2a) that wrap JSON-RPC
 * envelopes for the two protocols MuhanAI peers.
 */
export interface Transport {
	readonly name: string;
	start(): Promise<void>;
	stop(): Promise<void>;
	getTopology(): Promise<TopologySnapshot>;

	send(message: OutboundMessage): Promise<{ sentBytes: number }>;
	recv(timeoutMs?: number): Promise<InboundMessage | null>;

	/** JSON-RPC call to a remote MCP service. */
	callMcp(
		peerId: PeerId,
		service: string,
		request: JsonRpcRequest,
		options?: { sessionId?: string },
	): Promise<{ response: JsonRpcResponse; sessionId?: string }>;

	/** A2A envelope call. */
	callA2a(peerId: PeerId, request: A2ARequest): Promise<A2AResponse>;

	/** Pull the remote agent card. */
	getAgentCard(peerId: PeerId): Promise<AgentCard | null>;
}

/** Optional transport hooks — used by HybridTransport for logging. */
export interface TransportHooks {
	onError?: (err: Error, op: string) => void;
	onSend?: (peerId: PeerId, bytes: number) => void;
	onRecv?: (peerId: PeerId, bytes: number) => void;
}

export interface TransportOptions {
	/** Override fetch — used by tests to inject a mock. */
	fetchImpl?: typeof fetch;
	/** Request timeout (ms). Defaults to 30s. */
	timeoutMs?: number;
	hooks?: TransportHooks;
}
