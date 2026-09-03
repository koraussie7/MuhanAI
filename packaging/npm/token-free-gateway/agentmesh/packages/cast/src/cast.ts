import type { AgentRequest, AgentResult } from "@agentmesh/core";
import { AgentExecutor } from "@agentmesh/agent";
import { fanOut } from "./fanout.js";
import { consensus } from "./consensus.js";

export interface CastRequest extends AgentRequest { agents?: string[] }
export interface CastResult { request: AgentRequest; results: AgentResult[]; answer: AgentResult | undefined }

export class AgentCast {
  constructor(private readonly executor: AgentExecutor) {}
  async run(request: CastRequest): Promise<CastResult> {
    const results = await fanOut(this.executor, request.agents ?? [], request);
    return { request, results, answer: consensus(results) };
  }
}
