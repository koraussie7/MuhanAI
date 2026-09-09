import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AxlClient, AxlPeerIdError, AxlTransportError } from "./axl-client.js";
import type { JsonRpcRequest } from "./types.js";

const PEER_A = "a".repeat(64);
const PEER_B = "b".repeat(64);

interface RecordedCall {
	url: string;
	method: string;
	headers: Record<string, string>;
	body: string | null;
}

function mockJsonResponse(body: unknown, init: ResponseInit = {}): Response {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
		...init,
	});
}

function mockBinaryResponse(buf: Uint8Array, init: ResponseInit = {}): Response {
	return new Response(buf, {
		status: 200,
		headers: { "Content-Type": "application/octet-stream", ...(init.headers ?? {}) },
		...init,
	});
}

function recordCall(recorded: RecordedCall[], url: string, init: RequestInit): void {
	const headers: Record<string, string> = {};
	const reqHeaders = init.headers;
	if (reqHeaders) {
		if (reqHeaders instanceof Headers) {
			reqHeaders.forEach((v: string, k: string) => {
				headers[k] = v;
			});
		} else if (Array.isArray(reqHeaders)) {
			for (const pair of reqHeaders) {
				const k = pair[0];
				const v = pair[1];
				if (k !== undefined && v !== undefined) headers[k] = v;
			}
		} else {
			Object.assign(headers, reqHeaders);
		}
	}
	let bodyStr: string | null = null;
	if (typeof init.body === "string") bodyStr = init.body;
	else if (init.body instanceof Uint8Array) bodyStr = `[binary ${init.body.byteLength}B]`;
	recorded.push({
		url,
		method: (init.method ?? "GET").toUpperCase(),
		headers,
		body: bodyStr,
	});
}

/**
 * Compose a vi.fn that records every call AND replays queued responses.
 * Use `enqueueResponse(...)` in each test to add a one-shot response.
 */
function makeFetchMock(): {
	fetch: typeof fetch;
	recorded: RecordedCall[];
	enqueueResponse: (response: Response) => void;
} {
	const recorded: RecordedCall[] = [];
	const queue: Response[] = [];
	const fetchMock = vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
		const u = typeof url === "string" ? url : url.toString();
		recordCall(recorded, u, init);
		const next = queue.shift();
		if (!next) throw new Error(`unhandled ${init.method ?? "GET"} ${u}`);
		return next;
	}) as unknown as typeof fetch;
	return {
		fetch: fetchMock,
		recorded,
		enqueueResponse: (response: Response) => queue.push(response),
	};
}

