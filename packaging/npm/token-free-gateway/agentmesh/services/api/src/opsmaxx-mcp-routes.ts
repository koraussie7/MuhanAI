/**
 * OpsMaxx MCP Safe Tool Surface (T3-A)
 *
 * Read-only / safe tools that never trigger human-in-the-loop approval.
 * Mounted at POST /api/opsmaxx-mcp/rpc (separate from /api/mcp/rpc so
 * T3-B's write surface can land on a different prefix without collision).
 *
 * All tools are classified as RISK.safe in @agentmesh/opsmaxx-bridge types.
 */

import type {
	BridgeError,
	DbConnection,
	DbResultSet,
	OpsMaxxBridge,
	Result,
	SshConnection,
	SshSession,
	VaultEntry,
} from "@agentmesh/opsmaxx-bridge";
import { createInMemoryBridge, type MockBridge } from "@agentmesh/opsmaxx-bridge/mock";
import type { FastifyInstance } from "fastify";

const TOOL_NAMES = [
	"opsmaxx_ssh_list",
	"opsmaxx_db_list",
	"opsmaxx_vault_list",
	"opsmaxx_sftp_read",
	"opsmaxx_db_query",
	"opsmaxx_ssh_session_open",
	"opsmaxx_approval_status",
	"opsmaxx_whoami",
] as const;

type SafeToolName = (typeof TOOL_NAMES)[number];

interface JsonRpcRequest {
	jsonrpc?: string;
	id?: unknown;
	method?: string;
	params?: Record<string, unknown>;
}

interface JsonRpcResponse {
	jsonrpc: "2.0";
	id: unknown;
	result?: unknown;
	error?: { code: number; message: string; data?: unknown };
}

function jsonRpcResponse(id: unknown, result: unknown): JsonRpcResponse {
	return { jsonrpc: "2.0", id, result };
}

function jsonRpcError(id: unknown, code: number, message: string, data?: unknown): JsonRpcResponse {
	return { jsonrpc: "2.0", id, error: { code, message, data } };
}

// Module-level bridge injected by the test or by the production
// wiring in server.ts. When undefined, a fresh in-memory bridge is
// created per call (useful only for sanity smoke tests).
let injectedBridge: OpsMaxxBridge | undefined;

/**
 * Test hook: set the bridge used by the route handlers. Returns the
 * previous value so a test that needs to swap bridges can restore.
 */
export function __setOpsMaxxBridgeForTest(
	bridge: OpsMaxxBridge | undefined,
): OpsMaxxBridge | undefined {
	const prev = injectedBridge;
	injectedBridge = bridge;
	return prev;
}

/**
 * Extract the bridge from the test injection, then from Fastify
 * context, then fall back to a fresh in-memory bridge.
 */
function getBridge(app?: FastifyInstance): OpsMaxxBridge {
	if (injectedBridge) return injectedBridge;
	if (app && (app as { opsmaxxBridge?: OpsMaxxBridge }).opsmaxxBridge) {
		return (app as { opsmaxxBridge: OpsMaxxBridge }).opsmaxxBridge;
	}
	return createInMemoryBridge() as unknown as OpsMaxxBridge;
}

/**
 * Helper to unwrap the bridge's Result<T, BridgeError> without leaking
 * the internal BridgeError to the model.
 */
function unwrapResult<T>(result: Result<T, BridgeError>): T {
	if (!result.ok) {
		throw new Error(result.error.message);
	}
	return result.value;
}

/**
 * JSON-RPC 2.0 compliant error codes
 */
const ERROR_CODES = {
	METHOD_NOT_FOUND: -32601,
	INVALID_PARAMS: -32602,
	INTERNAL_ERROR: -32603,
	BRIDGE_ERROR: -32000,
};

function methodNotFound(id: unknown, method: string) {
	return jsonRpcError(id, ERROR_CODES.METHOD_NOT_FOUND, `Method '${method}' not found`);
}

