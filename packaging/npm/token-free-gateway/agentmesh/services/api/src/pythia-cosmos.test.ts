import { pino } from "pino";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetCosmosGraph } from "./cosmos-routes.js";
import { buildApp } from "./server.js";

/**
 * Core integration question this file answers:
 *
 *   Does data produced through Pythia (by users and by agents) flow into the
 *   cosmic knowledge graph, and does the graph *derive new data* from it —
 *   merged concepts, new relations, amplified significance?
 */

const API_KEY = "test-api-key";
const authHeaders = { "x-api-key": API_KEY, "content-type": "application/json" };

function userAnalysis(sessionId: string) {
	return {
		sessionId,
		actorId: "user-brian",
		source: "user",
		file: "parser.py",
		prompt: "이 CSV 파서의 버그를 찾아줘",
		response:
			"Line 12 uses `csv.DictReader` incorrectly. Refactor `parse_csv` so the file handle is always closed.",
	};
}

function agentAnalysis(sessionId: string) {
	return {
		sessionId,
		actorId: "agent-atlas",
		source: "agent",
		file: "etl_job.py",
		prompt: "Refactor this ETL job to reuse the parser module.",
		response:
			"Extract `parse_csv` into a shared module and reuse it in `etl_job` for the nightly run.",
	};
}

async function ingest(
	app: Awaited<ReturnType<typeof buildApp>>,
	payload: Record<string, unknown>,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
	const res = await app.inject({
		method: "POST",
		url: "/api/pythia/graph/ingest",
		headers: authHeaders,
		payload,
	});
	return { statusCode: res.statusCode, body: res.json() as Record<string, unknown> };
}

