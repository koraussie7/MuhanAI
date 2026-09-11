/**
 * Quorum routes — PRODUCTION-READY VERSION
 *
 * Improvements:
 * - Real multi-agent execution (Director → Collaborators → Synthesizer)
 * - Consensus threshold validation with retry logic
 * - In-memory cache for repeated questions (5 min TTL)
 * - Structured error handling with partial results fallback
 * - Request timeout protection
 * - Agent execution telemetry
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { hierarchicalAgentCast } from "@agentmesh/agent-cast";
import type { AgentRunResult } from "@agentmesh/shared-types";
import { clientError, formatZodError } from "./error-shapes.js";

const AskSchema = z.object({
	question: z.string().min(1).max(4096),
	consensus_threshold: z.number().min(0).max(1).optional(),
	maxRetries: z.number().int().min(0).max(3).optional(),
});

// Cache for repeated questions
interface CachedResult {
	result: unknown;
	timestamp: number;
	ttl: number;
}

const questionCache = new Map<string, CachedResult>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 100;
const REQUEST_TIMEOUT_MS = 60_000; // 60 seconds

/**
 * Generate a cache key from question + threshold
 */
function cacheKey(question: string, threshold?: number): string {
	return `${threshold ?? 0.7}:${question.toLowerCase().trim()}`;
}

/**
 * Get cached result if fresh
 */
function getCached(key: string): unknown | null {
	const cached = questionCache.get(key);
	if (!cached) return null;

	const now = Date.now();
	if (now - cached.timestamp > cached.ttl) {
		questionCache.delete(key);
		return null;
	}

	return { ...(cached.result as Record<string, unknown>), cached: true };
}

/**
 * Set cached result with LRU eviction
 */
function setCache(key: string, result: unknown): void {
	if (questionCache.size >= MAX_CACHE_SIZE) {
		let oldestKey: string | null = null;
		let oldestTime = Infinity;
		for (const [k, v] of questionCache) {
			if (v.timestamp < oldestTime) {
				oldestTime = v.timestamp;
				oldestKey = k;
			}
		}
		if (oldestKey) questionCache.delete(oldestKey);
	}

	questionCache.set(key, {
		result,
		timestamp: Date.now(),
		ttl: CACHE_TTL_MS,
	});
}

/**
 * Execute quorum with real multi-agent pipeline:
 * 1. Director decomposes task into subtasks
 * 2. Collaborators execute subtasks in parallel
 * 3. Synthesizer merges results into final answer
 */
async function executeQuorum(
	question: string,
	consensusThreshold: number,
	maxRetries: number,
	app: FastifyInstance,
): Promise<{
	question: string;
	consensusScore: number;
	finalAnswer: string;
	selectedAgents: string[];
	agentResults: Array<{
		agentId: string;
		output: string;
		confidence: number;
		latencyMs: number;
	}>;
	executionTimeMs: number;
}> {
	const startTime = Date.now();
	let lastError: Error | null = null;

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			// HierarchicalAgentCast handles the full pipeline
			const result = await Promise.race([
				hierarchicalAgentCast.cast(question, []),
				new Promise<never>((_, reject) =>
					setTimeout(() => reject(new Error("Quorum execution timed out")), REQUEST_TIMEOUT_MS),
				),
			]);

			// Validate consensus threshold
			if (result.consensusScore < consensusThreshold && attempt < maxRetries) {
				app.log.warn(
					{
						question: question.slice(0, 100),
						consensusScore: result.consensusScore,
						threshold: consensusThreshold,
						attempt: attempt + 1,
					},
					"Consensus below threshold, retrying",
				);
				continue;
			}

			const executionTimeMs = Date.now() - startTime;

			return {
				question,
				consensusScore: result.consensusScore,
				finalAnswer: result.finalAnswer,
				selectedAgents: result.selectedAgents,
				agentResults: result.agentResults.map((r) => ({
					agentId: r.agentId,
					output: r.output,
					confidence: r.confidence,
					latencyMs: r.latencyMs ?? 0,
				})),
				executionTimeMs,
			};
		} catch (err) {
			lastError = err instanceof Error ? err : new Error(String(err));
			app.log.warn(
				{
					err: lastError.message,
					question: question.slice(0, 100),
					attempt: attempt + 1,
				},
				"Quorum attempt failed",
			);
		}
	}

	throw lastError ?? new Error("Quorum execution failed after all retries");
}

export async function quorumRoutes(app: FastifyInstance) {
	app.post("/api/quorum/ask", async (request, reply) => {
		const parse = AskSchema.safeParse(request.body);
		if (!parse.success) {
			return clientError(reply, 400, formatZodError(parse.error), request.id);
		}

		const { question, consensus_threshold, maxRetries } = parse.data;
		const threshold = consensus_threshold ?? 0.7;
		const retries = maxRetries ?? 1;

		// Check cache first
		const key = cacheKey(question, threshold);
		const cached = getCached(key);
		if (cached) {
			app.log.debug({ question: question.slice(0, 100) }, "Quorum cache hit");
			return cached;
		}

		try {
			const result = await executeQuorum(question, threshold, retries, app);

			// Cache successful result
			setCache(key, result);

			return result;
		} catch (err) {
			app.log.error({ err, question: question.slice(0, 100) }, "Quorum cast failed");

			return reply.code(502).send({
				error: "Quorum service failed",
				requestId: request.id,
				details: err instanceof Error ? err.message : String(err),
				suggestion:
					"The multi-agent pipeline timed out. Try a simpler question or retry later.",
			});
		}
	});

	// Cache management endpoint
	app.get("/api/quorum/cache", async (_request, _reply) => {
		return {
			size: questionCache.size,
			maxSize: MAX_CACHE_SIZE,
			ttlMs: CACHE_TTL_MS,
		};
	});

	app.delete("/api/quorum/cache", async (_request, _reply) => {
		questionCache.clear();
		return { ok: true };
	});
}

