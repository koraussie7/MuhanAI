import { pino } from "pino";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../server.js";
import { DEFAULT_CONFIG, ResonanceGovernor } from "./governor.js";
import { deterministicEmbedding, isValidEmbedding, rankCorpus } from "./ranking.js";

const EMBED_DIM = 768;

describe("ranking helpers", () => {
	it("rejects invalid embeddings", () => {
		expect(isValidEmbedding(null)).toBe(false);
		expect(isValidEmbedding([])).toBe(false);
		expect(isValidEmbedding(new Array(EMBED_DIM).fill(NaN))).toBe(false);
		expect(isValidEmbedding(new Array(EMBED_DIM - 1).fill(0.1))).toBe(false);
	});

	it("produces a 768-dim unit-norm deterministic embedding", () => {
		const e = deterministicEmbedding("hello world");
		expect(e.length).toBe(EMBED_DIM);
		let norm = 0;
		for (const v of e) norm += v * v;
		norm = Math.sqrt(norm);
		expect(Math.abs(norm - 1)).toBeLessThan(1e-9);
	});

	it("is deterministic for the same input", () => {
		const a = deterministicEmbedding("agentmesh resonance governor");
		const b = deterministicEmbedding("agentmesh resonance governor");
		expect(a).toEqual(b);
	});

	it("ranks identical text above different text", () => {
		const query = deterministicEmbedding("agentmesh governance");
		const corpus = [
			{ id: "a", text: "agentmesh governance autonomy dial" },
			{ id: "b", text: "completely unrelated topic about cats and dogs" },
			{ id: "c", text: "governance governor autonomy" },
		];
		const ranked = rankCorpus(query, corpus, { topK: 3 });
		expect(ranked.length).toBe(3);
		expect(ranked[0]?.rank).toBe(1);
		expect(ranked[0]?.id).toBe("a");
	});

	it("filters by minScore", () => {
		const query = deterministicEmbedding("alpha");
		const corpus = [
			{ id: "x", text: "alpha" },
			{ id: "y", text: "zzzzzzz" },
		];
		const ranked = rankCorpus(query, corpus, { topK: 5, minScore: 0.99 });
		expect(ranked.length).toBeLessThanOrEqual(1);
	});

	it("uses supplied embedding when present", () => {
		const fakeEmbedding = new Array(EMBED_DIM).fill(0);
		fakeEmbedding[0] = 1;
		const ranked = rankCorpus(fakeEmbedding, [
			{ id: "a", text: "ignored", embedding: fakeEmbedding },
		]);
		expect(ranked[0]?.score).toBeCloseTo(1, 6);
	});
});

