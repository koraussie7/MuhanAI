import type { PersonalMCP } from "../../personal-mcp/src/server";
import type { AgentRunResult, CategoryContext, KnowledgeNode } from "../../shared/types";

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
	personalMcp?: PersonalMCP;
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
	personalMcp?: PersonalMCP;
	userId: string;
}
