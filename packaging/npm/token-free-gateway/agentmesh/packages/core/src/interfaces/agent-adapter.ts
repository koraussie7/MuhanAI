import type { AgentHealth, AgentType } from "../types/agent.js";
import type { AgentRequest } from "../types/request.js";
import type { AgentResult } from "../types/result.js";

export interface AgentAdapter {
  readonly id: string;
  /** Network role; defaults to "llm" when the adapter does not declare one. */
  readonly type?: AgentType;
  /** Human-readable name; defaults to id in descriptors. */
  readonly displayName?: string;
  capabilities(): string[];
  health(): Promise<AgentHealth>;
  execute(request: AgentRequest): Promise<AgentResult>;
}
