import { describe, expect, it } from "vitest";
import {
	gatewayHealth,
	resolveGatewayUrl,
	routeQuestion,
} from "../rome-apps/agentmesh-bridge/src/lib/gateway.js";

function mockFetch(
	handler: (url: string, init?: RequestInit) => { status: number; body: unknown },
) {
	return (async (url: string | URL | Request, init?: RequestInit) =>
		new Response(JSON.stringify(handler(String(url), init).body), {
			status: handler(String(url), init).status,
			headers: { "content-type": "application/json" },
		})) as unknown as typeof fetch;
}

describe("resolveGatewayUrl", () => {
	it("defaults to the local services/api port", () => {
		expect(resolveGatewayUrl()).toBe("http://127.0.0.1:3001");
	});

	it("honors AGENTMESH_GATEWAY_URL and strips trailing slashes", () => {
		expect(resolveGatewayUrl({ AGENTMESH_GATEWAY_URL: "https://mesh.example.com/" })).toBe(
			"https://mesh.example.com",
		);
	});
});

describe("routeQuestion", () => {
	it("posts userId + question to /api/route and returns data on 200", async () => {
		let captured = "";
		const result = await routeQuestion(
			{ userId: "u1", question: "How do I fix my tax filing?" },
			{
				fetchImpl: mockFetch((url, init) => {
					captured = `${url} ${init?.method} ${init?.body}`;
					return {
						status: 200,
						body: { category: { domain: "tax" }, cast: { agents: [] }, credits: { spent: 10 } },
					};
				}),
			},
		);
		expect(captured).toBe(
			'http://127.0.0.1:3001/api/route POST {"userId":"u1","question":"How do I fix my tax filing?"}',
		);
		expect(result.ok).toBe(true);
		expect(result.data?.category).toEqual({ domain: "tax" });
		expect(result.error).toBeNull();
	});

	it("surfaces gateway error bodies on non-200", async () => {
		const result = await routeQuestion(
			{ userId: "u1", question: "x" },
			{
				fetchImpl: mockFetch(() => ({ status: 402, body: { error: "insufficient_credits" } })),
			},
		);
		expect(result.ok).toBe(false);
		expect(result.error).toBe("insufficient_credits");
		expect(result.data).toBeNull();
	});

	it("returns a network error message when fetch throws", async () => {
		const result = await routeQuestion(
			{ userId: "u1", question: "x" },
			{
				fetchImpl: (async () => {
					throw new Error("ECONNREFUSED");
				}) as unknown as typeof fetch,
			},
		);
		expect(result.ok).toBe(false);
		expect(result.status).toBe(0);
		expect(result.error).toBe("ECONNREFUSED");
	});
});

describe("gatewayHealth", () => {
	it("returns ok on 200 /health", async () => {
		const result = await gatewayHealth({
			fetchImpl: mockFetch((url) =>
				url.endsWith("/health") ? { status: 200, body: { ok: true } } : { status: 404, body: null },
			),
		});
		expect(result.ok).toBe(true);
		expect(result.data).toEqual({ ok: true });
	});

	it("fails closed when gateway is unreachable", async () => {
		const result = await gatewayHealth({
			fetchImpl: (async () => {
				throw new Error("ECONNREFUSED");
			}) as unknown as typeof fetch,
		});
		expect(result.ok).toBe(false);
		expect(result.error).toBe("ECONNREFUSED");
	});
});