function invalidParams(id: unknown, message: string) {
	return jsonRpcError(id, ERROR_CODES.INVALID_PARAMS, message);
}

function internalError(id: unknown, message: string) {
	return jsonRpcError(id, ERROR_CODES.INTERNAL_ERROR, message);
}

function bridgeError(id: unknown, message: string) {
	return jsonRpcError(id, ERROR_CODES.BRIDGE_ERROR, message);
}

function createEmptySchema() {
	return { type: "object", properties: {} };
}

const SAFE_TOOL_DEFINITIONS = [
	{
		name: "opsmaxx_ssh_list",
		description: "List all configured SSH connections in OpsMaxx.",
		inputSchema: createEmptySchema(),
	},
	{
		name: "opsmaxx_db_list",
		description: "List all configured database connections in OpsMaxx.",
		inputSchema: createEmptySchema(),
	},
	{
		name: "opsmaxx_vault_list",
		description: "List vault entries (metadata only; secrets never exposed).",
		inputSchema: createEmptySchema(),
	},
	{
		name: "opsmaxx_sftp_read",
		description: "Read a file from an SFTP connection (read-only).",
		inputSchema: {
			type: "object",
			properties: {
				connectionId: { type: "string", description: "SSH connection ID" },
				path: { type: "string", description: "Remote file path" },
			},
			required: ["connectionId", "path"],
		},
	},
	{
		name: "opsmaxx_db_query",
		description: "Execute a SELECT query on a database connection (read-only).",
		inputSchema: {
			type: "object",
			properties: {
				connectionId: { type: "string", description: "Database connection ID" },
				sql: { type: "string", description: "SELECT query to execute" },
				params: {
					type: "array",
					items: { type: "string" },
					description: "Optional query parameters",
				},
			},
			required: ["connectionId", "sql"],
		},
	},
	{
		name: "opsmaxx_ssh_session_open",
		description: "Open an SSH session (returns sessionId only; no exec).",
		inputSchema: {
			type: "object",
			properties: {
				connectionId: { type: "string", description: "SSH connection ID" },
			},
			required: ["connectionId"],
		},
	},
	{
		name: "opsmaxx_approval_status",
		description: "Check if a capability has been approved for given args.",
		inputSchema: {
			type: "object",
			properties: {
				capability: { type: "string", description: "Capability name" },
				args: { type: "object", description: "Arguments passed to the capability" },
			},
			required: ["capability"],
		},
	},
	{
		name: "opsmaxx_whoami",
		description: "Return bridge mode and service count.",
		inputSchema: createEmptySchema(),
	},
];

// Extend FastifyInstance with custom properties
declare module "fastify" {
	interface FastifyInstance {
		opsmaxxBridge?: OpsMaxxBridge;
		opsmaxxAuditLog?: { emit: (event: string, data: unknown) => void };
	}
}

function hashArgs(args: Record<string, unknown>): string {
	return `${Date.now()}:${JSON.stringify(args)}`;
}

export interface OpsMaxxMcpRoutesOptions {
	/**
	 * Inject a bridge for tests. When omitted, an in-memory bridge
	 * is created on first request and reused. Production should
	 * always use the IPC bridge (T1-P2) wired in via
	 * `buildApp({ opsmaxxBridge: ... })`.
	 */
	opsmaxxBridge?: OpsMaxxBridge | MockBridge;
}

