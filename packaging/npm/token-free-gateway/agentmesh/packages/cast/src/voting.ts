import type { AgentResult } from "@agentmesh/core";

export function majorityVote(results: AgentResult[]): AgentResult | undefined {
  const counts = new Map<string, { count: number; result: AgentResult }>();
  for (const result of results) {
    const entry = counts.get(result.answer) ?? { count: 0, result };
    counts.set(result.answer, { count: entry.count + 1, result });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || b.result.confidence - a.result.confidence)[0]?.result;
}
