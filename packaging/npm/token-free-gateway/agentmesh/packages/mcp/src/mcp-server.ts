import type { McpServerConfig, McpTool } from "@agentmesh/core";
import { InMemoryToolRegistry } from "./tool-registry.js";

/**
 * Nexus 툴 스키마 자동 치유
 * Nexus의 툴 스키마 자동 치유 기능을 MuhanAI MCP 서버에 연동합니다.
 * 툴 호출 시 입력 파라미터가 스키마와 불일치할 때 자동으로 수정합니다.
 */
export interface NexusSchemaHealResult {
	healed: boolean;
	originalInput: Record<string, unknown>;
	healedInput: Record<string, unknown>;
	repairs: Array<{ field: string; reason: string; action: string }>;
}

/**
 * 툴 스키마 자동 치유기
 * Nexus 스키마 자동 치유 로직을 MuhanAI MCP 툴 레지스트리에 적용합니다.
 */
export class NexusToolSchemaHealer {
	private schemaCache: Map<string, any> = new Map();

	/**
	 * 툴 입력 파라미터를 스키마에 맞게 자동 치유합니다.
	 */
	heal(
		tool: McpTool,
		input: Record<string, unknown>,
	): NexusSchemaHealResult {
		const repairs: Array<{ field: string; reason: string; action: string }> = [];
		const healed = { ...input };
		let changed = false;

		const inputSchema = tool.inputSchema || {};
		const properties = inputSchema.properties || {};
		const required = inputSchema.required || [];

		// 필수 필드 누락 감지 및 기본값 부여
		for (const field of required) {
			if (!(field in healed)) {
				const propSchema = properties[field] as any;
				const defaultValue = this.getDefaultForSchema(propSchema);
				healed[field] = defaultValue;
				repairs.push({
					field,
					reason: "Missing required field",
					action: `Set default value: ${JSON.stringify(defaultValue)}`,
				});
				changed = true;
			}
		}

		// 타입 불일치 감지 및 강제 변환
		for (const [field, value] of Object.entries(healed)) {
			const propSchema = properties[field] as any;
			if (!propSchema) continue;

			const expectedType = propSchema.type;
			if (expectedType === "string" && typeof value !== "string") {
				healed[field] = String(value);
				repairs.push({
					field,
					reason: `Type mismatch: expected string, got ${typeof value}`,
					action: "Coerced to string",
				});
				changed = true;
			} else if (expectedType === "number" && typeof value !== "number") {
				const num = Number(value);
				if (!isNaN(num)) {
					healed[field] = num;
					repairs.push({
						field,
						reason: `Type mismatch: expected number, got ${typeof value}`,
						action: "Coerced to number",
					});
					changed = true;
				}
			} else if (expectedType === "boolean" && typeof value !== "boolean") {
				healed[field] = value === "true" || value === true;
				repairs.push({
					field,
					reason: `Type mismatch: expected boolean, got ${typeof value}`,
					action: "Coerced to boolean",
				});
				changed = true;
			} else if (expectedType === "array" && !Array.isArray(value)) {
				healed[field] = value != null ? [value] : [];
				repairs.push({
					field,
					reason: `Type mismatch: expected array, got ${typeof value}`,
					action: "Wrapped in array",
				});
				changed = true;
			} else if (expectedType === "object" && (typeof value !== "object" || Array.isArray(value))) {
				healed[field] = typeof value === "string" ? { value } : {};
				repairs.push({
					field,
					reason: `Type mismatch: expected object, got ${typeof value}`,
					action: "Coerced to object",
				});
				changed = true;
			}
		}

		return {
			healed: changed,
			originalInput: input,
			healedInput: healed,
			repairs,
		};
	}

	private getDefaultForSchema(schema: any): unknown {
		if (schema?.default !== undefined) return schema.default;
		if (schema?.type === "string") return "";
		if (schema?.type === "number") return 0;
		if (schema?.type === "boolean") return false;
		if (schema?.type === "array") return [];
		if (schema?.type === "object") return {};
		return null;
	}

	/**
	 * 스키마 캐시에 툴 스키마를 등록합니다.
	 */
	registerSchema(toolName: string, schema: any): void {
		this.schemaCache.set(toolName, schema);
	}

	/**
	 * 캐시된 스키마를 조회합니다.
	 */
	getSchema(toolName: string): any | undefined {
		return this.schemaCache.get(toolName);
	}
}

export const nexusSchemaHealer = new NexusToolSchemaHealer();

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
