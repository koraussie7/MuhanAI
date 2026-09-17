import type { McpServerConfig, McpTool } from "@agentmesh/core";
import { InMemoryToolRegistry } from "./tool-registry.js";

/**
 * MuhanAI MCP-facing server surface.
 *
 * Uses the official SDK when available for stdio transport; always exposes
 * listTools / callTool for HTTP (`/api/mcp/*`) without requiring a live stdio session.
 *
 * Security: no credentials; tools are metadata + explicit execute only.
 */
export class MuhanAIServer {
  readonly name: string;
  readonly version: string;
  private registry: InMemoryToolRegistry;

  constructor(config: McpServerConfig, registry?: InMemoryToolRegistry) {
    this.name = config.name;
    this.version = config.version;
    this.registry = registry ?? new InMemoryToolRegistry();
    for (const tool of config.tools) {
      void this.registry.register(tool);
    }
  }

  getRegistry(): InMemoryToolRegistry {
    return this.registry;
  }

  async listTools(): Promise<McpTool[]> {
    return this.registry.list();
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
    return this.registry.execute(name, args);
  }

  /**
   * Optional stdio MCP transport via @modelcontextprotocol/sdk.
   * Safe no-op path if SDK is not installed or transport fails in test env.
   */
  async startStdio(): Promise<{ mode: "stdio" | "noop"; error?: string }> {
    try {
      const sdk = await import("@modelcontextprotocol/sdk/server/index.js");
      const transportMod = await import("@modelcontextprotocol/sdk/server/stdio.js");
      const Server = sdk.Server as new (
        info: { name: string; version: string },
        opts: { capabilities: { tools: Record<string, never> } },
      ) => {
        setRequestHandler: (method: string, handler: (req: { params?: { name?: string; arguments?: Record<string, unknown> } }) => Promise<unknown>) => void;
        connect: (t: unknown) => Promise<void>;
      };
      const StdioServerTransport = transportMod.StdioServerTransport as new () => unknown;

      const server = new Server(
        { name: this.name, version: this.version },
        { capabilities: { tools: {} } },
      );

      server.setRequestHandler("tools/list", async () => ({
        tools: (await this.listTools()).map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      }));

      server.setRequestHandler("tools/call", async (req) => {
        const name = req.params?.name ?? "";
        const args = req.params?.arguments ?? {};
        const result = await this.callTool(name, args);
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      });

      await server.connect(new StdioServerTransport());
      return { mode: "stdio" };
    } catch (err) {
      return {
        mode: "noop",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

export function createMuhanAIServer(
  config?: Partial<McpServerConfig>,
  registry?: InMemoryToolRegistry,
): MuhanAIServer {
  return new MuhanAIServer(
    {
      name: config?.name ?? "muhanai-mcp",
      version: config?.version ?? "0.1.0",
      tools: config?.tools ?? [],
    },
    registry,
  );
}
