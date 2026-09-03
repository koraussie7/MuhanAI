import type { AgentRequest, AgentResult } from "@agentmesh/core";
import { BaseAdapter } from "./base.js";

export class MockAdapter extends BaseAdapter {
  readonly id = "mock";
  capabilities() { return ["answer", "verify"]; }

  async execute(request: AgentRequest): Promise<AgentResult> {
    const started = Date.now();
    return this.result(request, `Mock response to: ${request.question}`, started, 0.6);
  }
}
