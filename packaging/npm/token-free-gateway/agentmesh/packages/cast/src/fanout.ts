import type { AgentRequest, AgentResult } from "@agentmesh/core";
import { AgentExecutor } from "@agentmesh/agent";

export async function fanOut(executor: AgentExecutor, agentIds: string[], request: AgentRequest): Promise<AgentResult[]> {
  const settled = await Promise.allSettled(agentIds.map((agentId) => executor.execute(agentId, request)));
  return settled.map((entry, index) => entry.status === "fulfilled"
    ? entry.value
    : { requestId: request.id, agentId: agentIds[index]!, answer: "", confidence: 0, latencyMs: 0, error: entry.reason instanceof Error ? entry.reason.message : String(entry.reason) });
}
