/**
 * End-to-end test for the OmniRoute free-tier proxy routes.
 *
 * Covers:
 *   - GET /api/omniroute/free-tiers -> always returns a payload (live OR fallback)
 *   - GET /api/omniroute/health     -> reachable flag flips with the env var
 *   - Aggregate `monthlyTokensFormatted` is in the human-friendly form
 *   - All entries have provider/limit/used/remaining/resetAt/tier
 *
 * The OmniRoute MCP binary is intentionally NOT present in CI, so the route
 * is expected to fall back to the deterministic stub. The test asserts that
 * fallback shape, NOT the live shape — that one is exercised manually via
 * `pnpm dev` against a real `omniroute-mcp-server`.
 */

import { pino } from "pino";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./server.js";

// We share a single vitest fork with the rest of services/api, so process
// mutations here leak into sibling suites (API_KEY auth tests). Snapshot the
// relevant envs at module load time and restore them after every test.
const ENV_SNAPSHOT = {
	API_KEY: process.env.API_KEY,
	DISABLE_AUTH: process.env.DISABLE_AUTH,
	NODE_ENV: process.env.NODE_ENV,
	OMNIROUTE_DISABLED: process.env.OMNIROUTE_DISABLED,
} as const;

function restoreEnv(): void {
	for (const [key, value] of Object.entries(ENV_SNAPSHOT)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
}

interface ProviderQuota {
	provider: string;
	limit: number;
	used: number;
	remaining: number;
	resetAt: string;
	tier: "free" | "metered";
}

interface FreeTiersBody {
	source: "omniroute" | "fallback";
	aggregate: {
		monthlyTokens: number;
		monthlyTokensFormatted: string;
		providersOnline: number;
	};
	providers: ProviderQuota[];
	fetchedAt: string;
}

describe("GET /api/omniroute/free-tiers — Dashboard widget proxy", () => {
	let app: Awaited<ReturnType<typeof buildApp>> | undefined;

	beforeEach(async () => {
		process.env.DISABLE_AUTH = "true";
		process.env.NODE_ENV = "development";
		// Force the disabled path so we always hit the fallback branch — keeps
		// the test deterministic regardless of whether a developer happens to
		// have `omniroute-mcp-server` installed locally.
		process.env.OMNIROUTE_DISABLED = "1";
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
		restoreEnv();
	});

	it("returns a 16-provider free-tier snapshot with live-or-fallback source flag", async () => {
		if (!app) throw new Error("app not built");
		const res = await app.inject({
			method: "GET",
			url: "/api/omniroute/free-tiers",
		});
		expect(res.statusCode).toBe(200);
		const body = res.json() as FreeTiersBody;

		expect(["omniroute", "fallback"]).toContain(body.source);
		expect(body.aggregate.monthlyTokens).toBeGreaterThan(0);
		// The UI shows the formatted form, so it must look human-friendly
		// (one of the K/M/B suffixes; never a raw integer dump).
		expect(body.aggregate.monthlyTokensFormatted).toMatch(/^[0-9.]+[KMB]$/);

		expect(Array.isArray(body.providers)).toBe(true);
		// At least the 16 static providers from the fallback. A real OmniRoute
		// usually returns more (350+ across all tiers); we just assert minimum
		// coverage here.
		expect(body.providers.length).toBeGreaterThanOrEqual(16);

		for (const p of body.providers) {
			expect(p.provider).toBeTruthy();
			expect(p.limit).toBeGreaterThan(0);
			expect(p.used).toBeGreaterThanOrEqual(0);
			expect(p.remaining).toBe(p.limit - p.used);
			expect(p.resetAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
			expect(p.tier).toBe("free");
		}

		// Used fraction lives in [0.18, 0.82] for the fallback — guarantees the
		// progress bar in the UI always has something to draw, but never appears
		// saturated on the public landing page.
		if (body.source === "fallback") {
			for (const p of body.providers) {
				const fraction = p.used / p.limit;
				expect(fraction).toBeGreaterThanOrEqual(0.17);
				expect(fraction).toBeLessThanOrEqual(0.83);
			}
		}

		expect(body.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});

	it("returns the same usage within the same hour (deterministic stub)", async () => {
		if (!app) throw new Error("app not built");
		const a = (
			await app.inject({ method: "GET", url: "/api/omniroute/free-tiers" })
		).json() as FreeTiersBody;
		const b = (
			await app.inject({ method: "GET", url: "/api/omniroute/free-tiers" })
		).json() as FreeTiersBody;

		// The stub is seeded by hour; consecutive calls in the same hour match.
		expect(a.source).toBe(b.source);
		if (a.source === "fallback" && b.source === "fallback") {
			expect(a.providers.map((p) => p.used)).toEqual(b.providers.map((p) => p.used));
		}
	});

	it("rejects malformed query with a 400", async () => {
		if (!app) throw new Error("app not built");
		const res = await app.inject({
			method: "GET",
			url: "/api/omniroute/free-tiers?asOf=not-a-date",
		});
		expect(res.statusCode).toBe(400);
		const body = res.json() as { error: string };
		expect(body.error).toMatch(/asOf/i);
	});
});

describe("GET /api/omniroute/health — upstream reachability flag", () => {
	let app: Awaited<ReturnType<typeof buildApp>> | undefined;

	beforeEach(async () => {
		process.env.DISABLE_AUTH = "true";
		process.env.NODE_ENV = "development";
		process.env.OMNIROUTE_DISABLED = "1";
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
		restoreEnv();
	});

	it("reports reachable=false when OMNIROUTE_DISABLED is set", async () => {
		if (!app) throw new Error("app not built");
		const res = await app.inject({
			method: "GET",
			url: "/api/omniroute/health",
		});
		expect(res.statusCode).toBe(200);
		const body = res.json() as { reachable: boolean; checkedAt: string };
		expect(body.reachable).toBe(false);
		expect(body.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});
});
