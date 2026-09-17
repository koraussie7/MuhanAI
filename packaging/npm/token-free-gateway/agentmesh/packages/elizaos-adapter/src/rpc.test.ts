import { describe, expect, it, vi } from "vitest";
import { AgentMeshRpcError, createAgentMeshRpcClient } from "./rpc.js";

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

describe("createAgentMeshRpcClient", () => {
	const baseUrl = "https://mesh.test/api";
	const fixedUuid = "test-uuid";
	vi.stubGlobal("crypto", { randomUUID: () => fixedUuid });

	it("posts to /rpc/<method> with jsonrpc envelope", async () => {
		const calls: Array<{ url: string; init: RequestInit }> = [];
		const fetchImpl: typeof fetch = async (input, init) => {
			calls.push({ url: String(input), init: init ?? {} });
			return jsonResponse({
				jsonrpc: "2.0",
				id: fixedUuid,
				result: { peerId: "p1", score: 0.9, signals: 7, variance: 0.01, asOf: 1 },
			});
		};
		const client = createAgentMeshRpcClient({ rpcUrl: baseUrl, fetchImpl });
		const snap = await client.getReputation("p1");
		expect(snap).toEqual({ peerId: "p1", score: 0.9, signals: 7, variance: 0.01, asOf: 1 });
		expect(calls).toHaveLength(1);
		const call = calls[0];
		expect(call?.url).toBe(`${baseUrl}/rpc/reputation.get`);
		expect(call?.init.method).toBe("POST");
		expect(JSON.parse(String(call?.init.body))).toMatchObject({
			jsonrpc: "2.0",
			id: fixedUuid,
			method: "reputation.get",
			params: { peerId: "p1" },
		});
	});

	it("sends bearer when token configured", async () => {
		let authHeader = "";
		const fetchImpl: typeof fetch = async (_input, init) => {
			const h = (init?.headers ?? {}) as Record<string, string>;
			authHeader = h.authorization ?? "";
			return jsonResponse({
				result: { id: "e1", amount: "100", reason: "contribution", idempotencyKey: "k" },
			});
		};
		const client = createAgentMeshRpcClient({ rpcUrl: baseUrl, fetchImpl, token: "tok" });
		await client.recordCredit({
			amount: 100n,
			reason: "contribution",
			idempotencyKey: "k",
			metadata: null,
		});
		expect(authHeader).toBe("Bearer tok");
	});

	it("surfaces RPC fault as AgentMeshRpcError", async () => {
		const fetchImpl: typeof fetch = async () =>
			jsonResponse({ jsonrpc: "2.0", id: "x", error: { code: -32_601, message: "nope" } });
		const client = createAgentMeshRpcClient({ rpcUrl: baseUrl, fetchImpl });
		await expect(client.getReputation("p1")).rejects.toBeInstanceOf(AgentMeshRpcError);
		await expect(client.getReputation("p1")).rejects.toMatchObject({ code: "RPC_FAULT" });
	});

	it("rejects empty rpcUrl at construction", () => {
		expect(() => createAgentMeshRpcClient({ rpcUrl: "" })).toThrow(AgentMeshRpcError);
	});

	it("times out on slow responses", async () => {
		const fetchImpl: typeof fetch = (_input, init) =>
			new Promise((_resolve, reject) => {
				init?.signal?.addEventListener("abort", () =>
					reject(new DOMException("aborted", "AbortError")),
				);
			});
		const client = createAgentMeshRpcClient({ rpcUrl: baseUrl, fetchImpl, timeoutMs: 5 });
		await expect(client.getReputation("p1")).rejects.toMatchObject({ code: "RPC_TIMEOUT" });
	});
});
