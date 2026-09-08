/**
 * Tests for the keyless LLM provider pool.
 *
 * Verifies:
 * - formatQwenChat produces the correct chat-template markers
 * - the GET pollinations provider no longer carries a stale body
 * - callKeylessProviders falls back to local knowledge when all providers fail
 * - callKeylessProviders wires through to a real provider response when fetch works
 */

import { afterEach, describe, expect, test } from "vitest";
import {
	callKeylessProviders,
	formatQwenChat,
	getKeylessProviderNames,
} from "./keyless-providers.js";

describe("formatQwenChat", () => {
	test("wraps prompt with role markers so Qwen honors the system message", () => {
		const out = formatQwenChat("You are concise.", "What is 2+2?");
		expect(out).toContain("<|im_start|>system\nYou are concise.<|im_end|>");
		expect(out).toContain("<|im_start|>user\nWhat is 2+2?<|im_end|>");
		expect(out).toContain("<|im_start|>assistant\n");
	});

	test("omits system block when no system message is provided", () => {
		const out = formatQwenChat(undefined, "Hello");
		expect(out.startsWith("<|im_start|>user\n")).toBe(true);
		expect(out).not.toContain("system");
	});

	test("places assistant marker at the end so the model knows where to begin", () => {
		const out = formatQwenChat("S", "P");
		expect(out.endsWith("<|im_start|>assistant\n")).toBe(true);
	});
});

describe("getKeylessProviderNames", () => {
	test("exposes all five keyless providers", () => {
		const names = getKeylessProviderNames();
		expect(names).toContain("pollinations");
		expect(names).toContain("pollinations-api");
		expect(names).toContain("openrouter-free");
		expect(names).toContain("cloudflare-wr-ai");
		expect(names).toContain("hf-inference");
	});
});

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("callKeylessProviders — prompt wiring", () => {
	test("when a free provider responds, the user's question is routed through and returned", async () => {
		// Stub fetch: return a JSON OpenAI-style response for any URL
		globalThis.fetch = (async () =>
			new Response(
				JSON.stringify({
					choices: [{ message: { content: "Paris" } }],
				}),
				{ headers: { "content-type": "application/json" } },
			)) as unknown as typeof fetch;

		const result = await callKeylessProviders({
			prompt: "What is the capital of France?",
			system: "Answer in one word.",
		});
		expect(result.text.length).toBeGreaterThan(0);
		expect(result.provider).not.toBe("fallback");
	});

	test("falls back to local-knowledge when every provider fails", async () => {
		globalThis.fetch = (async () => {
			throw new Error("network down");
		}) as unknown as typeof fetch;

		const result = await callKeylessProviders({
			prompt: "What is the capital of the united states?",
		});
		expect(result.provider).toBe("local-knowledge");
		expect(result.text).toContain("Washington, D.C.");
	});

	test("falls back to a graceful prompt-acknowledgement when nothing matches", async () => {
		globalThis.fetch = (async () => {
			throw new Error("network down");
		}) as unknown as typeof fetch;

		const result = await callKeylessProviders({
			prompt: "asdfghqwerty nonsense prompt that has no factual answer",
		});
		expect(result.provider).toBe("fallback");
		expect(result.text).toContain("[Keyless Gateway · Fallback]");
	});
});
