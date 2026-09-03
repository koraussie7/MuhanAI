import { describe, expect, it } from "vitest";
import { rankAgents } from "./policy.js";

const request = { id: "r1", question: "test", requiredCapabilities: ["answer"] };

describe("rankAgents", () => {
  it("filters by capability, budget, latency, and max agents", () => {
    const agents = [
      { id: "fast", name: "fast", capabilities: ["answer"], cost: 0, latencyMs: 10 },
      { id: "paid", name: "paid", capabilities: ["answer"], cost: 1, latencyMs: 1 },
      { id: "slow", name: "slow", capabilities: ["answer"], cost: 0, latencyMs: 20_000 },
      { id: "verify", name: "verify", capabilities: ["verify"], cost: 0, latencyMs: 1 },
    ];
    expect(rankAgents(request, agents, { maxAgents: 1, maxCost: 0, maxLatencyMs: 100 })).toHaveLength(1);
    expect(rankAgents(request, agents, { maxAgents: 1, maxCost: 0, maxLatencyMs: 100 })[0]?.id).toBe("fast");
  });
});
