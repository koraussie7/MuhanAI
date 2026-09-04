import { describe, expect, it } from "vitest";
import type { AgentAdapter, AgentRequest, AgentResult } from "@agentmesh/core";
import { AgentRegistry } from "./registry.js";

function fakeAdapter(
  id: string,
  options: { type?: "llm" | "human" | "mcp" | "mock"; online?: boolean; displayName?: string } = {},
): AgentAdapter {
  const { type, online = true, displayName } = options;
  return {
    id,
    ...(type !== undefined ? { type } : {}),
    ...(displayName !== undefined ? { displayName } : {}),
    capabilities: () => ["answer"],
    health: async () => ({ online, latency: online ? 10 : 0, checkedAt: Date.now() }),
    execute: async (request: AgentRequest): Promise<AgentResult> => ({
      requestId: request.id,
      agentId: id,
      answer: `reply from ${id}`,
      confidence: 0.5,
      latencyMs: 1,
    }),
  };
}

const request = { id: "r1", question: "test" };

describe("AgentRegistry", () => {
  it("tracks registration and unregistration", () => {
    const registry = new AgentRegistry();
    registry.register(fakeAdapter("a"));
    registry.register(fakeAdapter("b"));
    expect(registry.has("a")).toBe(true);
    expect(registry.all()).toHaveLength(2);
    expect(registry.unregister("a")).toBe(true);
    expect(registry.has("a")).toBe(false);
    expect(registry.unregister("a")).toBe(false);
  });

  it("descriptors use displayName, declared type and health", async () => {
    const registry = new AgentRegistry();
    registry.register(fakeAdapter("gw", { type: "llm", displayName: "Gateway LLM" }));
    registry.register(fakeAdapter("expert", { type: "human" }));
    const descriptors = await registry.descriptors();
    const gw = descriptors.find((d) => d.id === "gw");
    const expert = descriptors.find((d) => d.id === "expert");
    expect(gw?.name).toBe("Gateway LLM");
    expect(gw?.type).toBe("llm");
    expect(expert?.type).toBe("human");
    expect(expert?.name).toBe("expert");
    expect(expert?.health?.online).toBe(true);
  });

  it("stats aggregate by type and online status", async () => {
    const registry = new AgentRegistry();
    registry.register(fakeAdapter("llm-1", { type: "llm" }));
    registry.register(fakeAdapter("llm-2", { type: "llm", online: false }));
    registry.register(fakeAdapter("mcp-1", { type: "mcp" }));
    const stats = await registry.stats();
    expect(stats.total).toBe(3);
    expect(stats.online).toBe(2);
    expect(stats.byType.llm).toBe(2);
    expect(stats.byType.mcp).toBe(1);
    expect(stats.onlineByType.llm).toBe(1);
    expect(stats.onlineByType.mcp).toBe(1);
    expect(stats.avgLatencyMs).toBe(10);
  });

  it("refreshHealth caches results and re-registration invalidates them", async () => {
    const registry = new AgentRegistry();
    registry.register(fakeAdapter("a", { type: "llm" }));
    await registry.refreshHealth();
    expect(registry.healthOf("a")?.online).toBe(true);
    registry.register(fakeAdapter("a", { type: "llm" }));
    expect(registry.healthOf("a")).toBeUndefined();
  });

  it("execute via executor hits the registered adapter", async () => {
    const { AgentExecutor } = await import("./executor.js");
    const registry = new AgentRegistry();
    registry.register(fakeAdapter("a"));
    const executor = new AgentExecutor(registry);
    const result = await executor.execute("a", request);
    expect(result.answer).toBe("reply from a");
    // AgentExecutor.execute throws synchronously for unknown agents.
    expect(() => executor.execute("missing", request)).toThrow("Agent not found: missing");
  });
});
