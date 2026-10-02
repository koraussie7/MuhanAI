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
// OMNIROUTE_PRIORITY=false 이면 OmniRoute를 건너뛰고 keyless provider 테스트
// NOTE: vitest 워커 재사용 시 모듈 스코프 상수가 이전 env를 고정시키므로,
// 요청 시점에 env를 읽는 함수로 평가한다 (테스트 격리 보장).
function isOmniRoutePriority(): boolean {
  return process.env.OMNIROUTE_PRIORITY !== "false";
}
function getOmniRouteChatRoute(): URL | null {
  const raw = process.env.OMNIROUTE_BASE_URL ?? process.env.OPENAI_BASE_URL ?? "";
  // 빈 문자열/공백/env 미설정 → OmniRoute 비활성 (keyless 풀 사용)
  const base = raw.trim().replace(/\/+$/, "");
  if (!base) return null;
  try {
    return new URL("/chat/completions", base);
  } catch {
    return null;
  }
}
const OMNIROUTE_MODEL = process.env.OMNIROUTE_MODEL ?? process.env.OPENAI_DEFAULT_MODEL ?? "openai/gpt-4o-mini";

/**
 * OmniRoute Free LLM 호출
 */
async function callOmniRouteFree(req: KeylessRequest, chatRoute: URL | null) {
	if (!chatRoute) {
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

	const upstream = await fetch(chatRoute.toString(), options);

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
		// NOTE: 요청 시점에 env 평가 — vitest 워커 재사용 시 테스트 격리 보장
		const chatRoute = getOmniRouteChatRoute();
		if (isOmniRoutePriority() && chatRoute) {
			try {
				const result = await callOmniRouteFree(req, chatRoute);
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
		if (!chatRoute) {
			return clientError(reply, 502, "All LLM providers failed", request.id);
		}

		try {
			const result = await callOmniRouteFree(req, chatRoute);
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
