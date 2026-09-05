/** MCP tool descriptor (JSON Schema input). */
export interface McpTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface McpServerConfig {
  name: string;
  version: string;
  tools: McpTool[];
}

/** Register / execute tools available to agents and the MCP surface. */
export interface ToolRegistry {
  register(tool: McpTool): Promise<void>;
  unregister(toolName: string): Promise<void>;
  execute(toolName: string, input: Record<string, unknown>): Promise<unknown>;
  list(): Promise<McpTool[]>;
  discover(): Promise<McpTool[]>;
}

/** Discover tools from HTTP providers or remote MCP servers. */
export interface ToolDiscovery {
  scan(): Promise<McpTool[]>;
  scanProvider(providerId: string): Promise<McpTool[]>;
  scanMcpServer(serverUrl: string): Promise<McpTool[]>;
}

/**
 * AI Bridge contract for browser extension imports.
 * Implementation lives in API + extension — no cookies/passwords.
 */
export interface AIBridge {
  importAnswer(input: {
    provider: string;
    question: string;
    answer: string;
    source?: "browser" | "api" | "local" | "human";
    metadata?: Record<string, unknown>;
  }): Promise<{ id: string; imported: boolean }>;
}
