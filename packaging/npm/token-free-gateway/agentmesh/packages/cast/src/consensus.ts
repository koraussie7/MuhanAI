import type { AgentResult } from "@agentmesh/core";
import { aggregate } from "./aggregator.js";

export function consensus(results: AgentResult[]): AgentResult | undefined {
  return aggregate(results);
}
