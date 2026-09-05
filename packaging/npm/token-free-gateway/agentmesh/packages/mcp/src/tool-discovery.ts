import type { McpTool, ToolDiscovery } from "@agentmesh/core";

/**
 * HTTP / catalog tool discovery.
 * scan() returns built-in catalog; scanMcpServer can probe remote /tools endpoints later.
 */
export class HttpToolDiscovery implements ToolDiscovery {
  async scan(): Promise<McpTool[]> {
    return [
      {
        name: "web-search",
        description: "Search the web",
        inputSchema: {
          type: "object",
          properties: { query: { type: "string" } },
          required: ["query"],
        },
      },
      {
        name: "code-run",
        description: "Execute code in a sandbox",
        inputSchema: {
          type: "object",
          properties: { code: { type: "string" }, language: { type: "string" } },
          required: ["code"],
        },
      },
      {
        name: "knowledge-lookup",
        description: "Lookup claims in MuhanAI knowledge candidates",
        inputSchema: {
          type: "object",
          properties: { query: { type: "string" } },
          required: ["query"],
        },
      },
    ];
  }

  async scanProvider(_providerId: string): Promise<McpTool[]> {
    return [];
  }

  async scanMcpServer(serverUrl: string): Promise<McpTool[]> {
    try {
      const base = serverUrl.replace(/\/$/, "");
      const res = await fetch(`${base}/api/mcp/tools`, {
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) return [];
      const data = (await res.json()) as unknown;
      if (!Array.isArray(data)) return [];
      return data.filter(
        (t): t is McpTool =>
          !!t &&
          typeof t === "object" &&
          typeof (t as McpTool).name === "string" &&
          typeof (t as McpTool).inputSchema === "object",
      );
    } catch {
      return [];
    }
  }
}

export function createToolDiscovery(): HttpToolDiscovery {
  return new HttpToolDiscovery();
}
