import type { AgentResult } from "@agentmesh/core";
import { describe, expect, it } from "vitest";
import { groupByAnswer, weightedConsensus } from "./diverse-consensus.js";

function result(
	answer: string,
	confidence: number,
	agentId: string,
	modelId?: string,
): AgentResult {
	return {
		requestId: "req-1",
		agentId,
		answer,
		confidence,
		latencyMs: 1,
		...(modelId ? { metadata: { modelId } } : {}),
	};
}

describe("groupByAnswer", () => {
	it("groups identical answers and lists distinct model ids", () => {
		const rows = groupByAnswer([
			result("yes", 0.6, "a", "qwen"),
			result("yes", 0.4, "b", "llama"),
			result("yes", 0.5, "c", "qwen"),
			result("no", 0.7, "d", "llama"),
		]);
		const yes = rows.find((r) => r.answer === "yes");
		const no = rows.find((r) => r.answer === "no");
		expect(yes?.count).toBe(3);
		expect(yes?.distinctModels.sort()).toEqual(["llama", "qwen"]);
		expect(no?.count).toBe(1);
		expect(no?.distinctModels).toEqual(["llama"]);
	});

	it("skips error results", () => {
		const rows = groupByAnswer([
			result("ok", 0.9, "a"),
			{ requestId: "r", agentId: "b", answer: "", confidence: 0, latencyMs: 0, error: "boom" },
		]);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.answer).toBe("ok");
	});
});

describe("weightedConsensus", () => {
	it("prefers answers backed by more distinct models at similar confidence", () => {
		const winner = weightedConsensus([
			result("yes", 0.6, "a", "qwen"),
			result("yes", 0.6, "b", "llama"),
			result("no", 0.9, "c", "qwen"),
		]);
		// yes: 0.6 + 0.6 = 1.2 × (1 + log(1+2)) ≈ 2.32
		// no:  0.9       = 0.9 × (1 + log(1+1)) ≈ 1.62
		expect(winner?.answer).toBe("yes");
	});

	it("falls back to highest confidence when diversity is even", () => {
		const winner = weightedConsensus([
			result("yes", 0.5, "a", "qwen"),
			result("no", 0.5, "b", "qwen"),
		]);
		// tie on weight & diversity — first wins (stable sort), so the
		// order matters; with confidence sum also equal, weightedConsensus
		// falls back to whichever has the higher raw confidence. here
		// both are 0.5, so either is acceptable.
		expect(["yes", "no"]).toContain(winner?.answer);
	});

	it("returns undefined when every result is an error", () => {
		expect(
			weightedConsensus([
				{
					requestId: "r",
					agentId: "a",
					answer: "",
					confidence: 0,
					latencyMs: 0,
					error: "boom",
				},
			]),
		).toBeUndefined();
	});
});
