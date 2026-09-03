import type { AgentAdapter, AgentHealth, AgentRequest, AgentResult } from "@agentmesh/core";

export abstract class BaseAdapter implements AgentAdapter {
  abstract readonly id: string;
  abstract capabilities(): string[];

  async health(): Promise<AgentHealth> {
    const started = Date.now();
    return { online: true, latency: Date.now() - started, checkedAt: Date.now() };
  }

  protected result(request: AgentRequest, answer: string, started: number, confidence = 0.5): AgentResult {
    return { requestId: request.id, agentId: this.id, answer, confidence, latencyMs: Date.now() - started };
  }

  abstract execute(request: AgentRequest): Promise<AgentResult>;
}
