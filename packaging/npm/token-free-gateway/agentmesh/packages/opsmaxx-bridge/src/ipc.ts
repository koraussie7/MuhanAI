/**
 * OpsMaxx IPC client — production bridge implementation (T1 Phase 2).
 *
 * THIS FILE IS A SKELETON. The full implementation is delegated to the
 * `opsmaxx-ipc-engineer` agent (see
 * `docs/agentmesh/T1-OPSMAXX-IPC-CLIENT.md`). Do not implement it
 * inline — that is a separate track with its own day budget, its own
 * merge window, and its own dependency on the OpsMaxx maintainer
 * reply (see `docs/agentmesh/OPSMAXX-CONTACT.md`).
 *
 * What this file currently provides:
 *
 *   1. A `Transport` plugin point so the actual wire protocol can be
 *      swapped (stdio / HTTP / WebSocket) without rewriting the
 *      `OpsMaxxBridge` methods.
 *   2. The single `METHOD_MAP` table that decides which JSON-RPC
 *      method name corresponds to each `OpsMaxxBridge` call. This is
 *      the only place a wire-level rename should ever happen.
 *   3. The error-code mapping from wire strings to the 10
 *      `BridgeErrorCode` variants in `./types.ts`.
 *   4. A `createIpcClient({ transport })` factory that satisfies the
 *      `OpsMaxxBridge` contract against any conforming `Transport`.
 *      Used by `factory.ts` once Phase 2 lands.
 *
 * Tests live in `__tests__/ipc.test.ts` and must satisfy the contract
 * conformance check from the IPC client work plan.
 */

import type { Transport } from "./transport.js";
import {
	type ApprovalCard,
	BridgeError,
	type BridgeErrorCode,
	type DbConnection,
	type DbResultSet,
	err,
	type McpToolDefinition,
	type McpToolHandler,
	type OpsMaxxBridge,
	ok,
	type Result,
	type SshConnection,
	type SshExecResult,
	type SshSession,
	type VaultEntry,
} from "./types.js";

// Re-export Transport so consumers can import it from either module.
export type { Transport };

// ---------------------------------------------------------------------------
// METHOD_MAP — the only place a wire rename belongs.
// ---------------------------------------------------------------------------

export const METHOD_MAP = {
	// vault
	"vault.list": "vault.list",
	"vault.get": "vault.get",
	"vault.set": "vault.set",
	"vault.remove": "vault.remove",
	// ssh
	"ssh.list": "ssh.list",
	"ssh.open": "ssh.open",
	"ssh.exec": "ssh.exec",
	"ssh.close": "ssh.close",
	// databases
	"db.list": "db.list",
	"db.query": "db.query",
	"db.write": "db.write",
	// approval
	"approval.check": "approval.check",
	"approval.request": "approval.request",
	// ai / mcp
	"mcp.publish": "mcp.publish",
	// mcp.invoke is a server push notification, not a request method
} as const;

export type LocalMethod = keyof typeof METHOD_MAP;
export type WireMethod = (typeof METHOD_MAP)[LocalMethod];

const VALID_ERROR_CODES: ReadonlySet<BridgeErrorCode> = new Set([
	"not_connected",
	"permission_denied",
	"approval_required",
	"approval_denied",
	"user_not_authenticated",
	"host_unreachable",
	"auth_failed",
	"timeout",
	"invalid_args",
	"internal",
]);

function mapWireError(raw: unknown): BridgeError {
	if (raw && typeof raw === "object" && "code" in raw && "message" in raw) {
		const code = (raw as { code: unknown }).code;
		const message = String((raw as { message: unknown }).message ?? "unknown error");
		if (typeof code === "string" && VALID_ERROR_CODES.has(code as BridgeErrorCode)) {
			return new BridgeError(code as BridgeErrorCode, message);
		}
		// Map JSON-RPC numeric error codes to our BridgeErrorCode strings
		if (typeof code === "number") {
			const mapped = JSON_RPC_ERROR_MAP[String(code)];
			if (mapped) return new BridgeError(mapped, message);
		}
	}
	return new BridgeError("internal", "unexpected wire error", raw);
}

// JSON-RPC 2.0 error code → BridgeErrorCode mapping
const JSON_RPC_ERROR_MAP: Record<string, BridgeErrorCode> = {
	"-32700": "internal", // Parse error
	"-32600": "invalid_args", // Invalid Request
	"-32601": "not_connected", // Method not found
	"-32602": "invalid_args", // Invalid params
	"-32603": "internal", // Internal error
	"-32000": "internal", // Server error (generic)
};

// ---------------------------------------------------------------------------
// Skeleton: this is what the delegated track fills in.
// ---------------------------------------------------------------------------

export interface IpcClientOptions {
	transport: Transport;
	/** Default request timeout in ms; default 5000. */
	timeoutMs?: number;
}

