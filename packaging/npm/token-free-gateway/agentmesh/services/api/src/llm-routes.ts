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

const OMNIROUTE_BASE_URL = process.env.OMNIROUTE_BASE_URL ?? process.env.OPENAI_BASE_URL ?? null;
const OMNIROUTE_FALLBACK_MODEL = process.env.OMNIROUTE_FALLBACK_MODEL ?? process.env.OPENAI_DEFAULT_MODEL ?? "gpt-4-turbo-preview";

const OMNIROUTE_CHAT_ROUTE = OMNIROUTE_BASE_URL ? new URL("/chat/completions", OMNIROUTE_BASE_URL) : null;

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
			if (!OMNIROUTE_CHAT_ROUTE) {
				return clientError(reply, 502, "All keyless providers failed", request.id);
			}
		}

		if (!OMNIROUTE_CHAT_ROUTE) {
			return clientError(reply, 502, "All keyless providers failed", request.id);
		}

		try {
			const body = {
				model: req.model || OMNIROUTE_FALLBACK_MODEL,
				messages: [
					...(req.system ? [{ role: "system", content: req.system }] : []),
					{ role: "user", content: req.prompt },
				],
				temperature: req.temperature,
				max_tokens: req.maxTokens,
			} as Record<string, unknown>;

			const upstream = await fetch(OMNIROUTE_CHAT_ROUTE.toString(), {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body),
			});

			if (!upstream.ok) {
				const text = await upstream.text().catch(() => "");
				request.log.error({ status: upstream.status, text }, "OmniRoute chat failed");
				return clientError(reply, 502, "OmniRoute chat failed", request.id);
			}

			const data = (await upstream.json()) as { choices?: Array<{ message?: { content?: string } }> };
			const text = data?.choices?.[0]?.message?.content?.trim();
			if (!text) {
				return clientError(reply, 502, "OmniRoute chat returned empty completion", request.id);
			}

			return {
				text,
				provider: "omniroute",
				model: req.model || OMNIROUTE_FALLBACK_MODEL,
				latencyMs: null,
				tier: "omniroute",
			};
		} catch (err) {
			request.log.error({ err }, "OmniRoute chat call failed");
			return clientError(reply, 502, "OmniRoute chat call failed", request.id);
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
