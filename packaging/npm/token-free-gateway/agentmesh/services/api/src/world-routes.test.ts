import { pino } from "pino";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./server.js";
import { buildOfflineBrief, getPythiaWorldUrl, getShadowBrokerConfig } from "./world-routes.js";

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

	it("getShadowBrokerConfig reads env at call time", () => {
		delete process.env.SHADOWBROKER_URL;
		delete process.env.SHADOWBROKER_TOKEN;
		expect(getShadowBrokerConfig()).toBeNull();
		process.env.SHADOWBROKER_URL = "http://gev.example:9000";
		process.env.SHADOWBROKER_LAYERS = "flights, earthquakes";
		const config = getShadowBrokerConfig();
		expect(config?.base).toBe("http://gev.example:9000");
		expect(config?.layers).toEqual(["flights", "earthquakes"]);
		expect(config?.token).toBeUndefined();
		process.env.SHADOWBROKER_TOKEN = "tok-1";
		expect(getShadowBrokerConfig()?.token).toBe("tok-1");
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

describe("World API — PYTHIA /agent/view contract", () => {
	beforeEach(() => {
		process.env.DISABLE_AUTH = "true";
		process.env.PYTHIA_WORLD_URL = "http://localhost:8088";
	});
	afterEach(() => {
		delete process.env.DISABLE_AUTH;
		delete process.env.PYTHIA_WORLD_URL;
		globalThis.fetch = originalFetch;
	});

	// PYTHIA groups events by domain and uses week/month/year horizons. Reading
	// only a flat `events` array made every live payload arrive as zero events,
	// and the panel's unused-horizon tabs stayed empty.
	it("normalises events_by_domain and the week/month/year horizons", async () => {
		globalThis.fetch = (async () =>
			new Response(
				JSON.stringify({
					summary: "Two conflicts active, one flood watch.",
					domains: ["conflict", "disaster"],
					events_by_domain: {
						conflict: [
							{
								id: "evt-a",
								title: "Border skirmish",
								lat: 33.3,
								lng: 44.4,
								salience: 0.8,
								source: "gdelt",
								ts: 1_700_000_000_000,
							},
						],
						disaster: [{ id: "evt-b", title: "Flood watch", lat: 10, lng: 20, salience: 0.45 }],
					},
					event_count: 2,
					predictions: [
						{
							id: "pred-a",
							statement: "Escalation likely",
							horizon: "week",
							probability: 0.71,
							base_probability: 0.4,
							reasoning: "Two independent feeds agree.",
						},
						{ id: "pred-b", title: "Famine risk", horizon: "month", probability: 0.3 },
					],
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			)) as typeof fetch;

		const app = await buildApp({ enableTransport: false, logger: pino({ level: "silent" }) });
		try {
			const res = await app.inject({ method: "GET", url: "/api/world/brief" });
			expect(res.statusCode).toBe(200);
			const body = res.json();

			expect(body.source).toBe("pythia");
			// Both domains survive, each stamped with its group key.
			expect(body.events).toHaveLength(2);
			const conflict = body.events.find((e: { id: string }) => e.id === "evt-a");
			expect(conflict.domain).toBe("conflict");
			expect(conflict.latitude).toBe(33.3);
			expect(conflict.longitude).toBe(44.4);
			expect(conflict.severity).toBe("alert"); // salience 0.8
			expect(conflict.timestamp).toBe(new Date(1_700_000_000_000).toISOString());

			const flood = body.events.find((e: { id: string }) => e.id === "evt-b");
			expect(flood.severity).toBe("watch"); // salience 0.45

			// week -> 1w, month -> 1m
			expect(body.predictions.map((p: { horizon: string }) => p.horizon)).toEqual(["1w", "1m"]);
			expect(body.predictions[0].title).toBe("Escalation likely");
			expect(body.predictions[0].rationale).toBe("Two independent feeds agree.");
			// confidence derived from the distance off base rate
			expect(body.predictions[0].confidence).toBeCloseTo(0.81, 5);
		} finally {
			await app.close();
		}
	});
});
