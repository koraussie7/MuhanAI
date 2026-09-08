/**
 * LLM Chat route — Tier 3 keyless providers pool.
 *
 * Single POST endpoint that proxies to free-tier LLM providers that
 * require NO API key. Inspired by:
 *   - TierMux (keyless providers: Kilo Gateway, OpenCode Zen, OVH AI, Pollinations)
 *   - FreeLLMAPI (OpenRouter free tier, Cloudflare Workers AI)
 *
 * Falls back to a local simulation if all providers fail.
 */

import {
	callKeylessProviders,
	getKeylessProviderNames,
	type KeylessRequest,
} from "@agentmesh/llm-router/src/keyless-providers.js";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { clientError, formatZodError } from "./error-shapes.js";

const ChatSchema = z.object({
	prompt: z.string().min(1).max(4096),
	system: z.string().max(2048).optional(),
	model: z.string().max(128).optional(),
	temperature: z.number().min(0).max(2).optional(),
	maxTokens: z.number().int().min(1).max(4096).optional(),
	provider: z.string().max(64).optional(),
});

export async function llmRoutes(app: FastifyInstance) {
	/**
	 * POST /api/llm/chat
	 *
	 * Routes to keyless free-tier providers in parallel, returns the first
	 * successful response. No API key required.
	 *
	 * This is the Tier 3 (free) path. Tier 1 (browser session CDP) and
	 * Tier 2 (BYOK API key) are planned extensions.
	 */
	app.post("/api/llm/chat", async (request, reply) => {
		const parse = ChatSchema.safeParse(request.body);
		if (!parse.success) {
			return clientError(reply, 400, formatZodError(parse.error), request.id);
		}

		const req: KeylessRequest = parse.data;

		try {
			const result = await callKeylessProviders(req);
			return {
				text: result.text,
				provider: result.provider,
				model: result.model,
				latencyMs: result.latencyMs,
				tier: "keyless",
			};
		} catch (err) {
			request.log.error({ err }, "keyless LLM call failed");
			return clientError(reply, 502, "All keyless providers failed", request.id);
		}
	});

	/**
	 * GET /api/llm/providers
	 *
	 * Returns the list of available keyless providers.
	 */
	app.get("/api/llm/providers", async (_request, _reply) => {
		return {
			providers: getKeylessProviderNames(),
			tier: "keyless",
		};
	});
}
