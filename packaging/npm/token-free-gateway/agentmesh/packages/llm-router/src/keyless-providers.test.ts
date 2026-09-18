/**
 * Tests for the keyless LLM provider pool.
 *
 * Verifies:
 * - the local mesh-llm node (localhost:9337) is the highest-priority provider
 * - the pollinations POST API is tried next and returned on success
 * - the OmniRoute free-tier mesh is spliced in at index 1 when
 *   OMNIROUTE_BASE_URL is configured, and *only* then
 * - getOmniRouteEndpoint preserves any configured path prefix (the `/v1`
 *   regression that a leading-slash `new URL()` would silently drop)
 * - callKeylessProviders falls back to local knowledge when all providers fail
 * - callKeylessProviders wires through to a real provider response when fetch works
 */

import { afterEach, describe, expect, test } from "vitest";
import {
	buildKeylessProviders,
	callKeylessProviders,
	getKeylessProviderNames,
	getOmniRouteEndpoint,
} from "./keyless-providers.js";

// The suite shares the vitest fork with sibling suites, so snapshot and
// restore the OmniRoute envs around every test.
const ENV_KEYS = ["OMNIROUTE_BASE_URL", "OMNIROUTE_API_KEY"] as const;
const ENV_SNAPSHOT = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]])) as Record<
	(typeof ENV_KEYS)[number],
	string | undefined
>;

afterEach(() => {
	for (const key of ENV_KEYS) {
		const value = ENV_SNAPSHOT[key];
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
});

describe("getKeylessProviderNames", () => {
	test("exposes mesh-llm first, then the pollinations POST API", () => {
		delete process.env.OMNIROUTE_BASE_URL;
		const names = getKeylessProviderNames();
		expect(names).toEqual(["mesh-llm", "pollinations-api"]);
	});
});

describe("getOmniRouteEndpoint", () => {
	test("returns null when OMNIROUTE_BASE_URL is unset", () => {
		delete process.env.OMNIROUTE_BASE_URL;
		expect(getOmniRouteEndpoint()).toBeNull();
	});

	test("preserves the /v1 path prefix instead of resolving against the origin", () => {
		process.env.OMNIROUTE_BASE_URL = "http://localhost:20128/v1";
		// A leading-slash path would yield http://localhost:20128/chat/completions
		// and silently break every OmniRoute call — this is the regression guard.
		expect(getOmniRouteEndpoint()).toBe("http://localhost:20128/v1/chat/completions");
	});

	test("tolerates a trailing slash and a nested prefix", () => {
		process.env.OMNIROUTE_BASE_URL = "https://zen.example.com/api/v1/";
		expect(getOmniRouteEndpoint()).toBe("https://zen.example.com/api/v1/chat/completions");
	});

	test("returns the base unchanged when it already points at chat/completions", () => {
		process.env.OMNIROUTE_BASE_URL = "http://localhost:20128/v1/chat/completions";
		expect(getOmniRouteEndpoint()).toBe("http://localhost:20128/v1/chat/completions");
	});

	test("returns null for an unparseable base URL", () => {
		process.env.OMNIROUTE_BASE_URL = "not a url";
		expect(getOmniRouteEndpoint()).toBeNull();
	});
});

describe("buildKeylessProviders — OmniRoute splice", () => {
	test("keeps the original two-provider surface when OmniRoute is unconfigured", () => {
		delete process.env.OMNIROUTE_BASE_URL;
		expect(buildKeylessProviders().map((p) => p.name)).toEqual(["mesh-llm", "pollinations-api"]);
	});

	test("inserts omniroute-auto at index 1 so the free pool beats pollinations", () => {
		process.env.OMNIROUTE_BASE_URL = "http://localhost:20128/v1";
		const providers = buildKeylessProviders();
		expect(providers.map((p) => p.name)).toEqual([
			"mesh-llm",
			"omniroute-auto",
			"pollinations-api",
		]);
		expect(providers[1]?.endpoint).toBe("http://localhost:20128/v1/chat/completions");
	});

	test("omits the Authorization header when OMNIROUTE_API_KEY is unset", () => {
		process.env.OMNIROUTE_BASE_URL = "http://localhost:20128/v1";
		delete process.env.OMNIROUTE_API_KEY;
		const entry = buildKeylessProviders().find((p) => p.name === "omniroute-auto");
		expect(entry?.headers.Authorization).toBeUndefined();
	});

	test("adds the Authorization header when OMNIROUTE_API_KEY is set", () => {
		process.env.OMNIROUTE_BASE_URL = "http://localhost:20128/v1";
		process.env.OMNIROUTE_API_KEY = "sk-test";
		const entry = buildKeylessProviders().find((p) => p.name === "omniroute-auto");
		expect(entry?.headers.Authorization).toBe("Bearer sk-test");
	});

	test("defaults the OmniRoute model to `auto` so the combo engine routes", () => {
		process.env.OMNIROUTE_BASE_URL = "http://localhost:20128/v1";
		const entry = buildKeylessProviders().find((p) => p.name === "omniroute-auto");
		const body = entry?.body({ prompt: "hi" }) as Record<string, unknown>;
		expect(body.model).toBe("auto");
		expect(body.stream).toBe(false);
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
		globalThis.fetch = (async (input: string | URL) => {
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
