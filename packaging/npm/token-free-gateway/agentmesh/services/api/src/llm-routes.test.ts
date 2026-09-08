/**
 * End-to-end test for POST /api/llm/chat.
 *
 * Verifies the user-question → free-LLM chain that CosmicPromptBar.tsx
 * hits when the user types a question in the prompt bar (e.g.
 * "한국의 인구수는" or "What is the capital of France?").
 *
 * The test mocks globalThis.fetch so it doesn't actually hit the network —
 * it verifies the endpoint routes the prompt through to the keyless provider
 * pool and returns the provider's text.
 */

import { pino } from "pino";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./server.js";

const originalFetch = globalThis.fetch;

describe("POST /api/llm/chat — user prompt wiring", () => {
	let app: Awaited<ReturnType<typeof buildApp>> | undefined;

	beforeEach(async () => {
		process.env.DISABLE_AUTH = "true";
		process.env.NODE_ENV = "development";
		app = await buildApp({
			logger: pino({ level: "silent" }),
			enableTransport: false,
		});
	});

	afterEach(async () => {
		if (app) {
			await app.close();
			app = undefined;
		}
		globalThis.fetch = originalFetch;
		process.env.NODE_ENV = "test";
	});

	it("routes a Korean question through the keyless pool and returns the LLM text", async () => {
		// Mock every fetch to return a successful OpenAI-style chat completion.
		globalThis.fetch = (async () =>
			new Response(
				JSON.stringify({
					choices: [
						{
							message: {
								content: "대한민국의 인구는 약 5,180만 명입니다 (2024년 기준).",
							},
						},
					],
				}),
				{ headers: { "content-type": "application/json" } },
			)) as unknown as typeof fetch;

		const res = await app?.inject({
			method: "POST",
			url: "/api/llm/chat",
			payload: { prompt: "한국의 인구수는" },
		});

		expect(res?.statusCode).toBe(200);
		const body = res?.json() as {
			text?: string;
			provider?: string;
			model?: string;
			latencyMs?: number;
			tier?: string;
		};
		expect(typeof body.text).toBe("string");
		expect((body.text ?? "").length).toBeGreaterThan(0);
		expect(body.provider).not.toBe("fallback");
		expect(body.tier).toBe("keyless");
	});

	it("passes the system prompt through to the keyless provider body", async () => {
		const seenBodies: any[] = [];
		globalThis.fetch = (async (_url: any, init: any) => {
			seenBodies.push(JSON.parse(init?.body ?? "{}"));
			return new Response(
				JSON.stringify({
					choices: [{ message: { content: "ok" } }],
				}),
				{ headers: { "content-type": "application/json" } },
			);
		}) as unknown as typeof fetch;

		const res = await app?.inject({
			method: "POST",
			url: "/api/llm/chat",
			payload: {
				prompt: "What is 2+2?",
				system: "Answer in one word.",
			},
		});

		expect(res?.statusCode).toBe(200);
		// All 5 keyless providers run in parallel — at least one of the
		// OpenAI-style providers (pollinations-api, openrouter-free,
		// cloudflare-wr-ai) receives the system message in `messages`,
		// and the hf-inference provider receives it via the Qwen chat template.
		const allMessages = seenBodies.flatMap((b) => (b?.messages ?? []) as any[]);
		const sys = allMessages.find((m) => m?.role === "system");
		const qwenSys = seenBodies.some((b) =>
			typeof b?.inputs === "string" && b.inputs.includes("Answer in one word."),
		);
		expect(sys?.content === "Answer in one word." || qwenSys).toBe(true);
	});

	it("falls back to a graceful payload when every provider fails", async () => {
		globalThis.fetch = (async () => {
			throw new Error("network down");
		}) as unknown as typeof fetch;

		const res = await app?.inject({
			method: "POST",
			url: "/api/llm/chat",
			payload: { prompt: "What is the capital of the united states?" },
		});

		expect(res?.statusCode).toBe(200);
		const body = res?.json() as {
			text?: string;
			provider?: string;
		};
		expect(body.provider).toBe("local-knowledge");
		expect(body.text).toContain("Washington, D.C.");
	});

	it("returns 400 for an empty prompt", async () => {
		const res = await app?.inject({
			method: "POST",
			url: "/api/llm/chat",
			payload: { prompt: "" },
		});
		expect(res?.statusCode).toBe(400);
	});
});
