import type { AgentRequest } from "./request.js";

export interface AgentResult {
  requestId: AgentRequest["id"];
  agentId: string;
  answer: string;
  confidence: number;
  latencyMs: number;
  error?: string;
  metadata?: Record<string, unknown>;
}
