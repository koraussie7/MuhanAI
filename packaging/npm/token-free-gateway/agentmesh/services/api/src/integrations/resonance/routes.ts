/**
 * Resonance integration routes — Fastify plugin.
 *
 * Surface:
 *   GET  /api/integrations/resonance/status
 *   POST /api/integrations/resonance/search
 *   GET  /api/integrations/resonance/autonomy
 *   PUT  /api/integrations/resonance/autonomy
 *   POST /api/integrations/resonance/autonomy/reset
 *   GET  /api/integrations/resonance/governor
 *   PUT  /api/integrations/resonance/governor
 *   POST /api/integrations/resonance/governor/check
 *   POST /api/integrations/resonance/governor/confirm
 *
 * Feature flag: RESONANCE_ENABLED (default false). When disabled, every route
 * returns 404. This keeps the integration inert until explicitly enabled in
 * the deployment environment.
 *
 * Authentication: all routes are API-key-protected (default muhanai onRequest
 * hook). The integration is admin-facing — not exposed to /api/pulse et al.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { clientError, formatZodError } from "../../error-shapes.js";
import {
	DEFAULT_CONFIG,
	DEFAULT_DIAL,
	ResonanceGovernor,
} from "./governor.js";
import { rankCorpus, resolveQueryEmbedding } from "./ranking.js";
import type {
	AutonomyAction,
	AutonomyDial,
	AutonomyLevel,
	RankedItem,
	ResonanceStatus,
	SearchResponse,
} from "./types.js";
import { RESONANCE_EMBEDDING_DIM } from "./types.js";

const RESONANCE_VERSION = "0.1.0";

// Single in-process governor. State is non-persistent across restarts; a
// real deployment should back this with a durable store. This matches
// Resonance's own in-memory behaviour for Option A scope.
let governorInstance: ResonanceGovernor | null = null;

function getGovernor(): ResonanceGovernor {
	if (!governorInstance) {
		governorInstance = new ResonanceGovernor(DEFAULT_DIAL, DEFAULT_CONFIG);
	}
	return governorInstance;
}

function isEnabled(): boolean {
	return process.env.RESONANCE_ENABLED === "true";
}

const AutonomyLevelSchema = z.enum(["off", "suggest", "autopilot"]);

const AutonomyUpdateSchema = z.union([
	AutonomyLevelSchema,
	z.object({
		level: AutonomyLevelSchema,
		perAction: z
			.object({
				read: AutonomyLevelSchema.optional(),
				decide: AutonomyLevelSchema.optional(),
				execute: AutonomyLevelSchema.optional(),
				broadcast: AutonomyLevelSchema.optional(),
				settle: AutonomyLevelSchema.optional(),
			})
			.optional(),
	}),
]);

const GovernorConfigUpdateSchema = z
	.object({
		dailyActionCap: z.number().int().nonnegative().optional(),
		dedupWindowMs: z.number().nonnegative().finite().optional(),
		killSwitch: z.boolean().optional(),
		killSwitchPerAction: z
			.object({
				read: z.boolean().optional(),
				decide: z.boolean().optional(),
				execute: z.boolean().optional(),
				broadcast: z.boolean().optional(),
				settle: z.boolean().optional(),
			})
			.optional(),
	})
	.strict();

const ActionSchema = z.enum(["read", "decide", "execute", "broadcast", "settle"]);

const CheckSchema = z.object({
	action: ActionSchema,
	subject: z.string().min(1).max(512),
});

const ConfirmSchema = z.object({
	action: ActionSchema,
	subject: z.string().min(1).max(512),
});

const RankedItemSchema = z.object({
	id: z.string().min(1).max(256),
	text: z.string().max(8192).optional(),
	embedding: z.array(z.number().finite()).max(RESONANCE_EMBEDDING_DIM).optional(),
	score: z.number().finite().optional(),
	metadata: z.record(z.unknown()).optional(),
});

const SearchSchema = z.object({
	query: z.string().min(1).max(8192),
	queryEmbedding: z.array(z.number().finite()).max(RESONANCE_EMBEDDING_DIM).optional(),
	corpus: z.array(RankedItemSchema).min(1).max(500),
	topK: z.number().int().positive().max(100).default(10),
	minScore: z.number().min(-1).max(1).default(0),
});

export async function resonanceRoutes(app: FastifyInstance): Promise<void> {
	const gated = async (
		request: import("fastify").FastifyRequest,
		reply: import("fastify").FastifyReply,
	): Promise<boolean> => {
		if (isEnabled()) return true;
		return clientError(reply, 404, "Resonance integration is disabled", request.id) === reply;
	};

	app.get("/api/integrations/resonance/status", async (request, reply) => {
		if (!(await gated(request, reply))) return;
		const g = getGovernor();
		const status: ResonanceStatus = {
			enabled: true,
			autonomy: g.getDial(),
			governor: g.getState(),
			embeddingDim: RESONANCE_EMBEDDING_DIM,
			version: RESONANCE_VERSION,
		};
		return status;
	});

	app.post("/api/integrations/resonance/search", async (request, reply) => {
		if (!(await gated(request, reply))) return;
		const parse = SearchSchema.safeParse(request.body);
		if (!parse.success) {
			return clientError(reply, 400, formatZodError(parse.error), request.id);
		}
		const { query, queryEmbedding, corpus, topK, minScore } = parse.data;

		const resolved = resolveQueryEmbedding(query, queryEmbedding);
		const items: RankedItem[] = corpus;
		const results = rankCorpus(resolved.embedding, items, { topK, minScore });

		const response: SearchResponse = {
			query,
			results,
			count: results.length,
			embeddingSource: resolved.source,
		};
		return response;
	});

	app.get("/api/integrations/resonance/autonomy", async (request, reply) => {
		if (!(await gated(request, reply))) return;
		const g = getGovernor();
		const dial: AutonomyDial = g.getDial();
		return dial;
	});

	app.put("/api/integrations/resonance/autonomy", async (request, reply) => {
		if (!(await gated(request, reply))) return;
		const parse = AutonomyUpdateSchema.safeParse(request.body);
		if (!parse.success) {
			return clientError(reply, 400, formatZodError(parse.error), request.id);
		}
		const updatedBy =
			(request.headers["x-resonance-actor"] as string | undefined) ?? "user";
		const next = parse.data as AutonomyLevel | { level: AutonomyLevel; perAction?: AutonomyDial["perAction"] };
		const dial = getGovernor().setDial(next, updatedBy);
		return dial;
	});

	app.post("/api/integrations/resonance/autonomy/reset", async (request, reply) => {
		if (!(await gated(request, reply))) return;
		const updatedBy =
			(request.headers["x-resonance-actor"] as string | undefined) ?? "system";
		const dial = getGovernor().setDial(DEFAULT_DIAL.level, updatedBy);
		return dial;
	});

	app.get("/api/integrations/resonance/governor", async (request, reply) => {
		if (!(await gated(request, reply))) return;
		const state = getGovernor().getState();
		return state;
	});

	app.put("/api/integrations/resonance/governor", async (request, reply) => {
		if (!(await gated(request, reply))) return;
		const parse = GovernorConfigUpdateSchema.safeParse(request.body);
		if (!parse.success) {
			return clientError(reply, 400, formatZodError(parse.error), request.id);
		}
		try {
			const config = getGovernor().updateConfig(parse.data);
			return { config };
		} catch (e) {
			const message = e instanceof Error ? e.message : "Governor update failed";
			return clientError(reply, 400, message, request.id);
		}
	});

	app.post("/api/integrations/resonance/governor/check", async (request, reply) => {
		if (!(await gated(request, reply))) return;
		const parse = CheckSchema.safeParse(request.body);
		if (!parse.success) {
			return clientError(reply, 400, formatZodError(parse.error), request.id);
		}
		const result = getGovernor().check(parse.data);
		return result;
	});

	app.post("/api/integrations/resonance/governor/confirm", async (request, reply) => {
		if (!(await gated(request, reply))) return;
		const parse = ConfirmSchema.safeParse(request.body);
		if (!parse.success) {
			return clientError(reply, 400, formatZodError(parse.error), request.id);
		}
		const { action, subject } = parse.data;
		const recorded = getGovernor().confirm(action as AutonomyAction, subject);
		return reply.code(201).send({ recorded });
	});
}
