import type { AgentRequest, AgentResult } from "@agentmesh/core";
import { beforeEach, describe, expect, it } from "vitest";
import { RecursiveCast } from "./recursive.js";

interface AgentLike {
	id: string;
	capabilities?: string[];
}

interface ExecutorLike {
	execute(agentId: string, request: AgentRequest): Promise<AgentResult>;
	registry?: unknown;
}

function makeExecutor(
	agents: AgentLike[],
): ExecutorLike {
	const list = agents;
	const map = new Map(agents.map((a) => [a.id, a]));
	return {
		async execute(agentId: string, request: AgentRequest) {
			const agent = map.get(agentId);
			if (!agent) throw new Error(`Agent not found: ${agentId}`);
			return {
				requestId: request.id,
				agentId,
				answer: `answer-from-${agentId}`,
				confidence: 0.9,
				latencyMs: 5,
			};
		},
		registry: { list: () => list },
	};
}

describe("RecursiveCast", () => {
	let executor: ExecutorLike;
	let cast: RecursiveCast;

	beforeEach(() => {
		executor = makeExecutor([
			{ id: "agent-a", capabilities: ["summarize"] },
			{ id: "agent-b", capabilities: ["summarize"] },
			{ id: "agent-c", capabilities: ["translate"] },
		]);
		cast = new RecursiveCast(executor as unknown as import("@agentmesh/agent").AgentExecutor);
	});

	it("delegates to a local agent and returns its result", async () => {
		const result = await cast.delegate({
			request: {
				id: "req-1",
				question: "summarize X",
				requiredCapabilities: ["summarize"],
			},
			excludeAgentIds: ["self"],
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(["agent-a", "agent-b"]).toContain(result.result.agentId);
		expect(result.depth).toBe(1);
	});

	it("respects maxDepth and returns depth_exceeded", async () => {
		const result = await cast.delegate({
			request: { id: "req-1", question: "x", requiredCapabilities: ["summarize"] },
			excludeAgentIds: [],
			maxDepth: 1,
		}, ["self", "agent-a"]);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.reason).toBe("depth_exceeded");
	});

	it("returns no_agent_available when nothing matches the capability", async () => {
		const result = await cast.delegate({
			request: { id: "req-1", question: "x", requiredCapabilities: ["nonexistent"] },
			excludeAgentIds: [],
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.reason).toBe("no_agent_available");
	});

	it("enforces budget across recursive calls", async () => {
		const rec = new RecursiveCast(executor as unknown as import("@agentmesh/agent").AgentExecutor);
		const r1 = await rec.delegate({
			request: { id: "r1", question: "x", requiredCapabilities: ["summarize"] },
			excludeAgentIds: [],
			budget: 1,
		});
		expect(r1.ok).toBe(true);
		const r2 = await rec.delegate({
			request: { id: "r2", question: "y", requiredCapabilities: ["summarize"] },
			excludeAgentIds: [],
			budget: 1,
		});
		expect(r2.ok).toBe(false);
		if (r2.ok) return;
		expect(r2.reason).toBe("budget_exceeded");
	});

	it("routes via peerRouter when configured", async () => {
		const peer = new RecursiveCast(
			executor as unknown as import("@agentmesh/agent").AgentExecutor,
			() => ({
				requestId: "peer-1",
				agentId: "remote-agent",
				answer: "from-peer",
				confidence: 0.95,
				latencyMs: 12,
			}),
		);
		const result = await peer.delegate({
			request: { id: "req-1", question: "x" },
			excludeAgentIds: ["self"],
			requiredCapability: "summarize",
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.result.agentId).toBe("remote-agent");
		expect(result.result.answer).toBe("from-peer");
	});
});