describe("ResonanceGovernor (in-process)", () => {
	it("defaults to suggest dial and sane config", () => {
		const g = new ResonanceGovernor();
		const dial = g.getDial();
		expect(dial.level).toBe("suggest");
		expect(g.getState().config.dailyActionCap).toBe(DEFAULT_CONFIG.dailyActionCap);
	});

	it("allows in autopilot and increments dailyCount", () => {
		const g = new ResonanceGovernor(
			{ level: "autopilot", updatedAt: new Date().toISOString(), updatedBy: "test" },
			DEFAULT_CONFIG,
		);
		const r = g.check({ action: "read", subject: "doc-1" });
		expect(r.allowed).toBe(true);
		expect(r.reason).toBe("autopilot");
		expect(r.usage.dailyCount).toBe(1);
	});

	it("denies in suggest until confirmed", () => {
		const g = new ResonanceGovernor(
			{ level: "suggest", updatedAt: new Date().toISOString(), updatedBy: "test" },
			DEFAULT_CONFIG,
		);
		const r = g.check({ action: "execute", subject: "task-1" });
		expect(r.allowed).toBe(true);
		expect(r.reason).toContain("suggest");
		expect(r.usage.dailyCount).toBe(0);

		g.confirm("execute", "task-1");
		expect(g.getState().dailyCount).toBe(1);
	});

	it("denies in off", () => {
		const g = new ResonanceGovernor(
			{ level: "off", updatedAt: new Date().toISOString(), updatedBy: "test" },
			DEFAULT_CONFIG,
		);
		const r = g.check({ action: "read", subject: "x" });
		expect(r.allowed).toBe(false);
		expect(r.reason).toContain("off");
	});

	it("honours per-action overrides", () => {
		const g = new ResonanceGovernor(
			{
				level: "off",
				perAction: { read: "autopilot" },
				updatedAt: new Date().toISOString(),
				updatedBy: "test",
			},
			DEFAULT_CONFIG,
		);
		expect(g.effectiveLevel("read")).toBe("autopilot");
		expect(g.effectiveLevel("execute")).toBe("off");
	});

	it("enforces daily action cap", () => {
		const g = new ResonanceGovernor(
			{ level: "autopilot", updatedAt: new Date().toISOString(), updatedBy: "test" },
			{ ...DEFAULT_CONFIG, dailyActionCap: 2 },
		);
		g.check({ action: "read", subject: "a" });
		g.check({ action: "read", subject: "b" });
		const r = g.check({ action: "read", subject: "c" });
		expect(r.allowed).toBe(false);
		expect(r.reason).toContain("daily action cap");
	});

	it("dedups within window", () => {
		const g = new ResonanceGovernor(
			{ level: "autopilot", updatedAt: new Date().toISOString(), updatedBy: "test" },
			{ ...DEFAULT_CONFIG, dedupWindowMs: 60_000 },
		);
		const first = g.check({ action: "broadcast", subject: "topic-1" });
		expect(first.allowed).toBe(true);
		const dup = g.check({ action: "broadcast", subject: "topic-1" });
		expect(dup.allowed).toBe(false);
		expect(dup.reason).toContain("duplicate");
	});

	it("honours global kill-switch", () => {
		const g = new ResonanceGovernor(
			{ level: "autopilot", updatedAt: new Date().toISOString(), updatedBy: "test" },
			DEFAULT_CONFIG,
		);
		g.updateConfig({ killSwitch: true });
		const r = g.check({ action: "read", subject: "x" });
		expect(r.allowed).toBe(false);
		expect(r.reason).toContain("global kill-switch");
	});

	it("honours per-action kill-switch", () => {
		const g = new ResonanceGovernor(
			{ level: "autopilot", updatedAt: new Date().toISOString(), updatedBy: "test" },
			DEFAULT_CONFIG,
		);
		g.updateConfig({ killSwitchPerAction: { settle: true } });
		const r = g.check({ action: "settle", subject: "trade-1" });
		expect(r.allowed).toBe(false);
		expect(r.reason).toContain("kill-switch is on for action settle");
	});

	it("rejects negative dailyActionCap", () => {
		const g = new ResonanceGovernor();
		expect(() => g.updateConfig({ dailyActionCap: -1 })).toThrow();
	});

	it("setDial records updatedAt and updatedBy", () => {
		const g = new ResonanceGovernor();
		const before = Date.now();
		const dial = g.setDial("autopilot", "tester");
		expect(dial.level).toBe("autopilot");
		expect(dial.updatedBy).toBe("tester");
		expect(new Date(dial.updatedAt).getTime()).toBeGreaterThanOrEqual(before);
	});
});

