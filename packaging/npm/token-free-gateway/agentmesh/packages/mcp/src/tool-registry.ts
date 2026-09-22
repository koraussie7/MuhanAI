import type { McpTool, ToolRegistry } from "@agentmesh/core";

type ToolHandler = (input: Record<string, unknown>) => Promise<unknown> | unknown;

/**
 * In-memory ToolRegistry — register/list/execute without provider-specific code.
 * Optional handlers can be attached for real side effects.
 */
export class InMemoryToolRegistry implements ToolRegistry {
  private tools = new Map<string, McpTool>();
  private handlers = new Map<string, ToolHandler>();

  async register(tool: McpTool, handler?: ToolHandler): Promise<void> {
    this.tools.set(tool.name, tool);
    if (handler) this.handlers.set(tool.name, handler);
  }

  async unregister(toolName: string): Promise<void> {
    this.tools.delete(toolName);
    this.handlers.delete(toolName);
  }

  async execute(toolName: string, input: Record<string, unknown>): Promise<unknown> {
    const tool = this.tools.get(toolName);
    if (!tool) throw new Error(`Tool not found: ${toolName}`);
    const handler = this.handlers.get(toolName);
    if (handler) return handler(input);
    return { status: "ok", tool: toolName, input };
  }

  async list(): Promise<McpTool[]> {
    return Array.from(this.tools.values());
  }

  async discover(): Promise<McpTool[]> {
    return this.list();
  }
}

export function createToolRegistry(): InMemoryToolRegistry {
  return new InMemoryToolRegistry();
}
