/**
 * Core MCP contracts used by this package.
 *
 * These used to be imported from `@agentmesh/core`, but no such workspace
 * package exists (the dependency resolved to a dangling `link:../core` and the
 * names were declared nowhere in the repo), so `packages/mcp` had never
 * typechecked. The shapes below are derived from actual usage in
 * mcp-server.ts / tool-registry.ts / tool-discovery.ts.
 */

/** JSON Schema object describing a tool's parameters. */
export type McpJsonSchema = Record<string, unknown>;

/** A callable tool exposed over MCP. */
export interface McpTool {
	name: string;
	description: string;
	inputSchema: McpJsonSchema;
}

/** Storage surface for registered tools. */
export interface ToolRegistry {
	register(tool: McpTool, handler?: (input: Record<string, unknown>) => Promise<unknown> | unknown): Promise<void>;
	unregister(toolName: string): Promise<void>;
	execute(toolName: string, input: Record<string, unknown>): Promise<unknown>;
	list(): Promise<McpTool[]>;
	discover(): Promise<McpTool[]>;
}

/** Source of tool descriptors. */
export interface ToolDiscovery {
	scan(): Promise<McpTool[]>;
	scanProvider(providerId: string): Promise<McpTool[]>;
	scanMcpServer(serverUrl: string): Promise<McpTool[]>;
}

/** Construction parameters for an MCP server. */
export interface McpServerConfig {
	name: string;
	version: string;
	tools: McpTool[];
}
