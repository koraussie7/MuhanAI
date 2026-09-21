/**
 * Pythia ↔ cosmic knowledge graph bridge.
 *
 * This is the wiring the cosmos-core package was designed for: everything
 * Pythia touches — user prompts, agent analyses, LLM responses — flows into
 * the append-only cosmic log, and *derived* data flows back out:
 *
 *  1. Concept extraction (deterministic): the analyzed file plus backtick
 *     identifiers found in the prompt/response become ontology concepts
 *     (`python::parse_csv`…), so the same real-world thing mentioned by a
 *     user, an agent, or two different sessions collapses onto one node.
 *  2. Co-occurrence derivation: concepts that appear together in one analysis
 *     automatically earn a `related_to` relation proposal — new edges the
 *     upstream LLM never explicitly stated.
 *  3. Amplification derivation: user/agent reactions are folded into the
 *     explainable signal score; a concept crossing the threshold is promoted
 *     raw → validated → amplified (read-time derivation via `statusForScore`).
 *
 * The graph must never break Pythia: every write is local and every caller
 * wraps the bridge in try/catch. Routes mirror the ghost pattern — `x-api-key`
 * for operator access, session-scoped payloads, zod-validated bodies.
 */

import {
	type AmplificationBreakdown,
	type AppendOnlyLog,
	amplify,
	applyEvent,
	type ConceptProjection,
	type CosmosEvent,
	type CosmosEventInput,
	conceptId,
	createJsonlLog,
	createMemoryLog,
	emptyProjection,
	normalizeLabel,
	type OntologyConcept,
	type OntologyRelation,
	type ReactionSample,
	type ReactionType,
	statusForScore,
} from "@agentmesh/cosmos-core";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { clientError, formatZodError } from "./error-shapes.js";

// ---------------------------------------------------------------------------
// Singleton log + live projection
// ---------------------------------------------------------------------------

let logInstance: AppendOnlyLog | undefined;
let projection: ConceptProjection | undefined;

/** Idempotency guard: one graph ingest per Pythia session (dev-grade). */
const recordedSessions = new Set<string>();

/** Lazy singleton log — JSONL-backed when `COSMOS_LOG_PATH` is set, else memory. */
export function cosmosLog(): AppendOnlyLog {
	if (!logInstance) {
		const path = process.env.COSMOS_LOG_PATH;
		logInstance = path ? createJsonlLog(path) : createMemoryLog();
		projection = undefined;
	}
	return logInstance;
}

/** Live projection rebuilt from the log on first access, updated on append. */
export async function cosmosProjection(): Promise<ConceptProjection> {
	const log = cosmosLog();
	if (!projection) {
		const rebuilt = emptyProjection();
		for (const event of await log.query()) applyEvent(rebuilt, event);
		projection = rebuilt;
	}
	return projection;
}

/** Append events and fold them into the live projection. */
async function appendToGraph(events: CosmosEventInput[]): Promise<CosmosEvent[]> {
	const log = cosmosLog();
	const appended = await log.appendMany(events);
	const live = await cosmosProjection();
	for (const event of appended) applyEvent(live, event);
	return appended;
}

/** Test/dev reset: drop the in-memory graph entirely. */
export async function resetCosmosGraph(): Promise<void> {
	await cosmosLog().reset();
	recordedSessions.clear();
	projection = undefined;
}

// ---------------------------------------------------------------------------
// Concept extraction — deterministic, identity-stable
// ---------------------------------------------------------------------------

/** Max concepts extracted per analysis — keeps relation derivation bounded. */
const MAX_CONCEPTS = 8;

/**
 * Extract concept candidates from one Pythia analysis: the analyzed file plus
 * backtick identifiers in the prompt/response. Backticks are the natural
 * convergence signal — two sessions touching the same function both name it.
 */