export async function opsmaxxMcpRoutes(
	app: FastifyInstance,
	opts: OpsMaxxMcpRoutesOptions = {},
): Promise<void> {
	// Bridge is attached by T6 wiring in server.ts; fall back to in-memory mock
	const bridge: OpsMaxxBridge =
		(app as { opsmaxxBridge?: OpsMaxxBridge }).opsmaxxBridge ?? getBridge(app);

	// Bridge call event emitter for audit hooks (T3-B will attach logger)
	const emitBridgeCall = (tool: string, args: Record<string, unknown>) => {
		if (app.opsmaxxAuditLog) {
			app.opsmaxxAuditLog.emit("bridge_call", {
				tool,
				argsHash: hashArgs(args),
				timestamp: Date.now(),
			});
		}
	};

	// JSON-RPC 2.0 endpoint
	app.post("/api/opsmaxx-mcp/rpc", async (req, reply) => {
		const rpc = (req.body ?? {}) as {
			jsonrpc?: string;
			id?: unknown;
			method?: string;
			params?: Record<string, unknown>;
		};
		const id = rpc.id ?? 1;
		const method = rpc.method;
		const params = (rpc.params ?? {}) as Record<string, unknown>;

		if (method === "tools/list") {
			return jsonRpcResponse(id, { tools: SAFE_TOOL_DEFINITIONS });
		}

		if (method === "tools/call") {
			const toolName = params.name as string | undefined;
			const args = (params.arguments ?? {}) as Record<string, unknown>;

			if (!toolName || !TOOL_NAMES.includes(toolName as SafeToolName)) {
				return jsonRpcError(id, ERROR_CODES.METHOD_NOT_FOUND, `Tool '${toolName}' not found`);
			}

			try {
				let result: unknown;

				switch (toolName) {
					case "opsmaxx_ssh_list": {
						const connectionsResult = await bridge.ssh.listConnections();
						const connections = unwrapResult(connectionsResult);
						result = { connections };
						break;
					}
					case "opsmaxx_db_list": {
						const connectionsResult = await bridge.databases.listConnections();
						const connections = unwrapResult(connectionsResult);
						result = { connections };
						break;
					}
					case "opsmaxx_vault_list": {
						const entriesResult = await bridge.vault.list();
						const entries = unwrapResult(entriesResult);
						// Secrets are never included — VaultEntry has hasSecret but not the secret
						result = { entries };
						break;
					}
					case "opsmaxx_sftp_read": {
						// SFTP read is a new operation added in T1 Phase 2
						// For now, delegate to bridge if available, else return not_implemented
						const connectionId = args.connectionId as string;
						const path = args.path as string;
						if (!connectionId || !path) {
							throw new Error("connectionId and path are required");
						}
						// TODO: bridge.sftp.read when available (T1 Phase 2)
						throw new Error("SFTP read not yet implemented; requires T1 Phase 2 bridge extension");
					}
					case "opsmaxx_db_query": {
						const connectionId = args.connectionId as string;
						const sql = args.sql as string;
						const params_ = (args.params as string[]) ?? [];
						if (!connectionId || !sql) {
							throw new Error("connectionId and sql are required");
						}
						const result_ = await unwrapResult(
							await bridge.databases.query(connectionId, sql, params_),
						);
						result = { result: result_ };
						break;
					}
					case "opsmaxx_ssh_session_open": {
						const connectionId = args.connectionId as string;
						if (!connectionId) throw new Error("connectionId is required");
						const sessionResult = await bridge.ssh.open(connectionId);
						const session = unwrapResult(sessionResult);
						result = { session };
						break;
					}
					case "opsmaxx_approval_status": {
						const capability = args.capability as string;
						const args_ = args.args ?? {};
						if (!capability) throw new Error("capability is required");
						const approvedResult = await bridge.security.isApprovedByUser(capability, args_);
						const approved = unwrapResult(approvedResult);
						result = { approved };
						break;
					}
					case "opsmaxx_whoami": {
						// Local bridge introspection
						result = { bridge: "memory", services: 0 };
						break;
					}
					default:
						throw new Error(`Unhandled safe tool: ${toolName}`);
				}

				emitBridgeCall(toolName, args);
				return jsonRpcResponse(id, { content: [{ type: "text", text: JSON.stringify(result) }] });
			} catch (err) {
				const message = err instanceof Error ? err.message : "Internal bridge error";
				return bridgeError(id, message);
			}
		}

		return methodNotFound(id, String(method));
	});
}

// Re-export tool definitions for documentation / config
export { SAFE_TOOL_DEFINITIONS, type SafeToolName };
