export interface McpTool { name: string; description?: string; inputSchema: Record<string, unknown>; }
export interface McpExecutor { execute(tool: string, input: Record<string, unknown>): Promise<unknown>; }
