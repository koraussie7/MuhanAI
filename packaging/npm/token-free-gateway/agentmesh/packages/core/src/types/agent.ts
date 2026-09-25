export type AgentCapability =
	| "answer"
	| "verify"
	| "teach"
	| "local_knowledge"
	| "expert"
	| (string & {});

/** Network role of an agent (review §1: llm/human/mcp/compute/search). */
export type AgentType = "llm" | "human" | "mcp" | "compute" | "search" | "mock";

export interface AgentHealth {
	online: boolean;
	latency: number;
	checkedAt?: number;
}

export interface AgentDescriptor {
	id: string;
	name: string;
	type: AgentType;
	capabilities: AgentCapability[];
	cost: number;
	latencyMs: number;
	health?: AgentHealth;
}