export function createIpcClient(options: IpcClientOptions): OpsMaxxBridge {
	const timeoutMs = options.timeoutMs ?? 5000;
	const transport = options.transport;
	const subscriptions = new Map<
		string,
		Set<{ name: string; handler: (args: Record<string, unknown>) => Promise<unknown> | unknown }>
		>();

	function call<T>(localMethod: LocalMethod, params: unknown): Promise<Result<T, BridgeError>> {
		const wireMethod = METHOD_MAP[localMethod];
		return new Promise((resolve) => {
			let settled = false;
			const timer = setTimeout(() => {
				if (settled) return;
				settled = true;
				resolve(err(new BridgeError("timeout", `${wireMethod} timed out after ${timeoutMs}ms`)));
			}, timeoutMs);
			transport
				.send(wireMethod, params)
				.then((raw) => {
					if (settled) return;
					settled = true;
					clearTimeout(timer);
					// Wire may be a bare value (production) or already
					// wrapped in `{ ok, value }` (test stub). Detect and
					// unwrap so the contract is consistent for callers.
					if (raw && typeof raw === "object" && "ok" in raw) {
						const envelope = raw as { ok: boolean; value?: unknown; error?: unknown };
						if (envelope.ok) {
							resolve(ok(envelope.value as T));
						} else {
							resolve(err(mapWireError(envelope.error)));
						}
					} else {
						resolve(ok(raw as T));
					}
				})
				.catch((e: unknown) => {
					if (settled) return;
					settled = true;
					clearTimeout(timer);
					resolve(err(mapWireError(e)));
				});
		});
	}

	// Wire push: when the transport supports it, route incoming
	// `mcp.invoke` notifications to the registered handlers.
	transport.subscribe?.("mcp.invoke", (params) => {
		const handlers = subscriptions.get("mcp.invoke");
		if (!handlers) return;
		const p = params as { name?: unknown; args?: unknown } | undefined;
		const name = typeof p?.name === "string" ? p.name : "";
		const args = (p?.args && typeof p.args === "object" ? p.args : {}) as Record<string, unknown>;
			for (const subscription of handlers) {
		if (subscription.name !== name) continue;
		const result = subscription.handler(args);
		if (result) {
		const p = result as Promise<unknown>;
		if (typeof p.then === "function") {
		void p.catch(() => {
		// Handlers are responsible for their own error reporting.
		});
		}
		}
		}
	});

	return {
		vault: {
			list: async () => call<VaultEntry[]>("vault.list", {}),
			get: async (service) => call<VaultEntry | null>("vault.get", { service }),
			set: async (service, secret, note) => call<void>("vault.set", { service, secret, note }),
			remove: async (service) => call<void>("vault.remove", { service }),
		},

		ssh: {
			listConnections: async () => call<SshConnection[]>("ssh.list", {}),
			open: async (connectionId) => call<SshSession>("ssh.open", { connectionId }),
			exec: async (sessionId, cmd) => call<SshExecResult>("ssh.exec", { sessionId, cmd }),
			close: async (sessionId) => call<void>("ssh.close", { sessionId }),
		},

		databases: {
			listConnections: async () => call<DbConnection[]>("db.list", {}),
			query: async (connectionId, sql, params) =>
				call<DbResultSet>("db.query", { connectionId, sql, params }),
			write: async (connectionId, sql, params) =>
				call<{ affectedRows: number }>("db.write", { connectionId, sql, params }),
		},

		aiGateway: {
			publishMcpTool: async (def: McpToolDefinition) => call<void>("mcp.publish", { def }),
					onMcpInvoke: (name: string, handler: McpToolHandler) => {
			let set = subscriptions.get("mcp.invoke");
			if (!set) {
			set = new Set();
				subscriptions.set("mcp.invoke", set);
			}
			const subscription = { name, handler };
			set.add(subscription);
			return () => {
			set?.delete(subscription);
			};
			},
		},

		security: {
			isApprovedByUser: async (capability, args) => {
				const argsHash = stableStringify(args);
				return call<boolean>("approval.check", { capability, argsHash });
			},
			requestApproval: async (card: ApprovalCard) => {
				return call<boolean>("approval.request", card);
			},
		},

		close: async () => {
			subscriptions.clear();
			await transport.close();
		},
	};
}

/**
 * Deterministic JSON stringify for `(capability, argsHash)` keying.
 * Mirrors the mock's `hashKey` byte-for-byte so cache hits align.
 */
export function stableStringify(value: unknown): string {
	if (value === null || value === undefined) return "null";
	if (typeof value !== "object" || Array.isArray(value)) {
		return JSON.stringify(value);
	}
	// Sort keys for deterministic output
	const obj = value as Record<string, unknown>;
	const sortedKeys = Object.keys(obj).sort();
	const entries = sortedKeys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`);
	return `{${entries.join(",")}}`;
}
