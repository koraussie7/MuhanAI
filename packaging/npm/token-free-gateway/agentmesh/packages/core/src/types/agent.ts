export type AgentCapability = "answer" | "verify" | "teach" | "local_knowledge" | "expert" | (string & {});

export interface AgentHealth { online: boolean; latency: number; checkedAt?: number }

export interface AgentDescriptor {
  id: string;
  name: string;
  capabilities: AgentCapability[];
  cost: number;
  latencyMs: number;
  health?: AgentHealth;
}
