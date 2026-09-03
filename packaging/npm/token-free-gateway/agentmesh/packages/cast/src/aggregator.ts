import type { AgentResult } from "@agentmesh/core";

export function aggregate(results: AgentResult[]): AgentResult | undefined {
  return [...results].sort((a, b) => b.confidence - a.confidence)[0];
}
