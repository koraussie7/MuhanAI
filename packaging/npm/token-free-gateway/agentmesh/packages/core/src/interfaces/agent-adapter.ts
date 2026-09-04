import type { AgentHealth } from "../types/agent.js";
import type { AgentRequest } from "../types/request.js";
import type { AgentResult } from "../types/result.js";

export interface AgentAdapter {
  readonly id: string;
  capabilities(): string[];
  health(): Promise<AgentHealth>;
  execute(request: AgentRequest): Promise<AgentResult>;
}
