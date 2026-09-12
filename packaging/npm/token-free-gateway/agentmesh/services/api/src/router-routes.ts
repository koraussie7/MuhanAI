/**
 * Question routing routes.
 *
 *   POST /api/route
 *     body: { userId, question }
 *     → runs the full multi-agent routing pipeline behind the prepaid-credit
 *       gate and returns the cast result + credit receipt.
 *
 * Credit semantics:
 *   - Dev mode (CREDITS_ENFORCED=false or missing ledger): pass-through, no
 *     debit, `creditsEnforced: false` in the response.
 *   - 402 Payment Required is returned when the wallet cannot cover the
 *     worst-case route cost, with balance/required fields attached.
 */

import { InsufficientCreditsError } from "@agentmesh/credit-system";
import {
	routeQuestionWithCredits,
	type CreditGateOptions,
} from "@agentmesh/agent-router";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "./db.js";
import { clientError, formatZodError } from "./error-shapes.js";

const RouteBodySchema = z.object({
	userId: z.string().min(1).max(256),
	question: z.string().min(1).max(8_192),
});

export async function routerRoutes(app: FastifyInstance) {
	app.post("/api/route", async (request, reply) => {
		const parse = RouteBodySchema.safeParse(request.body);
		if (!parse.success) {
			return clientError(reply, 400, formatZodError(parse.error), request.id);
		}

		const { userId, question } = parse.data;
		const gate: CreditGateOptions = {
			prisma: process.env.CREDITS_ENFORCED === "false" ? null : prisma,
		};

		try {
			const result = await routeQuestionWithCredits(question, userId, gate);
			return {
				userId,
				category: result.category,
				cast: result.cast,
				knowledgeUsed: result.knowledgeUsed,
				runIds: result.runIds,
				credits: {
					spent: result.creditsSpent,
					balanceAfter: result.balanceAfter?.toString() ?? null,
					enforced: result.creditsEnforced,
				},
			};
		} catch (err) {
			if (err instanceof InsufficientCreditsError) {
				return reply.code(402).send({
					error: "insufficient_credits",
					message: err.message,
					balance: err.balance.toString(),
					required: err.required.toString(),
					requestId: request.id,
				});
			}
			request.log.error({ err }, "route pipeline failed");
			return reply.code(502).send({
				error: "route_pipeline_failed",
				message: err instanceof Error ? err.message : "unknown",
				requestId: request.id,
			});
		}
	});
}
