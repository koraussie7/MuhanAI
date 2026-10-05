/**
 * LLM Chat route — Auto OmniRoute Free LLM first, then keyless providers fallback.
 */

import {
	callKeylessProviders,
	getKeylessProviderNames,
	getOmniRouteEndpoint,
	type KeylessRequest,
} from "@agentmesh/llm-router/src/keyless-providers.js";
import { randomUUID } from "node:crypto";
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
const OMNIROUTE_PRIORITY = process.env.OMNIROUTE_PRIORITY !== "false";
const OMNIROUTE_MODEL =
	process.env.OMNIROUTE_MODEL ?? process.env.OPENAI_DEFAULT_MODEL ?? "openai/gpt-4o-mini";
const HERMES_PUBLIC_API_URL = process.env.HERMES_PUBLIC_API_URL?.replace(/\/$/, "");
const HERMES_PUBLIC_MODEL = process.env.HERMES_PUBLIC_MODEL ?? "hermes-public";

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
	return await fetch(url, { ...init, signal: controller.signal });
	} finally {
	clearTimeout(timer);
	}
}

/** Optional, explicitly configured public-only Hermes adapter. */
async function callHermesPublic(req: KeylessRequest) {
	if (!HERMES_PUBLIC_API_URL) return null;
	const headers: Record<string, string> = { "content-type": "application/json" };
	if (process.env.HERMES_PUBLIC_API_KEY) headers.Authorization = `Bearer ${process.env.HERMES_PUBLIC_API_KEY}`;
	// OpenCode-compatible upstreams require a per-request routing session.
	headers["x-opencode-session"] = randomUUID();
	const upstream = await fetchWithTimeout(
	`${HERMES_PUBLIC_API_URL}/v1/chat/completions`,
	{
	method: "POST",
		headers,
	body: JSON.stringify({
	model: req.model ?? HERMES_PUBLIC_MODEL,
	messages: [
	...(req.system ? [{ role: "system", content: req.system }] : []),
	{ role: "user", content: req.prompt },
	],
		temperature: req.temperature ?? 0.7,
	max_tokens: req.maxTokens ?? 1024,
	}),
	},
	Number(process.env.HERMES_PUBLIC_TIMEOUT_MS ?? 15000),
	);
	if (!upstream.ok) throw new Error(`Hermes public HTTP ${upstream.status}`);
	const data = (await upstream.json()) as { choices?: Array<{ message?: { content?: string } }> };
	const text = data.choices?.[0]?.message?.content?.trim();
	if (!text) throw new Error("Hermes public returned an invalid response");
	return { text, provider: "hermes-public", model: req.model ?? HERMES_PUBLIC_MODEL, latencyMs: null };
}

/**
 * OmniRoute Free LLM 호출
 */
async function callOmniRouteFree(req: KeylessRequest) {
	// Resolve at call time (env may be flipped in tests) and join the path
	// relatively so a `/v1` suffix in OMNIROUTE_BASE_URL is preserved —
	// `new URL("/chat/completions", base)` would drop it (see
	// getOmniRouteEndpoint for the full explanation).
	const route = getOmniRouteEndpoint();
	if (!route) {
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
		(options.headers as Record<string, string>)["Authorization"] =
			`Bearer ${process.env.OMNIROUTE_API_KEY}`;
	}

	const upstream = await fetch(route, options);

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

			// === 0순위: explicitly configured, sandboxed public Hermes ===
		if (HERMES_PUBLIC_API_URL) {
		try {
		const result = await callHermesPublic(req);
		if (result) return { ...result, tier: "hermes-public" };
		} catch (err) {
		request.log.warn({ err }, "Hermes public call failed; continuing to fallback providers");
		}
		}

		// === 1순위: OmniRoute Free LLM (OMNIROUTE_PRIORITY=true일 때) ===
		if (OMNIROUTE_PRIORITY && getOmniRouteEndpoint()) {
			try {
				const result = await callOmniRouteFree(req);
				if (result) {
					request.log.info(
						{ provider: result.provider, model: result.model },
						"OmniRoute Free LLM 성공",
					);
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
		if (!getOmniRouteEndpoint()) {
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
	providers: [...(HERMES_PUBLIC_API_URL ? ["hermes-public"] : []), ...getKeylessProviderNames()],
		tier: HERMES_PUBLIC_API_URL ? "hermes-public+keyless" : "keyless",
	};
	});
}
