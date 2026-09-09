/**
 * Tests for LLMRouter OpenAI-provider OmniRoute base URL wiring.
 *
 * Verifies:
 * - getOpenAI() honors OPENAI_BASE_URL when set
 * - getOpenAI() honors OMNIROUTE_BASE_URL when set (alternative var name)
 * - getOpenAI() omits baseURL when neither env var is set
 * - generateOpenAI() honors OPENAI_DEFAULT_MODEL env var
 * - generateOpenAI() still returns the mock when OPENAI_API_KEY is missing
 *   (no baseURL accidentally makes the mock path fire)
 * - getAvailableProviders() does not regress (OpenAI listed iff key present)
 *
 * We do NOT spin up a real OpenAI client. Instead we stub `require("openai")`
 * to capture the constructor config and replace `client.chat.completions.create`
 * with a vitest spy so generateOpenAI's downstream call is observable.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

type OpenAIConfig = { apiKey?: string; baseURL?: string };

function clearOpenAIEnv() {
	delete process.env.OPENAI_API_KEY;
	delete process.env.OPENAI_BASE_URL;
	delete process.env.OMNIROUTE_BASE_URL;
	delete process.env.OPENAI_DEFAULT_MODEL;
}

async function loadRouterWithOpenAIStub(
	stub: (cfg: OpenAIConfig) => any,
	envOverrides: Record<string, string | undefined> = {},
) {
	clearOpenAIEnv();
	for (const [k, v] of Object.entries(envOverrides)) {
		if (v === undefined) delete process.env[k];
		else process.env[k] = v;
	}

	const captured: OpenAIConfig[] = [];
	const fakeOpenAI = vi.fn((cfg: OpenAIConfig) => {
		captured.push(cfg);
		return stub(cfg);
	});
	(fakeOpenAI as any).default = fakeOpenAI;

	// The router file uses `require("openai").default` (CJS-style lazy require).
	// vi.doMock doesn't intercept that path reliably, so we patch the CommonJS
	// require cache directly. We also reset ESM module state so a fresh
	// `llmRouter` singleton is created per test (avoiding client reuse).
	vi.resetModules();

	type Moduleish = { exports: unknown };
	const moduleCache = require.cache as Record<string, Moduleish>;
	const openaiPath = require.resolve("openai");
	moduleCache[openaiPath] = {
		exports: { default: fakeOpenAI, OpenAI: fakeOpenAI },
	} as Moduleish;

	const mod = await import("./index.js");
	return { llmRouter: mod.llmRouter, captured, fakeOpenAI };
}

function buildFakeOpenAIClient(chatResponse: any): any {
	return {
		chat: {
			completions: {
				create: vi.fn(async () => chatResponse),
			},
		},
	};
}

const SUCCESS_RESPONSE = {
	choices: [{ message: { content: "hello back" } }],
	model: "gpt-4-turbo",
	usage: { prompt_tokens: 5, completion_tokens: 3 },
};

describe("LLMRouter OpenAI base URL wiring (OmniRoute scenario 2)", () => {
	afterEach(() => {
		clearOpenAIEnv();
		vi.doUnmock("openai");
		// Drop the CJS cache entry we set in loadRouterWithOpenAIStub so the next
		// test sees a fresh module graph and our stub doesn't leak.
		const moduleCache = require.cache as Record<string, { exports: unknown }>;
		const openaiPath = require.resolve("openai");
		delete moduleCache[openaiPath];
		vi.restoreAllMocks();
	});

	test("honors OPENAI_BASE_URL when constructing the client", async () => {
		const fakeClient = buildFakeOpenAIClient(SUCCESS_RESPONSE);
		const { llmRouter, captured } = await loadRouterWithOpenAIStub(
			() => fakeClient,
			{ OPENAI_API_KEY: "sk-test", OPENAI_BASE_URL: "http://localhost:20128/v1" },
		);

		const res = await llmRouter.generate({ prompt: "hi", provider: "openai" });

		expect(captured).toHaveLength(1);
		expect(captured[0]?.apiKey).toBe("sk-test");
		expect(captured[0]?.baseURL).toBe("http://localhost:20128/v1");
		expect(res.provider).toBe("openai");
		expect(res.model).toBe("gpt-4-turbo");
		expect(res.text).toBe("hello back");
	});

	test("honors OMNIROUTE_BASE_URL as a fallback alias", async () => {
		const fakeClient = buildFakeOpenAIClient(SUCCESS_RESPONSE);
		const { llmRouter, captured } = await loadRouterWithOpenAIStub(
			() => fakeClient,
			{ OPENAI_API_KEY: "sk-test", OMNIROUTE_BASE_URL: "http://localhost:20128/v1" },
		);

		await llmRouter.generate({ prompt: "hi", provider: "openai" });

		expect(captured[0]?.baseURL).toBe("http://localhost:20128/v1");
	});

	test("OPENAI_BASE_URL takes precedence over OMNIROUTE_BASE_URL", async () => {
		const fakeClient = buildFakeOpenAIClient(SUCCESS_RESPONSE);
		const { llmRouter, captured } = await loadRouterWithOpenAIStub(
			() => fakeClient,
			{
				OPENAI_API_KEY: "sk-test",
				OPENAI_BASE_URL: "http://primary.example/v1",
				OMNIROUTE_BASE_URL: "http://fallback.example/v1",
			},
		);

		await llmRouter.generate({ prompt: "hi", provider: "openai" });

		expect(captured[0]?.baseURL).toBe("http://primary.example/v1");
	});

	test("omits baseURL when neither env var is set (default OpenAI)", async () => {
		const fakeClient = buildFakeOpenAIClient(SUCCESS_RESPONSE);
		const { llmRouter, captured } = await loadRouterWithOpenAIStub(
			() => fakeClient,
			{ OPENAI_API_KEY: "sk-test" },
		);

		await llmRouter.generate({ prompt: "hi", provider: "openai" });

		expect(captured[0]?.apiKey).toBe("sk-test");
		expect(captured[0]?.baseURL).toBeUndefined();
	});

	test("OPENAI_DEFAULT_MODEL overrides the gpt-4-turbo-preview default", async () => {
		const fakeClient = buildFakeOpenAIClient(SUCCESS_RESPONSE);
		const { llmRouter } = await loadRouterWithOpenAIStub(() => fakeClient, {
			OPENAI_API_KEY: "sk-test",
			OPENAI_DEFAULT_MODEL: "claude-opus-4",
			OPENAI_BASE_URL: "http://localhost:20128/v1",
		});

		await llmRouter.generate({ prompt: "hi", provider: "openai" });

		const create = fakeClient.chat.completions.create as ReturnType<typeof vi.fn>;
		const callArg = create.mock.calls[0]?.[0] as { model: string };
		expect(callArg.model).toBe("claude-opus-4");
	});

	test("explicit req.model wins over OPENAI_DEFAULT_MODEL", async () => {
		const fakeClient = buildFakeOpenAIClient(SUCCESS_RESPONSE);
		const { llmRouter } = await loadRouterWithOpenAIStub(() => fakeClient, {
			OPENAI_API_KEY: "sk-test",
			OPENAI_DEFAULT_MODEL: "claude-opus-4",
		});

		await llmRouter.generate({ prompt: "hi", model: "gpt-4o", provider: "openai" });

		const create = fakeClient.chat.completions.create as ReturnType<typeof vi.fn>;
		const callArg = create.mock.calls[0]?.[0] as { model: string };
		expect(callArg.model).toBe("gpt-4o");
	});

	test("falls back to mock when OPENAI_API_KEY is missing — no baseURL crash", async () => {
		// No OPENAI_API_KEY means getOpenAI() returns null and generateOpenAI short-circuits
		// to generateMock(). This must remain true even if baseURL is set.
		const { llmRouter } = await loadRouterWithOpenAIStub(
			() => {
				throw new Error("openai client should not be constructed without API key");
			},
			{ OPENAI_BASE_URL: "http://localhost:20128/v1" },
		);

		const res = await llmRouter.generate({ prompt: "hi", provider: "openai" });
		expect(res.provider).toBe("openai");
		expect(res.text).toContain("Mock Mode");
		expect(res.text).toContain("OPENAI_API_KEY");
	});

	test("getAvailableProviders() still requires OPENAI_API_KEY (no OmniRoute bypass)", async () => {
		const { llmRouter } = await loadRouterWithOpenAIStub(
			() => buildFakeOpenAIClient(SUCCESS_RESPONSE),
			{ OPENAI_BASE_URL: "http://localhost:20128/v1" },
		);

		const providers = llmRouter.getAvailableProviders();
		expect(providers).not.toContain("openai");
	});

	test("getAvailableProviders() includes openai when key is set, regardless of baseURL", async () => {
		const { llmRouter } = await loadRouterWithOpenAIStub(
			() => buildFakeOpenAIClient(SUCCESS_RESPONSE),
			{ OPENAI_API_KEY: "sk-test", OPENAI_BASE_URL: "http://localhost:20128/v1" },
		);

		const providers = llmRouter.getAvailableProviders();
		expect(providers).toContain("openai");
	});

	test("does not regress on existing parameters — temperature and max_tokens still passed", async () => {
		const fakeClient = buildFakeOpenAIClient(SUCCESS_RESPONSE);
		const { llmRouter } = await loadRouterWithOpenAIStub(() => fakeClient, {
			OPENAI_API_KEY: "sk-test",
			OPENAI_BASE_URL: "http://localhost:20128/v1",
		});

		await llmRouter.generate({
			prompt: "hi",
			system: "be terse",
			provider: "openai",
			temperature: 0.7,
			maxTokens: 256,
		});

		const create = fakeClient.chat.completions.create as ReturnType<typeof vi.fn>;
		const callArg = create.mock.calls[0]?.[0] as {
			model: string;
			messages: Array<{ role: string; content: string }>;
			temperature: number;
			max_tokens: number;
		};
		expect(callArg.messages).toEqual([
			{ role: "system", content: "be terse" },
			{ role: "user", content: "hi" },
		]);
		expect(callArg.temperature).toBe(0.7);
		expect(callArg.max_tokens).toBe(256);
	});

	test("usage is reported through the OpenAI path even when baseURL points at OmniRoute", async () => {
		const fakeClient = buildFakeOpenAIClient(SUCCESS_RESPONSE);
		const { llmRouter } = await loadRouterWithOpenAIStub(() => fakeClient, {
			OPENAI_API_KEY: "sk-test",
			OPENAI_BASE_URL: "http://localhost:20128/v1",
		});

		const res = await llmRouter.generate({ prompt: "hi", provider: "openai" });
		expect(res.usage).toEqual({ inputTokens: 5, outputTokens: 3 });
	});
});
