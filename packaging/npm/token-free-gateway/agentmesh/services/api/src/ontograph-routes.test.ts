import { pino } from "pino";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./server.js";
import { buildOfflineOntograph, entityTypeFor, toEntities } from "./ontograph-routes.js";
import { resetCosmosGraph } from "./cosmos-routes.js";
describe("ontograph-routes helpers", () => {
	afterEach(async () => {
		await resetCosmosGraph();
	});
	it("buildOfflineOntograph is deterministic within the same UTC day", () => {
		const a = buildOfflineOntograph();
		const b = buildOfflineOntograph();
		expect(a.source).toBe("offline");
		expect(a).toEqual(b);
		expect(a.entities.length).toBeGreaterThan(0);
		expect(a.relations.length).toBeGreaterThan(0);
		// Geo entities carry coordinates so the globe can focus on selection.
		const seoul = a.entities.find((e) => e.label === "Seoul");
		expect(seoul?.latitude).toBeTypeOf("number");
		expect(seoul?.longitude).toBeTypeOf("number");
	});
	it("entityTypeFor maps domains to the sidebar's entity types", () => {
		expect(entityTypeFor("geo")).toBe("domain");
		expect(entityTypeFor("event")).toBe("event");
		expect(entityTypeFor("agent")).toBe("agent");
		expect(entityTypeFor("cyber")).toBe("concept");
	});
});
describe("ontograph geo metadata", () => {
	it("maps concept metadata.geo onto entity lat/lng", () => {
		const entities = toEntities([
			{
				id: "geo::seoul",
				label: "Seoul",
				domain: "geo",
				status: "raw",
				signalScore: 0,
				metadata: { geo: { lat: 37.5665, lng: 126.978 } },
			},
			{
				id: "geo::legacy",
				label: "Legacy",
				domain: "geo",
				status: "raw",
				signalScore: 0,
				metadata: { latitude: 51.5074, longitude: -0.1278 },
			},
		]);
		const seoul = entities.find((e) => e.label === "Seoul");
		expect(seoul?.latitude).toBeCloseTo(37.5665);
		expect(seoul?.longitude).toBeCloseTo(126.978);
		// Older events wrote flat lat/lng — replaying an old log must still place it.
		const legacy = entities.find((e) => e.label === "Legacy");
		expect(legacy?.latitude).toBeCloseTo(51.5074);
	});
});

describe("Ontograph API routes", () => {
	beforeEach(() => {
		process.env.DISABLE_AUTH = "true";
	});
	afterEach(async () => {
		delete process.env.DISABLE_AUTH;
		await resetCosmosGraph();
	});
	it("returns the offline snapshot when the cosmos graph is empty", async () => {
		const app = await buildApp({ enableTransport: false, logger: pino({ level: "silent" }) });
		try {
			const res = await app.inject({ method: "GET", url: "/api/ontograph/snapshot" });
			expect(res.statusCode).toBe(200);
			const body = res.json();
			expect(body.source).toBe("offline");
			expect(Array.isArray(body.entities)).toBe(true);
			expect(Array.isArray(body.relations)).toBe(true);
			expect(body.entities.length).toBeGreaterThan(0);
		} finally {
			await app.close();
		}
	});
	it("returns live entities once the cosmos graph has concepts", async () => {
		const app = await buildApp({ enableTransport: false, logger: pino({ level: "silent" }) });
		try {
			const ingest = await app.inject({
				method: "POST",
				url: "/api/pythia/graph/ingest",
				payload: {
					sessionId: "sess-ontograph-1",
					source: "user",
					file: "src/lib/parse_csv.py",
					prompt: "analyze parse_csv and the seoul flood feed",
					response: "parse_csv loads `seoul::rainfall` — related_to the climate risk concept",
				},
			});
			expect([200, 201]).toContain(ingest.statusCode);
			const res = await app.inject({ method: "GET", url: "/api/ontograph/snapshot" });
			expect(res.statusCode).toBe(200);
			const body = res.json();
			expect(body.source).toBe("ontograph");
			expect(body.entities.length).toBeGreaterThan(0);
			// Entity ids must match the panel's SelectedEntity contract fields.
			const first = body.entities[0];
			expect(first).toHaveProperty("id");
			expect(first).toHaveProperty("label");
			expect(first).toHaveProperty("type");
			// Relations must only reference known entities (panel safety filter).
			const ids = new Set(body.entities.map((e: { id: string }) => e.id));
			for (const r of body.relations) {
				expect(ids.has(r.source)).toBe(true);
				expect(ids.has(r.target)).toBe(true);
			}
		} finally {
			await app.close();
		}
	});
	it("health reports offline for an empty graph", async () => {
		const app = await buildApp({ enableTransport: false, logger: pino({ level: "silent" }) });
		try {
			const res = await app.inject({ method: "GET", url: "/api/ontograph/health" });
			expect(res.statusCode).toBe(200);
			const body = res.json();
			expect(body.source).toBe("offline");
			expect(body.concepts).toBe(0);
		} finally {
			await app.close();
		}
	});
});
