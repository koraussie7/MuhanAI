/**
 * @agentmesh/opsmaxx-bridge — public type surface
 *
 * This module is the **only** contract that the rest of MuhanAI is allowed to
 * import from the OpsMaxx integration. Implementations (production IPC
 * client, in-memory mock) live in sibling files; the rest of the codebase
 * must depend on these types and the factory, never on Electron code.
 *
 * Design notes:
 *   - All methods return `Result<T, BridgeError>` (via `neverthrow`) so the
 *     agent daemon can route failures through MCP `clientError` instead of
 *     leaking Electron internals to the model.
 *   - Identity flows **inbound only**: OpsMaxx is treated as a credential
 *     bridge, never as an identity issuer. The HMAC `sub` claim verified by
 *     `services/api/src/list-routes.ts:resolveOwner` remains authoritative.
 *   - Risk class is declared per-operation in the registry, not per-call,
 *     so the human-in-the-loop gate (T3 / `mcp-router.ts`) is consistent.
 */

/**
 * The bridge surface intentionally does NOT depend on `neverthrow`.
 * Downstream consumers (T2/T3/T4/T5) can wrap results in their own
 * error-handling type. We use a tiny in-house `Result` so T1 stays
 * zero-dependency at the contract layer.
 */

export type BridgeErrorCode =
	| "not_connected"
	| "permission_denied"
	| "approval_required"
	| "approval_denied"
	| "user_not_authenticated"
	| "host_unreachable"
	| "auth_failed"
	| "timeout"
	| "invalid_args"
	| "internal";

export class BridgeError extends Error {
	override readonly name = "BridgeError";
	constructor(
		public readonly code: BridgeErrorCode,
		message: string,
		override readonly cause?: unknown,
	) {
		super(message);
	}
}

export type Result<T, E = BridgeError> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
	return { ok: true, value };
}
export function err<E>(error: E): Result<never, E> {
	return { ok: false, error };
}

// ---------------------------------------------------------------------------
// Risk classification (consumed by the MCP layer in T3)
// ---------------------------------------------------------------------------

export type RiskClass = "safe" | "needs-approval" | "high-risk-needs-double-approval";

export const RISK: Record<string, RiskClass> = {
	opsmaxx_ssh_list: "safe",
	opsmaxx_ssh_exec: "needs-approval",
	opsmaxx_sftp_read: "safe",
	opsmaxx_sftp_write: "needs-approval",
	opsmaxx_db_list: "safe",
	opsmaxx_db_query: "safe",
	opsmaxx_db_write: "high-risk-needs-double-approval",
	opsmaxx_tunnel_open: "needs-approval",
	opsmaxx_vault_get: "safe",
	opsmaxx_vault_set: "high-risk-needs-double-approval",
	opsmaxx_vault_remove: "needs-approval",
	opsmaxx_approval_request: "safe",
};

// ---------------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------------

export interface VaultEntry {
	service: string;
	/** Opaque metadata only; never the secret itself. */
	hasSecret: boolean;
	note?: string;
	updatedAt: number;
}

export interface SshConnection {
	id: string;
	label: string;
	host: string;
	port: number;
	username: string;
	/** Identifies the credential OpsMaxx will use. */
	authRef: string;
}

export interface SshSession {
	sessionId: string;
	connectionId: string;
	startedAt: number;
}

export interface SshExecResult {
	stdout: string;
	stderr: string;
	exitCode: number;
	durationMs: number;
}

export interface DbConnection {
	id: string;
	label: string;
	engine: "postgres" | "mysql" | "mariadb" | "sqlserver" | "redis";
	host: string;
	port: number;
	database: string;
}

export interface DbResultSet {
	columns: string[];
	rows: Record<string, unknown>[];
	rowCount: number;
	durationMs: number;
}

export interface ApprovalCard {
	capability: string;
	risk: RiskClass;
	summary: string;
	args: Record<string, unknown>;
	/** Caller-visible only; the secret value never leaves OpsMaxx. */
	preview: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// MCP bridge (bidirectional)
// ---------------------------------------------------------------------------

export interface McpToolDefinition {
	name: string;
	description: string;
	inputSchema: {
		type: "object";
		properties: Record<string, { type: string; description: string }>;
		required?: string[];
	};
}

export type McpToolHandler = (
	args: Record<string, unknown>,
) => Promise<Result<unknown, BridgeError>>;

// ---------------------------------------------------------------------------
// The bridge contract
// ---------------------------------------------------------------------------

export interface OpsMaxxBridge {
	vault: {
		list(): Promise<Result<VaultEntry[], BridgeError>>;
		/** Returns metadata only; the secret never crosses the bridge. */
		get(service: string): Promise<Result<VaultEntry | null, BridgeError>>;
		set(service: string, secret: string, note?: string): Promise<Result<void, BridgeError>>;
		remove(service: string): Promise<Result<void, BridgeError>>;
	};

	ssh: {
		listConnections(): Promise<Result<SshConnection[], BridgeError>>;
		open(connectionId: string): Promise<Result<SshSession, BridgeError>>;
		exec(sessionId: string, cmd: string): Promise<Result<SshExecResult, BridgeError>>;
		close(sessionId: string): Promise<Result<void, BridgeError>>;
	};

	databases: {
		listConnections(): Promise<Result<DbConnection[], BridgeError>>;
		query(
			connectionId: string,
			sql: string,
			params?: unknown[],
		): Promise<Result<DbResultSet, BridgeError>>;
		write(
			connectionId: string,
			sql: string,
			params?: unknown[],
		): Promise<Result<{ affectedRows: number }, BridgeError>>;
	};

	aiGateway: {
		publishMcpTool(def: McpToolDefinition): Promise<Result<void, BridgeError>>;
		onMcpInvoke(name: string, handler: McpToolHandler): () => void;
	};

	security: {
		isApprovedByUser(capability: string, args: unknown): Promise<Result<boolean, BridgeError>>;
		requestApproval(card: ApprovalCard): Promise<Result<boolean, BridgeError>>;
	};

	/** Graceful shutdown of the underlying transport. */
	close(): Promise<void>;
}
