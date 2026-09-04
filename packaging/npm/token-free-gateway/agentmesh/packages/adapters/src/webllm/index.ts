import type { AgentRequest, AgentResult } from "@agentmesh/core";
import { BaseAdapter } from "../base.js";

/** Browser WebLLM boundary. Inject the actual engine in a browser app. */
export class WebLlmAdapter extends BaseAdapter {
  readonly id = "webllm";
  capabilities() { return ["answer", "local_knowledge"]; }

  async execute(request: AgentRequest): Promise<AgentResult> {
    const started = Date.now();
    return this.result(request, "WebLLM is not loaded; configure a browser engine before use.", started, 0);
  }
}
