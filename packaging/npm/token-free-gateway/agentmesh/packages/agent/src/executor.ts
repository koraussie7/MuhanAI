import type { AgentRequest, AgentResult } from "@agentmesh/core";
import { AgentRegistry } from "./registry.js";

export class AgentExecutor {
  constructor(private readonly registry: AgentRegistry) {}
  execute(agentId: string, request: AgentRequest): Promise<AgentResult> {
    const adapter = this.registry.get(agentId);
    if (!adapter) throw new Error(`Agent not found: ${agentId}`);
    return adapter.execute(request);
  }
}
