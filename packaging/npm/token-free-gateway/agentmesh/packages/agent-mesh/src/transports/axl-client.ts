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
 * AxlClient — TypeScript client for the AXL HTTP API
 * (https://github.com/gensyn-ai/axl). AXL exposes a Yggdrasil-based P2P
 * node that requires no TUN/root and ships a small Go HTTP surface on
 * 127.0.0.1:9002 by default. Endpoints implemented here:
 *
 *   GET  /topology                     — discover peers + our public key
 *   POST /send  (X-Destination-Peer-Id) — raw binary push
 *   GET  /recv  (X-From-Peer-Id)        — raw binary pull
 *   POST /mcp/{peer_id}/{service}       — MCP Streamable HTTP transport
 *   GET  /a2a/{peer_id}                 — fetch remote agent card
 *   POST /a2a/{peer_id}                 — forward A2A JSON-RPC request
 *
 * Peer IDs are hex-encoded ed25519 public keys (64 chars).
 */

const HEX_PUBKEY = /^[0-9a-fA-F]{64}$/;

export class AxlPeerIdError extends Error {
	constructor(value: string) {
		super(`Invalid AXL peer ID (expected 64-char hex ed25519): "${value}"`);
		this.name = "AxlPeerIdError";
	}
}

export class AxlTransportError extends Error {
	constructor(
		public readonly status: number,
		public readonly endpoint: string,
		body: string,
	) {
		super(`AXL ${endpoint} ${status}: ${body}`);
		this.name = "AxlTransportError";
	}
}

export interface AxlClientOptions extends TransportOptions {
	baseUrl: string;
}

export class AxlClient implements Transport {
	readonly name = "axl";

	private readonly baseUrl: string;
	private readonly fetchImpl: typeof fetch;
	private readonly timeoutMs: number;
	private readonly hooks: TransportHooks;
	private started = false;
	private cachedTopology?: TopologySnapshot;

	constructor(options: AxlClientOptions) {
		this.baseUrl = options.baseUrl.replace(/\/+$/, "");
		this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
		this.timeoutMs = options.timeoutMs ?? 30_000;
		this.hooks = options.hooks ?? {};
	}

	async start(): Promise<void> {
		// Eagerly fetch topology so callers learn fast if AXL isn't running.
		await this.getTopology();
		this.started = true;
	}

	async stop(): Promise<void> {
		this.started = false;
		this.cachedTopology = undefined;
	}

	async getTopology(): Promise<TopologySnapshot> {
		const res = await this.request("GET", "/topology");
		if (!res.ok) {
			throw new AxlTransportError(res.status, "/topology", await res.text());
		}
		const raw = (await res.json()) as {
			our_ipv6?: string;
			our_public_key?: string;
			peers?: Array<{
				uri?: string;
				up?: boolean;
				inbound?: boolean;
				public_key?: string;
				root?: string;
				port?: number;
				coords?: number[];
			}>;
			tree?: Array<{ public_key?: string; parent?: string; sequence?: number }>;
		};

		const ourPublicKey = raw.our_public_key ?? "";
		const peers: Peer[] = (raw.peers ?? []).flatMap((p) => {
			const peerId = p.public_key ?? "";
			if (!peerId) return [];
			return [
				{
					peerId,
					publicKey: peerId,
					address: p.uri,
					online: Boolean(p.up),
					inbound: Boolean(p.inbound),
					transport: "axl" as const,
					lastSeen: Date.now(),
				},
			];
		});

		const snapshot: TopologySnapshot = {
			ourPublicKey,
			ourAddress: raw.our_ipv6,
			peers,
			tree: (raw.tree ?? [])
				.filter((t) => t.public_key && t.parent)
				.map((t) => ({
					publicKey: t.public_key as string,
					parent: t.parent as string,
					sequence: t.sequence ?? 0,
				})),
			fetchedAt: Date.now(),
		};
		this.cachedTopology = snapshot;
		return snapshot;
	}

	async send(message: OutboundMessage): Promise<{ sentBytes: number }> {
		this.assertPeerId(message.destinationPeerId);
		const res = await this.request("POST", "/send", {
			headers: { "X-Destination-Peer-Id": message.destinationPeerId },
			body: message.payload,
			binary: true,
		});
		if (!res.ok) {
			throw new AxlTransportError(res.status, "/send", await res.text());
		}
		const sentHeader = res.headers.get("X-Sent-Bytes");
		const sentBytes = sentHeader ? Number.parseInt(sentHeader, 10) : message.payload.byteLength;
		this.hooks.onSend?.(message.destinationPeerId, sentBytes);
		return { sentBytes };
	}

	async recv(_timeoutMs = 5_000): Promise<InboundMessage | null> {
		const res = await this.request("GET", "/recv");
		if (res.status === 204) return null;
		if (!res.ok) {
			throw new AxlTransportError(res.status, "/recv", await res.text());
		}
		const fromPeerId = res.headers.get("X-From-Peer-Id") ?? "";
		if (!fromPeerId) return null;
		const buf = new Uint8Array(await res.arrayBuffer());
		this.hooks.onRecv?.(fromPeerId, buf.byteLength);
		return { fromPeerId, payload: buf, receivedAt: Date.now() };
	}

	async callMcp(
		peerId: PeerId,
		service: string,
		request: JsonRpcRequest,
		options: { sessionId?: string } = {},
	): Promise<{ response: JsonRpcResponse; sessionId?: string }> {
		this.assertPeerId(peerId);
		if (!service) throw new Error("callMcp: service must be non-empty");

		const path = `/mcp/${peerId}/${encodeURIComponent(service)}`;
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
		};
		if (options.sessionId) headers["Mcp-Session-Id"] = options.sessionId;

		const res = await this.request("POST", path, {
			headers,
			body: JSON.stringify(request),
		});

		// 202 Accepted is valid for `notifications/initialized`.
		if (res.status === 202) {
			return { response: { jsonrpc: "2.0", id: request.id ?? null, result: null } };
		}
		if (!res.ok) {
			throw new AxlTransportError(res.status, path, await res.text());
		}
		const sessionId = res.headers.get("Mcp-Session-Id") ?? options.sessionId;
		const body = (await res.json()) as JsonRpcResponse;
		return { response: body, sessionId };
	}

	async callA2a(peerId: PeerId, request: A2ARequest): Promise<A2AResponse> {
		this.assertPeerId(peerId);
		const path = `/a2a/${peerId}`;
		const res = await this.request("POST", path, {
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(request),
		});
		if (!res.ok) {
			throw new AxlTransportError(res.status, path, await res.text());
		}
		return (await res.json()) as A2AResponse;
	}

	async getAgentCard(peerId: PeerId): Promise<AgentCard | null> {
		this.assertPeerId(peerId);
		const path = `/a2a/${peerId}`;
		const res = await this.request("GET", path);
		if (res.status === 204) return null;
		if (!res.ok) {
			throw new AxlTransportError(res.status, path, await res.text());
		}
		// AXL returns the agent card body verbatim (or as JSON if the peer
		// chose to serialize it). We pass through whatever it sent.
		const ct = res.headers.get("Content-Type") ?? "";
		if (ct.includes("application/json")) {
			return (await res.json()) as AgentCard;
		}
		const text = await res.text();
		try {
			return JSON.parse(text) as AgentCard;
		} catch {
			return null;
		}
	}

	private assertPeerId(peerId: string): asserts peerId is PeerId {
		if (!HEX_PUBKEY.test(peerId)) throw new AxlPeerIdError(peerId);
	}

	private async request(
		method: string,
		path: string,
		init: {
			headers?: Record<string, string>;
			body?: RequestInit["body"];
			binary?: boolean;
		} = {},
	): Promise<Response> {
		const url = `${this.baseUrl}${path}`;
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), this.timeoutMs);
		try {
			const headers: Record<string, string> = { ...(init.headers ?? {}) };
			const body: RequestInit["body"] =
				init.body instanceof Uint8Array ? (init.body as RequestInit["body"]) : init.body;
			const res = await this.fetchImpl(url, {
				method,
				headers,
				body,
				signal: controller.signal,
			});
			return res;
		} catch (err) {
			const e = err instanceof Error ? err : new Error(String(err));
			this.hooks.onError?.(e, `${method} ${path}`);
			throw e;
		} finally {
			clearTimeout(timer);
		}
	}
}

/**
 * Returns the most recently fetched topology (start() must have been called).
 * Used by HybridTransport for routing decisions without re-fetching.
 */
export function lastTopology(client: AxlClient): TopologySnapshot | undefined {
	const internal = client as unknown as { cachedTopology?: TopologySnapshot };
	return internal.cachedTopology;
}