describe("resonance routes", () => {
	const originalEnv = { ...process.env };
	let app: Awaited<ReturnType<typeof buildApp>> | undefined;

	beforeEach(async () => {
		process.env.DISABLE_AUTH = "true";
		process.env.NODE_ENV = "development";
		process.env.RESONANCE_ENABLED = "true";
		app = await buildApp({ logger: pino({ level: "silent" }) });
		// Reset the singleton governor so tests don't leak state into each other
		// (the integration uses an in-process singleton by design — mirrors
		// Resonance's own behaviour).
		await app.inject({
			method: "POST",
			url: "/api/integrations/resonance/autonomy/reset",
		});
		await app.inject({
			method: "PUT",
			url: "/api/integrations/resonance/governor",
			payload: {
				dailyActionCap: 1000,
				dedupWindowMs: 60000,
				killSwitch: false,
				killSwitchPerAction: {},
			},
		});
	});

	afterEach(async () => {
		if (app) {
			await app.close();
			app = undefined;
		}
		process.env = { ...originalEnv };
	});

	it("returns 404 when feature flag is disabled", async () => {
		process.env.RESONANCE_ENABLED = "false";
		const localApp = await buildApp({ logger: pino({ level: "silent" }) });
		const res = await localApp.inject({
			method: "GET",
			url: "/api/integrations/resonance/status",
		});
		expect(res.statusCode).toBe(404);
		await localApp.close();
	});

	it("status returns default state when enabled", async () => {
		const res = await app?.inject({ method: "GET", url: "/api/integrations/resonance/status" });
		expect(res?.statusCode).toBe(200);
		const body = res?.json();
		expect(body.enabled).toBe(true);
		expect(body.embeddingDim).toBe(EMBED_DIM);
		expect(body.autonomy.level).toBe("suggest");
	});

	it("search ranks corpus by deterministic embedding when client embedding absent", async () => {
		const res = await app?.inject({
			method: "POST",
			url: "/api/integrations/resonance/search",
			payload: {
				query: "agentmesh governance autonomy",
				corpus: [
					{ id: "a", text: "agentmesh governance autonomy dial" },
					{ id: "b", text: "totally unrelated topic about gardening" },
				],
				topK: 2,
			},
		});
		expect(res?.statusCode).toBe(200);
		const body = res?.json();
		expect(body.embeddingSource).toBe("deterministic");
		expect(body.results[0].id).toBe("a");
	});

	it("search uses client embedding when supplied", async () => {
		const fakeEmbedding = new Array(EMBED_DIM).fill(0);
		fakeEmbedding[0] = 1;
		const res = await app?.inject({
			method: "POST",
			url: "/api/integrations/resonance/search",
			payload: {
				query: "ignored",
				queryEmbedding: fakeEmbedding,
				corpus: [{ id: "a", text: "anything", embedding: fakeEmbedding }],
			},
		});
		expect(res?.statusCode).toBe(200);
		const body = res?.json();
		expect(body.embeddingSource).toBe("client");
		expect(body.results[0].score).toBeCloseTo(1, 4);
	});

	it("search rejects empty corpus", async () => {
		const res = await app?.inject({
			method: "POST",
			url: "/api/integrations/resonance/search",
			payload: { query: "x", corpus: [] },
		});
		expect(res?.statusCode).toBe(400);
	});

	it("autonomy PUT updates level", async () => {
		const res = await app?.inject({
			method: "PUT",
			url: "/api/integrations/resonance/autonomy",
			payload: { level: "autopilot" },
			headers: { "x-resonance-actor": "admin:1" },
		});
		expect(res?.statusCode).toBe(200);
		const body = res?.json();
		expect(body.level).toBe("autopilot");
		expect(body.updatedBy).toBe("admin:1");
	});

	it("governor PUT updates config", async () => {
		const res = await app?.inject({
			method: "PUT",
			url: "/api/integrations/resonance/governor",
			payload: { dailyActionCap: 5, killSwitch: true },
		});
		expect(res?.statusCode).toBe(200);
		const body = res?.json();
		expect(body.config.dailyActionCap).toBe(5);
		expect(body.config.killSwitch).toBe(true);
	});

	it("governor PUT rejects negative cap", async () => {
		const res = await app?.inject({
			method: "PUT",
			url: "/api/integrations/resonance/governor",
			payload: { dailyActionCap: -1 },
		});
		expect(res?.statusCode).toBe(400);
	});

	it("governor check returns denied reason under global kill-switch", async () => {
		await app?.inject({
			method: "PUT",
			url: "/api/integrations/resonance/governor",
			payload: { killSwitch: true },
		});
		const res = await app?.inject({
			method: "POST",
			url: "/api/integrations/resonance/governor/check",
			payload: { action: "read", subject: "x" },
		});
		expect(res?.statusCode).toBe(200);
		const body = res?.json();
		expect(body.allowed).toBe(false);
		expect(body.reason).toContain("kill-switch");
	});

	it("governor check allows autopilot and records dailyCount", async () => {
		await app?.inject({
			method: "PUT",
			url: "/api/integrations/resonance/autonomy",
			payload: { level: "autopilot" },
		});
		const res = await app?.inject({
			method: "POST",
			url: "/api/integrations/resonance/governor/check",
			payload: { action: "execute", subject: "job-1" },
		});
		expect(res?.statusCode).toBe(200);
		const body = res?.json();
		expect(body.allowed).toBe(true);
		expect(body.usage.dailyCount).toBe(1);
	});

	it("governor confirm records a confirmed action in suggest mode", async () => {
		await app?.inject({
			method: "PUT",
			url: "/api/integrations/resonance/autonomy",
			payload: { level: "suggest" },
		});
		const baseline = await app?.inject({
			method: "GET",
			url: "/api/integrations/resonance/governor",
		});
		const baselineCount = baseline?.json().dailyCount ?? 0;

		const check = await app?.inject({
			method: "POST",
			url: "/api/integrations/resonance/governor/check",
			payload: { action: "execute", subject: "task-7" },
		});
		expect(check?.json().allowed).toBe(true);
		// Suggest mode returns allowed=true but does NOT increment dailyCount
		// until the caller confirms. The check itself is read-only.
		expect(check?.json().usage.dailyCount).toBe(baselineCount);

		const confirm = await app?.inject({
			method: "POST",
			url: "/api/integrations/resonance/governor/confirm",
			payload: { action: "execute", subject: "task-7" },
		});
		expect(confirm?.statusCode).toBe(201);
		expect(confirm?.json().recorded.allowed).toBe(true);
		expect(confirm?.json().recorded.action).toBe("execute");

		const after = await app?.inject({
			method: "GET",
			url: "/api/integrations/resonance/governor",
		});
		expect(after?.json().dailyCount).toBe(baselineCount + 1);
	});

	it("autonomy reset returns to default", async () => {
		await app?.inject({
			method: "PUT",
			url: "/api/integrations/resonance/autonomy",
			payload: { level: "autopilot" },
		});
		const res = await app?.inject({
			method: "POST",
			url: "/api/integrations/resonance/autonomy/reset",
		});
		expect(res?.statusCode).toBe(200);
		expect(res?.json().level).toBe("suggest");
	});
});
