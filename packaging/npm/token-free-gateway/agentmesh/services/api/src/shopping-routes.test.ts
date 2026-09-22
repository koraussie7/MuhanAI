/**
 * Shopping bridge route tests — the HTTP contract the UI depends on.
 *
 * The Python agent is NOT reachable in tests; we only assert what the bridge
 * itself guarantees: validation, the degraded (unset SHOPPING_AGENT_URL) 503,
 * and the job lifecycle shape.
 */
import { pino } from "pino";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetShoppingJobs } from "./shopping-routes.js";
import { buildApp } from "./server.js";

async function makeApp() {
	return buildApp({ enableTransport: false, logger: pino({ level: "silent" }) });
}

describe("Shopping bridge routes", () => {
	beforeEach(() => {
		process.env.DISABLE_AUTH = "true";
		delete process.env.SHOPPING_AGENT_URL;
		resetShoppingJobs();
	});

	afterEach(() => {
		delete process.env.DISABLE_AUTH;
		delete process.env.SHOPPING_AGENT_URL;
	});

	it("answers 503 when the agent is not configured", async () => {
		const app = await makeApp();
		try {
			const res = await app.inject({
				method: "POST",
				url: "/api/shopping/analyze",
				payload: { url: "https://www.amazon.in/dp/B09R4SF5SP" },
			});
			expect(res.statusCode).toBe(503);
			expect(res.json().error).toContain("SHOPPING_AGENT_URL");
		} finally {
			await app.close();
		}
	});

	it("rejects a request without a url", async () => {
		process.env.SHOPPING_AGENT_URL = "http://127.0.0.1:1"; // set so we reach validation
		const app = await makeApp();
		try {
			const res = await app.inject({
				method: "POST",
				url: "/api/shopping/analyze",
				payload: {},
			});
			expect(res.statusCode).toBe(400);
			expect(res.json().error).toContain("url");
		} finally {
			await app.close();
		}
	});

	it("rejects a non-Amazon url", async () => {
		process.env.SHOPPING_AGENT_URL = "http://127.0.0.1:1";
		const app = await makeApp();
		try {
			const res = await app.inject({
				method: "POST",
				url: "/api/shopping/analyze",
				payload: { url: "https://example.com/product/12345" },
			});
			expect(res.statusCode).toBe(400);
			expect(res.json().error).toContain("Amazon");
		} finally {
			await app.close();
		}
	});

	it("accepts a valid Amazon dp url and returns a queued job", async () => {
		process.env.SHOPPING_AGENT_URL = "http://127.0.0.1:1";
		const app = await makeApp();
		try {
			const res = await app.inject({
				method: "POST",
				url: "/api/shopping/analyze",
				payload: { url: "https://www.amazon.in/dp/B09R4SF5SP" },
			});
			expect(res.statusCode).toBe(202);
			const body = res.json();
			expect(body.id).toMatch(/^sa-/);
			// Fire-and-forget: the job may already be running by the time we get the 202.
			expect(["queued", "running"]).toContain(body.status);

			// The job is pollable; the agent call fails fast (port 1) so the job
			// should settle to failed with a human-readable error.
			await new Promise((r) => setTimeout(r, 250));
			const poll = await app.inject({ method: "GET", url: `/api/shopping/analyze/${body.id}` });
			expect(poll.statusCode).toBe(200);
			const job = poll.json();
			expect(["running", "failed"]).toContain(job.status);
		} finally {
			await app.close();
		}
	});

	it("answers 404 for an unknown job id", async () => {
		const app = await makeApp();
		try {
			const res = await app.inject({
				method: "GET",
				url: "/api/shopping/analyze/sa-doesnotexist",
			});
			expect(res.statusCode).toBe(404);
		} finally {
			await app.close();
		}
	});
});
