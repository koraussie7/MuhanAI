/**
 * elizaOS adapter RPC bridge tests — verify the JSON-RPC 2.0 contract
 * that the elizaOS adapter client (`packages/elizaos-adapter/src/rpc.ts`)
 * depends on.
 */
import { pino } from "pino";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./server.js";

async function makeApp() {
	return buildApp({ enableTransport: false, logger: pino({ level: "silent" }) });
}

describe("elizaOS RPC bridge", () => {
	beforeEach(() => {
		process.env.DISABLE_AUTH = "true";
	});

	afterEach(() => {
		delete process.env.DISABLE_AUTH;
	});

	it("responds to cast.run with a JSON-RPC 2.0 result", async () => {
		const app = await makeApp();
		try {
			const res = await app.inject({
				method: "POST",
				url: "/rpc/cast.run",
				payload: {
					jsonrpc: "2.0",
					id: "test-1",
					method: "cast.run",
					params: { prompt: "What is the capital of France?", agents: ["agent-a"] },
				},
			});

			expect(res.statusCode).toBe(200);
			const body = res.json();
			expect(body.jsonrpc).toBe("2.0");
			expect(body.id).toBe("test-1");
			expect(body.result).toBeDefined();
			expect(body.result.requestId).toBeTruthy();
			expect(body.result.results).toHaveLength(1);
			expect(body.result.results[0].agentId).toBe("agent-a");
		} finally {
			await app.close();
		}
	});

	it("returns -32601 for unknown method", async () => {
		const app = await makeApp();
		try {
			const res = await app.inject({
				method: "POST",
				url: "/rpc/nonexistent.method",
				payload: { jsonrpc: "2.0", id: 1, method: "nonexistent.method", params: {} },
			});

			expect(res.statusCode).toBe(404);
			const body = res.json();
			expect(body.error.code).toBe(-32601);
		} finally {
			await app.close();
		}
	});

	it("returns -32700 for invalid JSON-RPC envelope", async () => {
		const app = await makeApp();
		try {
			const res = await app.inject({
				method: "POST",
				url: "/rpc/cast.run",
				payload: { jsonrpc: "1.0", id: 1, method: "cast.run", params: {} },
			});

			expect(res.statusCode).toBe(400);
			const body = res.json();
			expect(body.error.code).toBe(-32700);
		} finally {
			await app.close();
		}
	});

	it("returns -32600 when body method mismatches URL method", async () => {
		const app = await makeApp();
		try {
			const res = await app.inject({
				method: "POST",
				url: "/rpc/cast.run",
				payload: { jsonrpc: "2.0", id: 1, method: "reputation.get", params: {} },
			});

			expect(res.statusCode).toBe(400);
			const body = res.json();
			expect(body.error.code).toBe(-32600);
		} finally {
			await app.close();
		}
	});

	it("reputation.get returns default snapshot for unknown peer", async () => {
		const app = await makeApp();
		try {
			const res = await app.inject({
				method: "POST",
				url: "/rpc/reputation.get",
				payload: {
					jsonrpc: "2.0",
					id: "rep-1",
					method: "reputation.get",
					params: { peerId: "peer-unknown" },
				},
			});

			expect(res.statusCode).toBe(200);
			const body = res.json();
			expect(body.result.peerId).toBe("peer-unknown");
			expect(body.result.score).toBe(0.5);
		} finally {
			await app.close();
		}
	});

	it("reputation.get requires peerId", async () => {
		const app = await makeApp();
		try {
			const res = await app.inject({
				method: "POST",
				url: "/rpc/reputation.get",
				payload: { jsonrpc: "2.0", id: 1, method: "reputation.get", params: {} },
			});

			expect(res.statusCode).toBe(500);
			const body = res.json();
			expect(body.error.code).toBe(-32000);
			expect(body.error.message).toContain("peerId is required");
		} finally {
			await app.close();
		}
	});

	it("credits.record records a credit grant", async () => {
		const app = await makeApp();
		try {
			const res = await app.inject({
				method: "POST",
				url: "/rpc/credits.record",
				payload: {
					jsonrpc: "2.0",
					id: "credit-1",
					method: "credits.record",
					params: {
						amount: 100,
						reason: "contribution",
						idempotencyKey: "key-1",
						metadata: null,
					},
				},
			});

			expect(res.statusCode).toBe(200);
			const body = res.json();
			expect(body.result.amount).toBe("100");
			expect(body.result.reason).toBe("contribution");
		} finally {
			await app.close();
		}
	});

	it("pulse.broadcast returns ok for valid envelope", async () => {
		const app = await makeApp();
		try {
			const res = await app.inject({
				method: "POST",
				url: "/rpc/pulse.broadcast",
				payload: {
					jsonrpc: "2.0",
					id: 1,
					method: "pulse.broadcast",
					params: {
						envelope: {
							v: 1,
							peerId: "peer-1",
							nonce: 1,
							ts: Date.now(),
						},
					},
				},
			});

			expect(res.statusCode).toBe(200);
			const body = res.json();
			expect(body.result.ok).toBe(true);
		} finally {
			await app.close();
		}
	});

	it("pulse.broadcast requires envelope.peerId", async () => {
		const app = await makeApp();
		try {
			const res = await app.inject({
				method: "POST",
				url: "/rpc/pulse.broadcast",
				payload: {
					jsonrpc: "2.0",
					id: 1,
					method: "pulse.broadcast",
					params: { envelope: { v: 1, nonce: 1, ts: Date.now() } },
				},
			});

			expect(res.statusCode).toBe(500);
			const body = res.json();
			expect(body.error.code).toBe(-32000);
			expect(body.error.message).toContain("peerId is required");
		} finally {
			await app.close();
		}
	});
});
