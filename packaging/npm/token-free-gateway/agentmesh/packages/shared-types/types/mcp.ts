/** MCP tool + server contracts shared by mcp-runtime and the registry. */

export interface McpToolAnnotations {
	readOnlyHint?: boolean;
	destructiveHint?: boolean;
	idempotentHint?: boolean;
	openWorldHint?: boolean;
}

export interface McpTool {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
	outputSchema?: Record<string, unknown>;
	annotations?: McpToolAnnotations;
}

export interface McpAuth {
	kind: "none" | "bearer" | "hmac" | "oauth";
	/** Never the secret itself — a reference the bridge resolves. */
	credentialRef?: string;
	scopes?: string[];
}

export interface McpServer {
	id: string;
	name: string;
	tools: McpTool[];
	endpoint: string;
	auth?: McpAuth;
}