describe("AxlClient", () => {
	let fetchMock: typeof fetch;
	let recorded: RecordedCall[];
	let enqueueResponse: (response: Response) => void;

	beforeEach(() => {
		({ fetch: fetchMock, recorded, enqueueResponse } = makeFetchMock());
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	function client(): AxlClient {
		return new AxlClient({
			baseUrl: "http://127.0.0.1:9002",
			fetchImpl: fetchMock,
		});
	}

	describe("start + getTopology", () => {
		it("fetches topology and caches the result", async () => {
			const topologyBody = {
				our_ipv6: "200:abcd::1",
				our_public_key: PEER_A,
				peers: [
					{
						uri: "tcp://200:beef::1",
						up: true,
						inbound: false,
						public_key: PEER_B,
						root: "00",
						port: 1,
						coords: [0],
					},
				],
				tree: [{ public_key: PEER_B, parent: PEER_A, sequence: 7 }],
			};
			enqueueResponse(mockJsonResponse(topologyBody));
			enqueueResponse(mockJsonResponse(topologyBody));

			const c = client();
			await c.start();
			const topology = await c.getTopology();

			expect(topology.ourPublicKey).toBe(PEER_A);
			expect(topology.ourAddress).toBe("200:abcd::1");
			expect(topology.peers).toHaveLength(1);
			expect(topology.peers[0]?.peerId).toBe(PEER_B);
			expect(topology.peers[0]?.transport).toBe("axl");
			expect(topology.tree?.[0]).toEqual({
				publicKey: PEER_B,
				parent: PEER_A,
				sequence: 7,
			});
			expect(recorded).toHaveLength(2);
			expect(recorded[0]?.url).toBe("http://127.0.0.1:9002/topology");
			expect(recorded[0]?.method).toBe("GET");
		});
	});

	describe("send", () => {
		it("POSTs raw binary with X-Destination-Peer-Id and parses X-Sent-Bytes", async () => {
			enqueueResponse(
				mockBinaryResponse(new Uint8Array(), {
					status: 200,
					headers: { "X-Sent-Bytes": "11" },
				}),
			);

			const result = await client().send({
				destinationPeerId: PEER_B,
				payload: new TextEncoder().encode("hello world"),
			});

			expect(result.sentBytes).toBe(11);
			expect(recorded).toHaveLength(1);
			const call = recorded[0]!;
			expect(call.method).toBe("POST");
			expect(call.url).toBe("http://127.0.0.1:9002/send");
			expect(call.headers["X-Destination-Peer-Id"]).toBe(PEER_B);
		});

		it("rejects non-hex peer IDs", async () => {
			await expect(
				client().send({ destinationPeerId: "not-hex", payload: new Uint8Array() }),
			).rejects.toBeInstanceOf(AxlPeerIdError);
		});
	});

	describe("recv", () => {
		it("returns null on 204", async () => {
			enqueueResponse(new Response(null, { status: 204 }));
			await expect(client().recv()).resolves.toBeNull();
		});

		it("returns the message + X-From-Peer-Id on 200", async () => {
			const payload = new TextEncoder().encode("ping");
			enqueueResponse(
				mockBinaryResponse(payload, {
					status: 200,
					headers: { "X-From-Peer-Id": PEER_B },
				}),
			);
			const msg = await client().recv();
			expect(msg).not.toBeNull();
			expect(msg?.fromPeerId).toBe(PEER_B);
			expect(new TextDecoder().decode(msg?.payload)).toBe("ping");
		});
	});

	describe("callMcp", () => {
		it("forwards JSON-RPC and returns the inner response with the session id", async () => {
			enqueueResponse(
				mockJsonResponse(
					{ jsonrpc: "2.0", id: 1, result: { tools: [] } },
					{ status: 200, headers: { "Mcp-Session-Id": "mcp-tools-deadbeef-123" } },
				),
			);

			const req: JsonRpcRequest = { jsonrpc: "2.0", id: 1, method: "tools/list" };
			const out = await client().callMcp(PEER_B, "tools", req);

			expect(out.response).toEqual({ jsonrpc: "2.0", id: 1, result: { tools: [] } });
			expect(out.sessionId).toBe("mcp-tools-deadbeef-123");
			expect(recorded[0]?.method).toBe("POST");
			expect(recorded[0]?.url).toBe(`http://127.0.0.1:9002/mcp/${PEER_B}/tools`);
			expect(recorded[0]?.headers["Content-Type"]).toBe("application/json");
		});

		it("returns a null result for 202 Accepted (notifications/initialized)", async () => {
			enqueueResponse(new Response(null, { status: 202 }));
			const out = await client().callMcp(PEER_B, "tools", {
				jsonrpc: "2.0",
				method: "notifications/initialized",
			});
			expect(out.response.result).toBeNull();
		});

		it("throws AxlTransportError on upstream failure", async () => {
			enqueueResponse(new Response("upstream timeout", { status: 502 }));
			await expect(
				client().callMcp(PEER_B, "tools", { jsonrpc: "2.0", id: 1, method: "x" }),
			).rejects.toBeInstanceOf(AxlTransportError);
		});
	});

	describe("callA2a", () => {
		it("POSTs the envelope and returns the parsed response", async () => {
			enqueueResponse(
				mockJsonResponse({
					a2a: true,
					response: { jsonrpc: "2.0", id: 7, result: { ok: true } },
				}),
			);
			const resp = await client().callA2a(PEER_B, {
				a2a: true,
				request: { jsonrpc: "2.0", id: 7, method: "agent.invoke" },
			});
			expect(resp.response?.result).toEqual({ ok: true });
		});
	});

	describe("getAgentCard", () => {
		it("returns parsed JSON card on 200", async () => {
			enqueueResponse(mockJsonResponse({ id: "did:muhan:deadbeef", name: "Worker-B" }));
			const card = await client().getAgentCard(PEER_B);
			expect(card).toEqual({ id: "did:muhan:deadbeef", name: "Worker-B" });
			expect(recorded[0]?.method).toBe("GET");
		});

		it("returns null on 204", async () => {
			enqueueResponse(new Response(null, { status: 204 }));
			expect(await client().getAgentCard(PEER_B)).toBeNull();
		});
	});
});
