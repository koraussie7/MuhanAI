import { pino } from "pino";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./server.js";
import { buildOfflineBrief, getPythiaWorldUrl } from "./world-routes.js";

const originalFetch = globalThis.fetch;

describe("world-routes helpers", () => {
	afterEach(() => {
		delete process.env.PYTHIA_WORLD_URL;
		globalThis.fetch = originalFetch;
	});

	it("getPythiaWorldUrl reads env at call time and strips trailing slashes", () => {
		expect(getPythiaWorldUrl()).toBeNull();
		process.env.PYTHIA_WORLD_URL = "http://localhost:8088/";
		expect(getPythiaWorldUrl()).toBe("http://localhost:8088");
	});

	it("buildOfflineBrief is deterministic within the same UTC hour", () => {
		const a = buildOfflineBrief();
		const b = buildOfflineBrief();
		expect(a.source).toBe("offline");
		expect(a).toEqual(b);
		expect(a.domains.length).toBeGreaterThan(0);
		expect(a.events.length).toBeGreaterThan(0);
		expect(a.predictions.length).toBeGreaterThan(0);
	});
});

describe("World API routes", () => {
	beforeEach(() => {
		process.env.DISABLE_AUTH = "true";
		delete process.env.PYTHIA_WORLD_URL;
	});

	afterEach(() => {
		delete process.env.DISABLE_AUTH;
		delete process.env.PYTHIA_WORLD_URL;
		globalThis.fetch = originalFetch;
	});

	it("returns the offline brief when PYTHIA_WORLD_URL is unset", async () => {
		const app = await buildApp({ enableTransport: false, logger: pino({ level: "silent" }) });
		try {
			const res = await app.inject({ method: "GET", url: "/api/world/brief" });
			expect(res.statusCode).toBe(200);
			const body = res.json();
			expect(body.source).toBe("offline");
			expect(Array.isArray(body.events)).toBe(true);
			expect(Array.isArray(body.predictions)).toBe(true);
		} finally {
			await app.close();
		}
	});

	it("proxies the upstream /agent/view when reachable", async () => {
		process.env.PYTHIA_WORLD_URL = "http://localhost:8088";
		globalThis.fetch = (async (input: string | URL) => {
			const url = String(input);
			if (url.includes("/agent/view")) {
				return new Response(
					JSON.stringify({
						summary: "지진 1건, 시장 안정",
						domains: ["disaster", "markets"],
						events: [
							{
								id: "e1",
								title: "규모 6.0 지진",
								domain: "disaster",
								location: "일본",
								severity: "alert",
								source: "usgs",
								timestamp: new Date().toISOString(),
							},
						],
						predictions: [
							{
								id: "p1",
								title: "여진 가능성",
								horizon: "24h",
								probability: 0.6,
								confidence: 0.7,
								rationale: "규모 6.0 이후 여진 패턴",
							},
						],
					}),
					{ headers: { "content-type": "application/json" } },
				);
			}
			throw new Error(`unexpected fetch: ${url}`);
		}) as unknown as typeof fetch;

		const app = await buildApp({ enableTransport: false, logger: pino({ level: "silent" }) });
		try {
			const res = await app.inject({ method: "GET", url: "/api/world/brief" });
			expect(res.statusCode).toBe(200);
			const body = res.json();
			expect(body.source).toBe("pythia");
			expect(body.summary).toContain("지진");
			expect(body.events[0].severity).toBe("alert");
			expect(body.predictions[0].horizon).toBe("24h");
		} finally {
			await app.close();
		}
	});

	it("filters events by domain and respects the limit", async () => {
		const app = await buildApp({ enableTransport: false, logger: pino({ level: "silent" }) });
		try {
			const res = await app.inject({
				method: "GET",
				url: "/api/world/events?domain=cyber&limit=1",
			});
			expect(res.statusCode).toBe(200);
			const body = res.json();
			expect(body.source).toBe("offline");
			expect(body.events.length).toBeLessThanOrEqual(1);
			expect(body.events[0].domain).toBe("cyber");
		} finally {
			await app.close();
		}
	});

	it("degrades to offline when the upstream is down", async () => {
		process.env.PYTHIA_WORLD_URL = "http://localhost:9999";
		globalThis.fetch = (async () => {
			throw new Error("connection refused");
		}) as unknown as typeof fetch;

		const app = await buildApp({ enableTransport: false, logger: pino({ level: "silent" }) });
		try {
			const res = await app.inject({ method: "GET", url: "/api/world/predictions" });
			expect(res.statusCode).toBe(200);
			expect(res.json().source).toBe("offline");
		} finally {
			await app.close();
		}
	});

	it("reports health as unconfigured without PYTHIA_WORLD_URL", async () => {
		const app = await buildApp({ enableTransport: false, logger: pino({ level: "silent" }) });
		try {
			const res = await app.inject({ method: "GET", url: "/api/world/health" });
			expect(res.statusCode).toBe(200);
			const body = res.json();
			expect(body.configured).toBe(false);
			expect(body.reachable).toBe(false);
		} finally {
			await app.close();
		}
	});
});