describe("Pythia → cosmic knowledge graph", () => {
	beforeEach(async () => {
		process.env.API_KEY = API_KEY;
		await resetCosmosGraph();
	});

	afterEach(() => {
		delete process.env.API_KEY;
	});

	it("user and agent Pythia data land as concepts and merge onto one identity", async () => {
		const app = await buildApp({ enableTransport: false, logger: pino({ level: "silent" }) });

		const userRes = await ingest(app, userAnalysis("sess-user-1"));
		expect(userRes.statusCode).toBe(201);
		expect(userRes.body.recorded).toBe(true);
		expect(userRes.body.derivedRelations).toBeGreaterThan(0);

		const agentRes = await ingest(app, agentAnalysis("sess-agent-1"));
		expect(agentRes.statusCode).toBe(201);

		const res = await app.inject({
			method: "GET",
			url: "/api/pythia/graph/concepts",
			headers: authHeaders,
		});
		const concepts = (res.json() as { concepts: Array<Record<string, unknown>> }).concepts;

		// The same function named by a user and an agent collapses onto ONE node.
		const merged = concepts.find((c) => c.id === "python::parse_csv");
		expect(merged).toBeDefined();
		expect(merged?.upstreamIds).toContain("sess-user-1");
		expect(merged?.upstreamIds).toContain("sess-agent-1");

		// The analyzed file also becomes a concept.
		expect(concepts.find((c) => c.id === "pythia_file::parser.py")).toBeDefined();
	});

	it("co-occurrence derivation creates related_to edges the LLM never stated", async () => {
		const app = await buildApp({ enableTransport: false, logger: pino({ level: "silent" }) });
		await ingest(app, userAnalysis("sess-user-1"));
		await ingest(app, agentAnalysis("sess-agent-1"));

		const res = await app.inject({
			method: "GET",
			url: "/api/pythia/graph/relations",
			headers: authHeaders,
		});
		const relations = (res.json() as { relations: Array<Record<string, unknown>> }).relations;

		// Derived from the user analysis: parse_csv was co-mentioned with csv.DictReader.
		// (Pair direction follows mention order in the analysis text.)
		const userDerived = relations.find(
			(r) =>
				r.predicate === "related_to" &&
				((r.sourceId === "python::parse_csv" && r.targetId === "python::csv.dictreader") ||
					(r.sourceId === "python::csv.dictreader" && r.targetId === "python::parse_csv")),
		);
		expect(userDerived).toBeDefined();
		expect(userDerived?.predicate).toBe("related_to");
		expect(userDerived?.proposalCount).toBeGreaterThanOrEqual(1);
		expect(userDerived?.strength).toBeGreaterThan(0);

		// Derived from the agent analysis: parse_csv co-mentioned with etl_job.py.
		const agentDerived = relations.find(
			(r) =>
				r.predicate === "related_to" &&
				((r.sourceId === "python::parse_csv" && r.targetId === "pythia_file::etl_job.py") ||
					(r.sourceId === "pythia_file::etl_job.py" && r.targetId === "python::parse_csv")),
		);
		expect(agentDerived).toBeDefined();
	});

	it("reactions from distinct users and agents amplify and promote the concept", async () => {
		const app = await buildApp({ enableTransport: false, logger: pino({ level: "silent" }) });
		await ingest(app, userAnalysis("sess-user-1"));
		const targetId = "python::parse_csv";

		const react = async (actorId: string) =>
			app.inject({
				method: "POST",
				url: "/api/pythia/graph/react",
				headers: authHeaders,
				payload: { targetId, reaction: "confirm", actorId },
			});

		await react("user-1");
		await react("user-2");
		const last = await react("agent-1");
		expect(last.statusCode).toBe(200);

		const lastBody = last.json() as {
			breakdown: { signalScore: number; signals: string[] };
			effectiveStatus: string;
		};

		// Derived data #1: an explainable significance score.
		expect(lastBody.breakdown.signalScore).toBeGreaterThan(0.25);
		// Derived data #2: the cross-agent signal fired — multiple actors reacted.
		expect(lastBody.breakdown.signals).toContain("cross_agent");
		// Derived data #3: lifecycle promotion raw → validated.
		expect(lastBody.effectiveStatus).toBe("validated");

		const conceptsRes = await app.inject({
			method: "GET",
			url: "/api/pythia/graph/concepts",
			headers: authHeaders,
		});
		const concepts = (
			conceptsRes.json() as {
				concepts: Array<{ id: string; signalScore: number; effectiveStatus: string }>;
			}
		).concepts;

		const amplified = concepts.find((c) => c.id === targetId);
		expect(amplified?.effectiveStatus).toBe("validated");
		expect(amplified?.signalScore).toBeGreaterThan(0.25);

		// Contrast: a concept nobody reacts to stays raw — amplification only
		// comes from users and agents, never from the feed itself.
		const untouched = concepts.find((c) => c.id === "pythia_file::parser.py");
		expect(untouched?.effectiveStatus).toBe("raw");
	});

	it("re-ingesting the same session is idempotent", async () => {
		const app = await buildApp({ enableTransport: false, logger: pino({ level: "silent" }) });

		const first = await ingest(app, userAnalysis("sess-user-1"));
		expect(first.statusCode).toBe(201);

		const before = await app.inject({
			method: "GET",
			url: "/api/pythia/graph/concepts",
			headers: authHeaders,
		});
		const beforeCount = (before.json() as { concepts: unknown[] }).concepts.length;

		const replay = await ingest(app, userAnalysis("sess-user-1"));
		expect(replay.statusCode).toBe(200);
		expect(replay.body.recorded).toBe(false);

		const after = await app.inject({
			method: "GET",
			url: "/api/pythia/graph/concepts",
			headers: authHeaders,
		});
		const afterCount = (after.json() as { concepts: unknown[] }).concepts.length;
		expect(afterCount).toBe(beforeCount);
	});

	it("reacting to an unknown concept is a 404", async () => {
		const app = await buildApp({ enableTransport: false, logger: pino({ level: "silent" }) });
		const res = await app.inject({
			method: "POST",
			url: "/api/pythia/graph/react",
			headers: authHeaders,
			payload: { targetId: "python::nope", reaction: "confirm", actorId: "user-1" },
		});
		expect(res.statusCode).toBe(404);
	});
});
