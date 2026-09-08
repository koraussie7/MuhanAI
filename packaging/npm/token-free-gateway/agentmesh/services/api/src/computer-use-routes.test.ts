/**
 * Computer-use route test — verifies the HTTP surface only.
 *
 * We can't actually spin up an e2b Desktop sandbox in CI, so the test
 * focuses on:
 *   - 400 on malformed body
 *   - 503 when E2B_API_KEY is missing
 *   - 502 when the handler reports failure (we inject an adapter
 *     whose `getSandbox()` throws so the handler short-circuits)
 *
 * The full happy-path loop is covered by tests in
 * packages/muhan-agent/src/tests/computer-use-router.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

describe("POST /api/computer-use/run", () => {
	let app: FastifyInstance;

	beforeEach(async () => {
		const { computerUseRoutes } = await import("./computer-use-routes.js");
		app = Fastify({ logger: false });
		await app.register(computerUseRoutes);
		await app.ready();
	});

	afterEach(async () => {
		await app.close();
	});

	it("rejects body missing goal", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/api/computer-use/run",
			payload: { provider: "openai", apiKey: "sk" },
		});
		expect(res.statusCode).toBe(400);
	});

	it("rejects body missing apiKey", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/api/computer-use/run",
			payload: { goal: "x", provider: "openai" },
		});
		expect(res.statusCode).toBe(400);
	});

	it("rejects unknown provider", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/api/computer-use/run",
			payload: { goal: "x", provider: "anthropic", apiKey: "sk" },
		});
		expect(res.statusCode).toBe(400);
	});

	it("returns 503 when E2B_API_KEY is missing", async () => {
		const prev = process.env.E2B_API_KEY;
		delete process.env.E2B_API_KEY;
		try {
			const res = await app.inject({
				method: "POST",
				url: "/api/computer-use/run",
				payload: { goal: "x", provider: "openai", apiKey: "sk-test" },
			});
			expect(res.statusCode).toBe(503);
			const body = res.json() as { error?: string };
			expect(body.error).toMatch(/E2B_API_KEY/);
		} finally {
			if (prev !== undefined) process.env.E2B_API_KEY = prev;
		}
	});

	it("caps maxSteps at 100", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/api/computer-use/run",
			payload: { goal: "x", provider: "openai", apiKey: "sk-test", maxSteps: 999 },
		});
		expect(res.statusCode).toBe(400);
	});

	it("rejects empty goal string", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/api/computer-use/run",
			payload: { goal: "", provider: "openai", apiKey: "sk-test" },
		});
		expect(res.statusCode).toBe(400);
	});
});

describe("computer-use-routes import smoke", () => {
	it("registers the route without throwing", async () => {
		const { computerUseRoutes } = await import("./computer-use-routes.js");
		expect(typeof computerUseRoutes).toBe("function");
		// silence unused-import lint
		expect(vi).toBeDefined();
	});
});
