/**
 * Tests for the keyless LLM provider pool.
 *
 * Verifies:
 * - the local mesh-llm node (localhost:9337) is the highest-priority provider
 * - the pollinations POST API is tried next and returned on success
 * - callKeylessProviders falls back to local knowledge when all providers fail
 * - callKeylessProviders wires through to a real provider response when fetch works
 */

import { afterEach, describe, expect, test } from "vitest";
import { callKeylessProviders, getKeylessProviderNames } from "./keyless-providers.js";

describe("getKeylessProviderNames", () => {
	test("exposes mesh-llm first, then the pollinations POST API", () => {
		const names = getKeylessProviderNames();
		expect(names).toEqual(["mesh-llm", "pollinations-api"]);
	});
});

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("callKeylessProviders — prompt wiring", () => {
	test("when a provider responds, the local mesh-llm node answers first", async () => {
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
		expect(result.provider).toBe("mesh-llm");
	});

	test("falls back to the pollinations POST API when mesh-llm is offline", async () => {
		globalThis.fetch = (async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("9337")) {
				throw new Error("mesh-llm not running");
			}
			return new Response(JSON.stringify({ choices: [{ message: { content: "Madrid" } }] }), {
				headers: { "content-type": "application/json" },
			});
		}) as unknown as typeof fetch;

		const result = await callKeylessProviders({ prompt: "Capital of Spain?" });
		expect(result.text).toBe("Madrid");
		expect(result.provider).toBe("pollinations-api");
	});

	test("races both live providers in parallel but returns the mesh-llm result (array order)", async () => {
		let calls = 0;
		globalThis.fetch = (async () => {
			calls++;
			return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
				headers: { "content-type": "application/json" },
			});
		}) as unknown as typeof fetch;

		const result = await callKeylessProviders({ prompt: "hi" });
		// both configured providers are raced; the first in the array wins
		expect(calls).toBe(2);
		expect(result.provider).toBe("mesh-llm");
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
