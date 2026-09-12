/**
 * Credit gate for the question routing pipeline.
 *
 * Wraps `routeQuestion` with a prepaid-credit check + post-execution debit:
 *
 *   1. Pre-check:   balance >= cost, otherwise `InsufficientCreditsError`.
 *   2. Execute:     the normal route pipeline runs.
 *   3. Post-debit:  `spendCredits` with an idempotency key derived from the
 *                   question content, so replays never double-charge.
 *
 * When `prisma` is null (dev / offline mode) the gate is a pass-through and
 * no credits are charged — routing still works end to end.
 */

import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import {
	InsufficientCreditsError,
	getCreditBalance,
	spendCredits,
} from "@agentmesh/credit-system";
import { routeQuestion, type RouteResult } from "./pipeline.js";

/** Base credit cost for one routed question. Tunable per tier later. */
export const BASE_ROUTE_COST = 10;

/** Extra credits per knowledge node actually used in the answer. */
export const COST_PER_KNOWLEDGE_NODE = 1;

export interface CreditGateOptions {
	/** Prisma client; `null` disables credit enforcement (dev mode). */
	prisma: PrismaClient | null;
	/** Override the base cost (defaults to BASE_ROUTE_COST). */
	baseCost?: number;
	/** Override cost per knowledge node (defaults to COST_PER_KNOWLEDGE_NODE). */
	perKnowledgeNode?: number;
}

export interface RoutedWithCredits extends RouteResult {
	creditsSpent: number;
	balanceAfter: bigint | null;
	creditsEnforced: boolean;
}

/**
 * Stable idempotency key so the same question from the same user is only
 * ever charged once, even across retries/replays.
 */
export function routeChargeIdempotencyKey(userId: string, question: string): string {
	const digest = createHash("sha256")
		.update(`${userId}\u0000${question.trim().toLowerCase()}`)
		.digest("hex");
	return `route:${digest.slice(0, 32)}`;
}

export function computeRouteCost(
	knowledgeUsed: number,
	opts: { baseCost?: number; perKnowledgeNode?: number } = {},
): number {
	const base = opts.baseCost ?? BASE_ROUTE_COST;
	const perNode = opts.perKnowledgeNode ?? COST_PER_KNOWLEDGE_NODE;
	return base + Math.max(0, knowledgeUsed) * perNode;
}

/**
 * Run the routing pipeline behind a prepaid-credit gate.
 * Throws `InsufficientCreditsError` when the balance is too low.
 */
export async function routeQuestionWithCredits(
	question: string,
	userId: string,
	gate: CreditGateOptions,
): Promise<RoutedWithCredits> {
	// Pass-through when no ledger is wired (local dev, tests without DB).
	if (!gate.prisma) {
		const result = await routeQuestion(question, userId);
		return { ...result, creditsSpent: 0, balanceAfter: null, creditsEnforced: false };
	}

	const prisma = gate.prisma;
	const balanceBefore = await getCreditBalance(prisma, userId);
	const idempotencyKey = routeChargeIdempotencyKey(userId, question);

	// Pre-charge check with a conservative worst-case estimate so obviously
	// broke wallets fail fast without running the whole pipeline.
	const worstCaseCost = computeRouteCost(0, gate);
	if (balanceBefore < BigInt(worstCaseCost)) {
		throw new InsufficientCreditsError(balanceBefore, BigInt(worstCaseCost));
	}

	// Execute first, then debit — a failed route must not charge the user.
	const result = await routeQuestion(question, userId);
	const cost = computeRouteCost(result.knowledgeUsed, gate);

	try {
		const { balance } = await spendCredits(prisma, {
			userId,
			amount: cost,
			reason: "spend",
			idempotencyKey,
			metadata: {
				questionPreview: question.slice(0, 120),
				knowledgeUsed: result.knowledgeUsed,
				category: result.category.domain,
			},
		});
		return { ...result, creditsSpent: cost, balanceAfter: balance, creditsEnforced: true };
	}
	// `InsufficientCreditsError` (balance/required fields) propagates as-is so
	// the caller can map it to an HTTP 402 with accurate context.
	catch (err) {
		throw err;
	}
}
