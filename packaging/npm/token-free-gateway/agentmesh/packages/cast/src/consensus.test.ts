import { describe, expect, it } from "vitest";
import { consensus } from "./consensus.js";

const result = (agentId: string, answer: string, confidence: number) => ({
	requestId: "r1",
	agentId,
	answer,
	confidence,
	latencyMs: 1,
});

describe("consensus", () => {
	it("selects the highest-confidence result", () => {
		expect(consensus([result("a", "one", 0.4), result("b", "two", 0.9)])?.agentId).toBe("b");
	});
	it("returns undefined for an empty cast", () => {
		expect(consensus([])).toBeUndefined();
	});
});
