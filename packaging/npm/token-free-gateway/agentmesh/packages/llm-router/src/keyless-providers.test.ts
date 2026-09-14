/**
 * Tests for the keyless LLM provider pool.
 *
 * Verifies:
 * - only the verified-live providers remain (dead paths removed)
 * - the pollinations POST API is tried first and returned on success
 * - callKeylessProviders falls back to local knowledge when all providers fail
 * - callKeylessProviders wires through to a real provider response when fetch works
 */

import { afterEach, describe, expect, test } from "vitest";
import { callKeylessProviders, getKeylessProviderNames } from "./keyless-providers.js";

describe("getKeylessProviderNames", () => {
	test("exposes only the pollinations POST API provider (dead paths removed)", () => {
		const names = getKeylessProviderNames();
		expect(names).toEqual(["pollinations-api"]);
	});
});

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("callKeylessProviders — prompt wiring", () => {
	test("when a free provider responds, the user's question is routed through the pollinations POST API", async () => {
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
		expect(result.text).toBe("Paris");
		expect(result.provider).toBe("pollinations-api");
	});

	test("only attempts the live pollinations POST API (no dead provider calls)", async () => {
		let calls = 0;
		globalThis.fetch = (async () => {
			calls++;
			return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
				headers: { "content-type": "application/json" },
			});
		}) as unknown as typeof fetch;

		await callKeylessProviders({ prompt: "hi" });
		expect(calls).toBe(1);
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
