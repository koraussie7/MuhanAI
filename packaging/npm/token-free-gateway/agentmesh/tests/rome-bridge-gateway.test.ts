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

describe("contract: bridge token header", () => {
	it("sends authorization: Bearer when AGENTMESH_BRIDGE_TOKEN is set (routeQuestion)", async () => {
		let capturedHeaders: Record<string, string> | undefined;
		const result = await routeQuestion(
			{ userId: "u1", question: "q" },
			{
				fetchImpl: mockFetch((_url, init) => {
					capturedHeaders = init?.headers as Record<string, string>;
					return { status: 200, body: { category: {}, cast: {} } };
				}),
				env: { AGENTMESH_BRIDGE_TOKEN: "s3cret" },
			},
		);
		expect(result.ok).toBe(true);
		expect(capturedHeaders?.authorization).toBe("Bearer s3cret");
		expect(capturedHeaders?.["content-type"]).toBe("application/json");
	});

	it("omits authorization when no token is configured", async () => {
		let capturedHeaders: Record<string, string> | undefined;
		await routeQuestion(
			{ userId: "u1", question: "q" },
			{
				fetchImpl: mockFetch((_url, init) => {
					capturedHeaders = init?.headers as Record<string, string>;
					return { status: 200, body: { category: {}, cast: {} } };
				}),
				env: {},
			},
		);
		expect(capturedHeaders?.authorization).toBeUndefined();
	});

	it("sends the same token on gatewayHealth probes", async () => {
		let capturedHeaders: Record<string, string> | undefined;
		await gatewayHealth({
			fetchImpl: mockFetch((_url, init) => {
				capturedHeaders = init?.headers as Record<string, string>;
				return { status: 200, body: { ok: true } };
			}),
			env: { AGENTMESH_BRIDGE_TOKEN: "s3cret" },
		});
		expect(capturedHeaders?.authorization).toBe("Bearer s3cret");
	});
});

describe("contract: response shape & error status passthrough", () => {
	it("passes the full credits receipt through unchanged on 200", async () => {
		const body = {
			userId: "u1",
			category: { domain: "tax" },
			cast: { agents: ["a1"] },
			knowledgeUsed: [{ id: "k1" }],
			runIds: ["run-1"],
			credits: { spent: 10, balanceAfter: "990", enforced: true },
		};
		const result = await routeQuestion(
			{ userId: "u1", question: "q" },
			{ fetchImpl: mockFetch(() => ({ status: 200, body })) },
		);
		expect(result.ok).toBe(true);
		expect(result.data).toEqual(body);
		expect(result.data?.credits).toEqual({ spent: 10, balanceAfter: "990", enforced: true });
	});

	it("preserves status 402 + insufficient_credits (business result, not transport error)", async () => {
		const result = await routeQuestion(
			{ userId: "u1", question: "q" },
			{
				fetchImpl: mockFetch(() => ({
					status: 402,
					body: { error: "insufficient_credits", balance: "5", required: "15" },
				})),
			},
		);
		expect(result.ok).toBe(false);
		expect(result.status).toBe(402);
		expect(result.error).toBe("insufficient_credits");
	});

	it("preserves status 502 + route_pipeline_failed", async () => {
		const result = await routeQuestion(
			{ userId: "u1", question: "q" },
			{
				fetchImpl: mockFetch(() => ({
					status: 502,
					body: { error: "route_pipeline_failed", message: "boom" },
				})),
			},
		);
		expect(result.ok).toBe(false);
		expect(result.status).toBe(502);
		expect(result.error).toBe("route_pipeline_failed");
	});
});
