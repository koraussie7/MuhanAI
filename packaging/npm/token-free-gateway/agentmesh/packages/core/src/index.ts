/**
 * @agentmesh/core — shared structural contracts.
 *
 * These types were previously imported from a package that no longer existed in
 * the workspace, which broke `@agentmesh/mcp` and, transitively, the API build.
 * They are re-declared here from the shapes the consumers already expect, so no
 * behaviour changes — only the type source moves into the workspace.
 */

/** JSON Schema subset used by MCP tool declarations. */
export interface JsonSchema {
	type?: "object" | "array" | "string" | "number" | "integer" | "boolean" | "null";
	properties?: Record<string, JsonSchema>;
	items?: JsonSchema;
	required?: string[];
	enum?: unknown[];
	description?: string;
	default?: unknown;
	[key: string]: unknown;
}

export interface McpTool {
	name: string;
	description: string;
	inputSchema: JsonSchema;
	annotations?: {
		readOnlyHint?: boolean;
		destructiveHint?: boolean;
		idempotentHint?: boolean;
		openWorldHint?: boolean;
	};
}

export interface ToolRegistry {
	register(tool: McpTool, handler?: (input: Record<string, unknown>) => unknown): Promise<void>;
	unregister(toolName: string): Promise<void>;
	execute(toolName: string, input: Record<string, unknown>): Promise<unknown>;
	list(): Promise<McpTool[]>;
	discover(): Promise<McpTool[]>;
}

export interface ToolDiscovery {
	scan(): Promise<McpTool[]>;
	scanProvider(providerId: string): Promise<McpTool[]>;
	scanMcpServer(serverUrl: string): Promise<McpTool[]>;
}

export interface McpServerConfig {
	name: string;
	version: string;
	description?: string;
	tools: McpTool[];
	transport?: "stdio" | "http" | "both";
}