export function extractConceptInputs(
	file: string,
	prompt: string,
	response: string,
): { domain: string; label: string }[] {
	const concepts = new Map<string, { domain: string; label: string }>();

	const fileLabel = normalizeLabel(file) || "untitled";
	concepts.set(conceptId("pythia_file", fileLabel), {
		domain: "pythia_file",
		label: fileLabel,
	});

	const text = `${prompt}\n${response}`;
	for (const match of text.matchAll(/`([^`\n]{2,64})`/g)) {
		const label = normalizeLabel(match[1] ?? "");
		if (!label) continue;
		const id = conceptId("python", label);
		if (concepts.has(id)) continue;
		concepts.set(id, { domain: "python", label });
		if (concepts.size >= MAX_CONCEPTS) break;
	}

	return [...concepts.values()];
}

// ---------------------------------------------------------------------------
// Ingest — Pythia analysis → graph events (+ co-occurrence derivation)
// ---------------------------------------------------------------------------

export interface PythiaAnalysisInput {
	/** Pythia session id; enables per-session idempotent ingest. */
	sessionId?: string;
	/** User id or agent id that produced/owns the analysis. */
	actorId?: string;
	/** Who emitted the data into the stream. */
	source: "user" | "agent";
	file: string;
	prompt: string;
	response: string;
	outcome?: "ok" | "error" | "inconclusive";
}

export interface PythiaAnalysisResult {
	/** False when this sessionId was already ingested (idempotent replay). */
	recorded: boolean;
	/** Concept ids the analysis touched. */
	conceptIds: string[];
	/** Number of derived `related_to` proposals emitted. */
	derivedRelations: number;
}

/**
 * Record one Pythia analysis into the cosmic graph.
 *
 * Emits: one `ontology_node` per extracted concept, one `agent_action` tying
 * them together, and — the derivation — one `related_to` proposal per concept
 * pair co-mentioned by this single analysis.
 */
export async function recordPythiaAnalysis(
	input: PythiaAnalysisInput,
): Promise<PythiaAnalysisResult> {
	if (input.sessionId && recordedSessions.has(input.sessionId)) {
		return { recorded: false, conceptIds: [], derivedRelations: 0 };
	}

	const now = Date.now();
	const conceptInputs = extractConceptInputs(input.file, input.prompt, input.response);
	const conceptIds = conceptInputs.map((c) => conceptId(c.domain, c.label));

	const actor = input.actorId !== undefined ? { actorId: input.actorId } : {};
	const events: CosmosEventInput[] = conceptInputs.map((c) => ({
		kind: "ontology_node",
		timestamp: now,
		source: input.source,
		...actor,
		payload: {
			conceptId: conceptId(c.domain, c.label),
			label: c.label,
			domain: c.domain,
			status: "raw" as const,
			...(input.sessionId !== undefined ? { upstreamId: input.sessionId } : {}),
		},
	}));

	events.push({
		kind: "agent_action",
		timestamp: now,
		source: input.source,
		...actor,
		payload: {
			action: "pythia_analysis",
			conceptIds,
			outcome: input.outcome ?? "ok",
			...(input.sessionId !== undefined ? { detail: `session:${input.sessionId}` } : {}),
		},
	});

	let derivedRelations = 0;
	for (let i = 0; i < conceptIds.length; i += 1) {
		for (let j = i + 1; j < conceptIds.length; j += 1) {
			events.push({
				kind: "relation_event",
				timestamp: now,
				source: input.source,
				...actor,
				payload: {
					sourceId: conceptIds[i] as string,
					targetId: conceptIds[j] as string,
					predicate: "related_to",
					strength: 0.5,
					...(input.sessionId !== undefined ? { reason: `co-occurrence:${input.sessionId}` } : {}),
				},
			});
			derivedRelations += 1;
		}
	}

	await appendToGraph(events);
	if (input.sessionId) recordedSessions.add(input.sessionId);
	return { recorded: true, conceptIds, derivedRelations };
}

// ---------------------------------------------------------------------------
// Reaction → amplification derivation
// ---------------------------------------------------------------------------

export interface PythiaReactionInput {
	/** Concept id the actor reacts to. */
	targetId: string;
	reaction: ReactionType;
	actorId?: string;
	/** Free-form context (selection text, note body…). */
	context?: string;
}

export interface PythiaReactionResult {
	/** Derived amplification breakdown for the target concept. */
	breakdown: AmplificationBreakdown;
	/** Read-time lifecycle promotion derived from the signal score. */
	effectiveStatus: "raw" | "validated" | "amplified";
}

/**
 * Record a user/agent reaction and run the amplification derivation for the
 * target concept: reactions + relation convergence + citations → signal
 * score → an `amplification` event appended to the log.
 */
export async function recordPythiaReaction(
	input: PythiaReactionInput,
): Promise<PythiaReactionResult> {
	const now = Date.now();
	const actor = input.actorId !== undefined ? { actorId: input.actorId } : {};
	await appendToGraph([
		{
			kind: "user_reaction",
			timestamp: now,
			source: "user",
			...actor,
			payload: {
				targetId: input.targetId,
				reaction: input.reaction,
				...(input.context !== undefined ? { context: input.context } : {}),
			},
		},
	]);

	return deriveAmplification(input.targetId);
}

/**
 * Derivation pass for one concept: fold every recorded reaction (plus relation
 * convergence and citation counts from the projection) into the explainable
 * amplification score. Pure read-time derivation — the same numbers come back
 * from a cold projection rebuild, which is what keeps the graph drift-free.
 */
export async function deriveAmplification(targetId: string): Promise<PythiaReactionResult> {
	const live = await cosmosProjection();
	const breakdown = computeBreakdown(live, targetId);

	await appendToGraph([
		{
			kind: "amplification",
			timestamp: Date.now(),
			source: "system",
			payload: {
				conceptId: targetId,
				signal: breakdown.signals[0] ?? "reaction_volume",
				magnitude: breakdown.signalScore,
			},
		},
	]);

	return { breakdown, effectiveStatus: statusForScore(breakdown.signalScore) };
}

// ---------------------------------------------------------------------------
// Read models
// ---------------------------------------------------------------------------

/** Concept projection row with the derived score and lifecycle status. */
export interface GraphConceptView extends OntologyConcept {
	/** Derived from signalScore — the graph's answer to "is this meaningful?". */
	effectiveStatus: "raw" | "validated" | "amplified";
}

/**
 * Compute the amplification breakdown for one concept from projection state:
 * recorded reactions + relation proposals touching it + relations citing it.
 * Shared by the amplification event emitter and the concept read model so both
 * always agree.
 */
export function computeBreakdown(
	live: ConceptProjection,
	targetId: string,
): AmplificationBreakdown {
	const reactions: ReactionSample[] = live.reactionsByTarget.get(targetId) ?? [];

	let relationProposalCount = 0;
	for (const draft of live.relationDrafts.values()) {
		if (draft.sourceId === targetId || draft.targetId === targetId) {
			relationProposalCount += draft.proposals.length;
		}
	}

	let citationCount = 0;
	for (const relation of live.relations.values()) {
		if (relation.sourceId === targetId || relation.targetId === targetId) {
			citationCount += 1;
		}
	}

	return amplify({ reactions, relationProposalCount, citationCount });
}

export function conceptViews(live: ConceptProjection): GraphConceptView[] {
	return [...live.concepts.values()]
		.map((concept) => {
			const signalScore = computeBreakdown(live, concept.id).signalScore;
			return { ...concept, signalScore, effectiveStatus: statusForScore(signalScore) };
		})
		.sort((a, b) => b.signalScore - a.signalScore || a.id.localeCompare(b.id));
}

export function relationViews(live: ConceptProjection): OntologyRelation[] {
	return [...live.relations.values()].sort((a, b) => b.strength - a.strength);
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const IngestSchema = z.object({
	sessionId: z.string().min(1).max(128).optional(),
	actorId: z.string().min(1).max(128).optional(),
	source: z.enum(["user", "agent"]),
	file: z.string().min(1).max(256),
	prompt: z.string().min(1).max(8192),
	response: z.string().min(1).max(65_536),
	outcome: z.enum(["ok", "error", "inconclusive"]).optional(),
});

const ReactSchema = z.object({
	targetId: z.string().min(1).max(256),
	reaction: z.enum([
		"confirm",
		"deny",
		"connect_suggest",
		"correct",
		"question",
		"prioritize",
		"note_attach",
	]),
	actorId: z.string().min(1).max(128).optional(),
	context: z.string().max(4096).optional(),
});

export async function cosmosRoutes(app: FastifyInstance) {
	/**
	 * POST /api/pythia/graph/ingest
	 *
	 * User/agent Pythia analysis → cosmic graph. Emits concept, action and
	 * co-occurrence relation events. Idempotent per sessionId.
	 */
	app.post("/api/pythia/graph/ingest", async (request, reply) => {
		const parse = IngestSchema.safeParse(request.body);
		if (!parse.success) {
			return clientError(reply, 400, formatZodError(parse.error), request.id);
		}
		try {
			const result = await recordPythiaAnalysis(parse.data);
			return reply.code(result.recorded ? 201 : 200).send(result);
		} catch (err) {
			request.log.error({ err }, "cosmos graph ingest failed");
			return clientError(reply, 500, "graph ingest failed", request.id);
		}
	});

	/**
	 * POST /api/pythia/graph/react
	 *
	 * User/agent reaction to a concept → amplification derivation.
	 */
	app.post("/api/pythia/graph/react", async (request, reply) => {
		const parse = ReactSchema.safeParse(request.body);
		if (!parse.success) {
			return clientError(reply, 400, formatZodError(parse.error), request.id);
		}
		const { targetId } = parse.data;
		const live = await cosmosProjection();
		if (!live.concepts.has(targetId)) {
			return clientError(reply, 404, "concept_not_found", request.id);
		}
		const result = await recordPythiaReaction(parse.data);
		return reply.send({ targetId, ...result });
	});

	/** GET /api/pythia/graph/concepts — projected concepts, strongest first. */
	app.get("/api/pythia/graph/concepts", async () => ({
		concepts: conceptViews(await cosmosProjection()),
	}));

	/** GET /api/pythia/graph/relations — projected relations, strongest first. */
	app.get("/api/pythia/graph/relations", async () => ({
		relations: relationViews(await cosmosProjection()),
	}));

	/** GET /api/pythia/graph/events — latest raw events (log tail). */
	app.get("/api/pythia/graph/events", async () => ({
		events: (await cosmosLog().tail(50)).map((e) => ({
			id: e.id,
			kind: e.kind,
			source: e.source,
			timestamp: new Date(e.timestamp).toISOString(),
			sequence: e.sequence,
		})),
	}));
}
