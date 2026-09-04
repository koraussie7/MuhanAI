import { describe, expect, it } from "vitest";
import type { AgentDescriptor } from "@agentmesh/core";
import { rankAgents } from "./policy.js";

const request = { id: "r1", question: "test", requiredCapabilities: ["answer"] };

describe("rankAgents", () => {
  it("filters by capability, budget, latency, and max agents", () => {
    const agents: AgentDescriptor[] = [
      { id: "fast", name: "fast", type: "llm", capabilities: ["answer"], cost: 0, latencyMs: 10 },
      { id: "paid", name: "paid", type: "llm", capabilities: ["answer"], cost: 1, latencyMs: 1 },
      { id: "slow", name: "slow", type: "llm", capabilities: ["answer"], cost: 0, latencyMs: 20_000 },
      { id: "verify", name: "verify", type: "llm", capabilities: ["verify"], cost: 0, latencyMs: 1 },
    ];
    expect(rankAgents(request, agents, { maxAgents: 1, maxCost: 0, maxLatencyMs: 100 })).toHaveLength(1);
    expect(rankAgents(request, agents, { maxAgents: 1, maxCost: 0, maxLatencyMs: 100 })[0]?.id).toBe("fast");
  });
});
