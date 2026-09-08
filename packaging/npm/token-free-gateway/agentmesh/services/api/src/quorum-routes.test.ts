/**
 * Tests for POST /api/quorum/ask.
 *
 * Verifies that the quorum endpoint:
 *  - Rejects malformed input with 400 (Zod validation)
 *  - Calls hierarchicalAgentCast.cast() with the user question
 *  - Returns the consensus result shape on success
 *
 * The hierarchicalAgentCast module is mocked so the test stays hermetic
 * (no real LLM API calls).
 */

import { pino } from "pino";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "./server.js";

// Mock the agent-cast module so we never hit real LLMs in tests.
// vi.hoisted is required because vi.mock is hoisted above imports.
const { mockCast } = vi.hoisted(() => ({
	mockCast: vi.fn(),
}));

vi.mock("@agentmesh/agent-cast/src/hierarchy.js", () => ({
	hierarchicalAgentCast: { cast: mockCast },
}));

describe("POST /api/quorum/ask", () => {
	let app: Awaited<ReturnType<typeof buildApp>> | undefined;
	const originalEnv = { ...process.env };

	beforeEach(async () => {
		process.env.NODE_ENV = "test";
		process.env.DISABLE_AUTH = "true";
		app = await buildApp({
			logger: pino({ level: "silent" }),
			enableTransport: false,
		});
		mockCast.mockReset();
	});

	afterEach(async () => {
		if (app) {
			await app.close();
			app = undefined;
		}
		process.env = { ...originalEnv };
	});

	it("returns 400 when the question is missing", async () => {
		const res = await app?.inject({
			method: "POST",
			url: "/api/quorum/ask",
			payload: {},
		});
		expect(res?.statusCode).toBe(400);
		const body = res?.json() as { error?: string; requestId?: string };
		expect(body.error).toBeDefined();
		expect(body.requestId).toBeDefined();
		expect(mockCast).not.toHaveBeenCalled();
	});

	it("returns 400 when the question is an empty string", async () => {
		const res = await app?.inject({
			method: "POST",
			url: "/api/quorum/ask",
			payload: { question: "" },
		});
		expect(res?.statusCode).toBe(400);
		expect(mockCast).not.toHaveBeenCalled();
	});

	it("returns 400 when question exceeds 4096 characters", async () => {
		const res = await app?.inject({
			method: "POST",
			url: "/api/quorum/ask",
			payload: { question: "x".repeat(4097) },
		});
		expect(res?.statusCode).toBe(400);
		expect(mockCast).not.toHaveBeenCalled();
	});

	it("returns 200 with consensus result on a valid question", async () => {
		mockCast.mockResolvedValue({
			finalAnswer: "CRDT stands for Conflict-free Replicated Data Type.",
			agentResults: [
				{
					agentId: "Researcher",
					output: "CRDT is a data structure...",
					confidence: 0.95,
					latencyMs: 120,
				},
				{
					agentId: "Analyst",
					output: "Conflict-free Replicated Data Type...",
					confidence: 0.92,
					latencyMs: 98,
				},
			],
			consensusScore: 0.935,
			selectedAgents: ["Researcher", "Analyst"],
		});

		const res = await app?.inject({
			method: "POST",
			url: "/api/quorum/ask",
			payload: { question: "What is CRDT?" },
		});

		expect(res?.statusCode).toBe(200);
		expect(mockCast).toHaveBeenCalledTimes(1);
		expect(mockCast).toHaveBeenCalledWith(
			"What is CRDT?",
			expect.arrayContaining([
				expect.objectContaining({
					agentId: "user-query",
					output: "",
					confidence: 1,
					latencyMs: 0,
				}),
			]),
		);

		const body = res?.json() as {
			question: string;
			consensusScore: number;
			finalAnswer: string;
			selectedAgents: string[];
			agentResults: Array<{ agentId: string; output: string; confidence: number; latencyMs: number }>;
		};

		expect(body.question).toBe("What is CRDT?");
		expect(body.finalAnswer).toBe("CRDT stands for Conflict-free Replicated Data Type.");
		expect(body.consensusScore).toBe(0.935);
		expect(body.selectedAgents).toEqual(["Researcher", "Analyst"]);
		expect(body.agentResults).toHaveLength(2);
		expect(body.agentResults[0]?.agentId).toBe("Researcher");
		expect(body.agentResults[1]?.agentId).toBe("Analyst");
	});

	it("returns 502 when hierarchicalAgentCast throws", async () => {
		mockCast.mockRejectedValue(new Error("LLM service unavailable"));

		const res = await app?.inject({
			method: "POST",
			url: "/api/quorum/ask",
			payload: { question: "What is the meaning of life?" },
		});

		expect(res?.statusCode).toBe(502);
		const body = res?.json() as { error?: string; requestId?: string };
		expect(body.error).toBe("Quorum service failed");
		expect(body.requestId).toBeDefined();
	});
});
