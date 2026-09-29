import { afterEach, describe, expect, test } from "vitest";
import { createSwarmLlmProvider, getSwarmLlmEndpoint } from "./swarmllm-provider.js";

const ENV_KEYS = ["SWARMLLM_BASE_URL", "SWARMLLM_KEY", "SWARMLLM_MODEL"] as const;
const snapshot = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]])) as Record<
	(typeof ENV_KEYS)[number],
	string | undefined
>;

afterEach(() => {
	for (const key of ENV_KEYS) {
		const value = snapshot[key];
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
});

describe("SwarmLLM provider adapter", () => {
	test("normalizes root, v1, and completion URLs", () => {
		expect(getSwarmLlmEndpoint("http://localhost:8800")).toBe(
			"http://localhost:8800/v1/chat/completions",
		);
		expect(getSwarmLlmEndpoint("http://localhost:8800/v1/")).toBe(
			"http://localhost:8800/v1/chat/completions",
		);
		expect(getSwarmLlmEndpoint("http://localhost:8800/v1/chat/completions")).toBe(
			"http://localhost:8800/v1/chat/completions",
		);
		expect(getSwarmLlmEndpoint("not a URL")).toBeNull();
	});

	test("builds an authenticated OpenAI-compatible request", () => {
		process.env.SWARMLLM_BASE_URL = "http://localhost:8800";
		process.env.SWARMLLM_KEY = "swarm-secret";
		process.env.SWARMLLM_MODEL = "qwen-local";
		const provider = createSwarmLlmProvider();
		expect(provider?.endpoint).toBe("http://localhost:8800/v1/chat/completions");
		expect(provider?.headers.Authorization).toBe("Bearer swarm-secret");
		expect(provider?.body({ prompt: "hello", system: "be concise" })).toEqual({
			messages: [
				{ role: "system", content: "be concise" },
				{ role: "user", content: "hello" },
			],
			model: "qwen-local",
			temperature: 0.3,
			max_tokens: 4096,
			stream: false,
		});
	});

	test("parses OpenAI message content and rejects malformed responses", () => {
		process.env.SWARMLLM_BASE_URL = "http://localhost:8800";
		const provider = createSwarmLlmProvider();
		expect(provider?.parse({ choices: [{ message: { content: "done" } }] })).toBe("done");
		expect(provider?.parse({ choices: [{ message: { content: 42 } }] })).toBe("");
		expect(provider?.parse(null)).toBe("");
	});
});
