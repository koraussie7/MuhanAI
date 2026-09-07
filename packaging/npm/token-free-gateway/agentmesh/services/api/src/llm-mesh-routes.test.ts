import { pino } from "pino";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./server.js";

const originalEnv = { ...process.env };

describe("GET /api/llm-mesh", () => {
	let app: Awaited<ReturnType<typeof buildApp>> | undefined;

	beforeEach(async () => {
		process.env.DISABLE_AUTH = "true";
		process.env.NODE_ENV = "development";
		app = await buildApp({
			logger: pino({ level: "silent" }),
			enableTransport: false,
		});
	});

	afterEach(async () => {
		if (app) {
			await app.close();
			app = undefined;
		}
		process.env = { ...originalEnv };
	});

	it("returns a snapshot with gateways, routes, and vault arrays", async () => {
		const res = await app!.inject({ method: "GET", url: "/api/llm-mesh" });
		expect(res.statusCode).toBe(200);

		const body = res.json() as {
			gateways: Array<{ name: string; status: string }>;
			routes: Array<{ provider: string; status: string }>;
			vault: Array<{ name: string; quota: number; used: number }>;
		};

		expect(Array.isArray(body.gateways)).toBe(true);
		expect(body.gateways.length).toBeGreaterThan(0);
		expect(body.gateways.every((g) => typeof g.name === "string")).toBe(true);

		expect(Array.isArray(body.routes)).toBe(true);
		expect(body.routes.length).toBeGreaterThan(0);
		expect(body.routes.every((r) => ["optimal", "acceptable", "degraded"].includes(r.status))).toBe(
			true,
		);

		expect(Array.isArray(body.vault)).toBe(true);
		expect(body.vault.every((v) => v.quota > 0 && v.used >= 0 && v.used <= v.quota)).toBe(true);
	});

	it("keeps all latencies within a plausible ms range across many calls", async () => {
		// Sample 5 snapshots and verify the latency distribution stays inside
		// the expected jitter envelope. We don't assert specific values
		// because jitter is random — only structural invariants.
		for (let i = 0; i < 5; i++) {
			const res = await app!.inject({ method: "GET", url: "/api/llm-mesh" });
			const body = res.json() as {
				gateways: Array<{ latencyMs: number; costTier: string; status: string }>;
			};
			for (const g of body.gateways) {
				expect(Number.isFinite(g.latencyMs)).toBe(true);
				expect(g.latencyMs).toBeGreaterThan(0);
				expect(g.latencyMs).toBeLessThan(2000); // nothing above 2s is "live"
				// Degraded gateways must have higher latency than healthy ones
				// (verifies the routing in `statusFor` → jitter).
				if (g.status === "degraded") {
					expect(g.latencyMs).toBeGreaterThan(200);
				}
			}
		}
	});

	it("requires the x-api-key header in production", async () => {
		process.env.NODE_ENV = "production";
		process.env.API_KEY = "test-key-12345";
		const prodApp = await buildApp({
			logger: pino({ level: "silent" }),
			enableTransport: false,
		});
		try {
			const noKey = await prodApp.inject({ method: "GET", url: "/api/llm-mesh" });
			expect(noKey.statusCode).toBe(401);

			const withKey = await prodApp.inject({
				method: "GET",
				url: "/api/llm-mesh",
				headers: { "x-api-key": "test-key-12345" },
			});
			expect(withKey.statusCode).toBe(200);
		} finally {
			await prodApp.close();
		}
	});
});
