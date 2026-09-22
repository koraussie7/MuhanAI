import { beforeEach, describe, expect, test } from "vitest";
import { fastDecider, LAYA_CONFIG } from "../index.js";

// Mock fetch for testing when laya sidecar is unavailable
type MockResponse = {
	ok: boolean;
	status: number;
	json: () => Promise<unknown>;
	text: () => Promise<string>;
};

const mockFetch = (impl: (url: string, opts: RequestInit) => Promise<MockResponse>) => {
	global.fetch = impl as unknown as typeof fetch;
};

describe("FastDecider", () => {
	beforeEach(() => {
		// Reset mock
		global.fetch = undefined as unknown as typeof fetch;
	});

	test("health check config defaults to localhost:8123", () => {
		expect(LAYA_CONFIG.endpoint).toBe("http://localhost:8123");
	});

	test("decideIntent returns intent with confidence", async () => {
		const mockResponse = {
			result: {
				intent: [
					{ label: "coding", probability: 0.95 },
					{ label: "research", probability: 0.05 },
				],
			},
		};

		mockFetch(async () => ({
			ok: true,
			status: 200,
			json: async () => mockResponse,
			text: async () => JSON.stringify(mockResponse),
		}));

		const result = await fastDecider.decideIntent("How do I fix this React component?", {
			coding: "code-related questions",
			research: "research and knowledge",
		});

		expect(result.intent).toBe("coding");
		expect(result.confidence).toBe(0.95);
		expect(result.needsLLM).toBe(false);
	});

	test("decideIntent escalates to LLM when confidence is low", async () => {
		const mockResponse = {
			result: {
				intent: [
					{ label: "coding", probability: 0.6 },
					{ label: "research", probability: 0.4 },
				],
			},
		};

		mockFetch(async () => ({
			ok: true,
			status: 200,
			json: async () => mockResponse,
			text: async () => JSON.stringify(mockResponse),
		}));

		const result = await fastDecider.decideIntent("Help", {
			coding: "code-related questions",
			research: "research and knowledge",
		});

		expect(result.needsLLM).toBe(true);
	});

	test("scoreSpam returns probability", async () => {
		const mockResponse = {
			result: {
				spam: [{ label: "spam", probability: 0.9 }],
			},
		};

		mockFetch(async () => ({
			ok: true,
			status: 200,
			json: async () => mockResponse,
			text: async () => JSON.stringify(mockResponse),
		}));

		const score = await fastDecider.scoreSpam("Buy viagra now!!!");
		expect(score).toBe(0.9);
	});

	test("handles decide failures with error", async () => {
		mockFetch(async () => ({
			ok: false,
			status: 500,
			json: async () => ({ detail: "internal error" }),
			text: async () => "internal error",
		}));

		await expect(fastDecider.decideIntent("test", { coding: "code questions" })).rejects.toThrow(
			"laya decide failed",
		);
	});
});
