import type { AgentRunResult, CategoryContext, KnowledgeNode } from "@agentmesh/shared-types";

export interface PersonalMCPHandle {
	id: string;
	userId: string;
}

export interface AgentDefinition {
	id: string;
	name: string;
	domain: string;
	subdomain?: string;
	jurisdictions?: string[];
	description?: string;
	systemPrompt?: string;
	tools?: string[];
	modelPreference?: string[];
}

export interface AgentExecutionContext {
	question: string;
	category: CategoryContext;
	personalMcp?: PersonalMCPHandle;
	knowledge: KnowledgeNode[];
	userId: string;
	extraContext?: string;
}

export interface Agent {
	definition: AgentDefinition;
	run(ctx: AgentExecutionContext): Promise<AgentRunResult>;
}

export interface MeshExecuteParams {
	question: string;
	context: CategoryContext;
	agents: Agent[];
	knowledge: KnowledgeNode[];
	personalMcp?: PersonalMCPHandle;
	userId: string;
}
