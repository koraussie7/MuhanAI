/**
 * LLM Chat route — Auto OmniRoute Free LLM first, then keyless providers fallback.
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

// === OmniRoute 우선 설정 ===
// OMNIROUTE_PRIORITY=true 이면 OmniRoute Free LLM을 먼저 시도
const OMNIROUTE_PRIORITY = process.env.OMNIROUTE_PRIORITY !== 'false';
const OMNIROUTE_BASE_URL = process.env.OMNIROUTE_BASE_URL ?? process.env.OPENAI_BASE_URL ?? null;
const OMNIROUTE_MODEL = process.env.OMNIROUTE_MODEL ?? process.env.OPENAI_DEFAULT_MODEL ?? "openai/gpt-4o-mini";

const OMNIROUTE_CHAT_ROUTE = OMNIROUTE_BASE_URL ? new URL("/chat/completions", OMNIROUTE_BASE_URL) : null;

/**
 * OmniRoute Free LLM 호출
 */
async function callOmniRouteFree(req: KeylessRequest) {
	if (!OMNIROUTE_CHAT_ROUTE) {
		return null;
	}

	const body = {
		model: req.model || OMNIROUTE_MODEL,
		messages: [
			...(req.system ? [{ role: "system", content: req.system }] : []),
			{ role: "user", content: req.prompt },
		],
		temperature: req.temperature ?? 0.7,
		max_tokens: req.maxTokens ?? 4096,
	} as Record<string, unknown>;

	const options: RequestInit = {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	};

	// API 키가 있으면 추가 (OpenRouter 등)
	if (process.env.OMNIROUTE_API_KEY) {
		(options.headers as Record<string, string>)["Authorization"] = `Bearer ${process.env.OMNIROUTE_API_KEY}`;
	}

	const upstream = await fetch(OMNIROUTE_CHAT_ROUTE.toString(), options);

	if (!upstream.ok) {
		const text = await upstream.text().catch(() => "");
		throw new Error(`OmniRoute HTTP ${upstream.status}: ${text.slice(0, 200)}`);
	}

	const data = (await upstream.json()) as { choices?: Array<{ message?: { content?: string } }> };
	const text = data?.choices?.[0]?.message?.content?.trim();
	if (!text) {
		throw new Error("OmniRoute returned empty response");
	}

	return {
		text,
		provider: "omniroute",
		model: req.model || OMNIROUTE_MODEL,
		latencyMs: null,
	};
}

export async function llmRoutes(app: FastifyInstance) {
	app.post("/api/llm/chat", async (request, reply) => {
		const parse = ChatSchema.safeParse(request.body);
		if (!parse.success) {
			return clientError(reply, 400, formatZodError(parse.error), request.id);
		}

		const req: KeylessRequest = parse.data;

		// === 1순위: OmniRoute Free LLM (OMNIROUTE_PRIORITY=true일 때) ===
		if (OMNIROUTE_PRIORITY && OMNIROUTE_CHAT_ROUTE) {
			try {
				const result = await callOmniRouteFree(req);
				if (result) {
					request.log.info({ provider: result.provider, model: result.model }, "OmniRoute Free LLM 성공");
					return {
						text: result.text,
						provider: result.provider,
						model: result.model,
						latencyMs: result.latencyMs,
						tier: "omniroute",
					};
				}
			} catch (err) {
				request.log.info({ err }, "OmniRoute Free LLM 실패, 다음 fallback 시도");
			}
		}

		// === 2순위: Keyless providers pool ===
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
		}

		// === 3순위: OmniRoute fallback (모든 시도 실패 시) ===
		if (!OMNIROUTE_CHAT_ROUTE) {
			return clientError(reply, 502, "All LLM providers failed", request.id);
		}

		try {
			const result = await callOmniRouteFree(req);
			if (result) {
				return {
					text: result.text,
					provider: result.provider,
					model: result.model,
					latencyMs: result.latencyMs,
					tier: "omniroute",
				};
			}
		} catch (err) {
			request.log.error({ err }, "OmniRoute fallback call failed");
		}

		return clientError(reply, 502, "All LLM providers failed", request.id);
	});

	app.get("/api/llm/providers", async (_request, _reply) => {
		return {
			providers: getKeylessProviderNames(),
			tier: "keyless",
		};
	});
}
