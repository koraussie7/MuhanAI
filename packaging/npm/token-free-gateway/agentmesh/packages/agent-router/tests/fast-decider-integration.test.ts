import { beforeEach, describe, expect, it, vi } from "vitest";
import { categoryRouter } from "../../../packages/category-engine/src/index.js";

vi.mock("@agentmesh/llm-router", () => ({
	fastDecider: {
		decideIntent: vi.fn(),
	},
}));

import { fastDecider } from "@agentmesh/llm-router";

describe("CategoryRouter Laya fast-decider integration", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("uses fast-decider when confidence is high (skip LLM classifier)", async () => {
		// Fast-decider returns high confidence intent → fast-path
		vi.mocked(fastDecider.decideIntent).mockResolvedValue({
			intent: "technology",
			confidence: 0.95,
			needsLLM: false,
		});

		const result = await categoryRouter.classify("How do I refactor this React hook?");

		// Should use fast-decider result, not the keyword classifier
		expect(fastDecider.decideIntent).toHaveBeenCalledWith(
			"How do I refactor this React hook?",
			expect.any(Object),
			0.8,
		);
		expect(result.domain).toBe("technology");
		expect(result.confidence).toBe(0.95);
	});

	it("falls back to keyword classifier when confidence is low", async () => {
		// Fast-decider says needsLLM → fallback to classifier
		vi.mocked(fastDecider.decideIntent).mockResolvedValue({
			intent: "technology",
			confidence: 0.4,
			needsLLM: true,
		});

		const result = await categoryRouter.classify("React hook question");

		expect(fastDecider.decideIntent).toHaveBeenCalled();
		// Falls back to keyword-based classifier
		expect(result.domain).toBeTruthy();
	});

	it("falls back to keyword classifier when fast-decider fails", async () => {
		vi.mocked(fastDecider.decideIntent).mockRejectedValue(new Error("sidecar down"));

		const result = await categoryRouter.classify("How do I fix my medical prescription?");

		expect(result.domain).toBe("medical");
	});
});
