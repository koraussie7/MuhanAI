/**
 * In-memory OpsMaxx bridge for tests and dev-without-OpsMaxx.
 *
 * Tracks approvals per (capability, args-hash) so a test that calls
 * `requestApproval` can be deterministic. Exposes `__reset()` for test
 * setup. Not exported from the package root — import via
 * `@agentmesh/opsmaxx-bridge/mock`.
 */

import {
	type ApprovalCard,
	BridgeError,
	type DbConnection,
	type DbResultSet,
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

export type MockBridge = OpsMaxxBridge & {
	__reset(): void;
	__approve(capability: string, args: unknown): void;
	__deny(capability: string, args: unknown): void;
	__seedSsh(c: SshConnection): void;
	__seedDb(c: DbConnection): void;
};

export type {
	ApprovalCard,
	DbConnection,
	OpsMaxxBridge,
	Result,
	SshConnection,
	VaultEntry,
} from "./types.js";
// Re-export types so consumers can do
// `import { createInMemoryBridge, RISK } from "@agentmesh/opsmaxx-bridge/mock"`.
export { RISK } from "./types.js";

interface InMemoryState {
	vault: Map<string, VaultEntry>;
	vaultSecrets: Map<string, string>;
	ssh: Map<string, SshConnection>;
	sshSessions: Map<string, SshSession>;
	dbs: Map<string, DbConnection>;
	approvals: Set<string>;
	denials: Set<string>;
	tools: Map<string, McpToolDefinition>;
	handlers: Map<string, McpToolHandler>;
}

function freshState(): InMemoryState {
	return {
		vault: new Map(),
		vaultSecrets: new Map(),
		ssh: new Map(),
		sshSessions: new Map(),
		dbs: new Map(),
		approvals: new Set(),
		denials: new Set(),
		tools: new Map(),
		handlers: new Map(),
	};
}

function errInvalid(message: string): Result<never, BridgeError> {
	return { ok: false, error: new BridgeError("invalid_args", message) };
}

function hashKey(capability: string, args: unknown): string {
	return `${capability}::${JSON.stringify(args ?? null)}`;
}

export function createInMemoryBridge(): MockBridge {
	let state = freshState();

	const bridge: MockBridge = {
		vault: {
			list: async () => ok(Array.from(state.vault.values()).map((e) => ({ ...e }))),
			get: async (service) => {
				const e = state.vault.get(service);
				return ok(e ? { ...e } : null);
			},
			set: async (service, secret, note) => {
				state.vaultSecrets.set(service, secret);
				state.vault.set(service, {
					service,
					hasSecret: true,
					note,
					updatedAt: Date.now(),
				});
				return ok(undefined);
			},
			remove: async (service) => {
				state.vaultSecrets.delete(service);
				state.vault.delete(service);
				return ok(undefined);
			},
		},

		ssh: {
			listConnections: async () => ok(Array.from(state.ssh.values()).map((c) => ({ ...c }))),
			open: async (connectionId) => {
				const conn = state.ssh.get(connectionId);
				if (!conn) return errInvalid(`unknown connection: ${connectionId}`);
				const session: SshSession = {
					sessionId: `s-${Math.random().toString(36).slice(2)}`,
					connectionId,
					startedAt: Date.now(),
				};
				state.sshSessions.set(session.sessionId, session);
				return ok(session);
			},
			exec: async (sessionId, _cmd) => {
				if (!state.sshSessions.has(sessionId)) {
					return errInvalid(`unknown session: ${sessionId}`);
				}
				return ok({ stdout: "", stderr: "", exitCode: 0, durationMs: 0 });
			},
			close: async (sessionId) => {
				state.sshSessions.delete(sessionId);
				return ok(undefined);
			},
		},

		databases: {
			listConnections: async () => ok(Array.from(state.dbs.values()).map((c) => ({ ...c }))),
			query: async (_id, _sql, _params) => {
				const out: DbResultSet = { columns: [], rows: [], rowCount: 0, durationMs: 0 };
				return ok(out);
			},
			write: async (_id, _sql, _params) => {
				return ok({ affectedRows: 0 });
			},
		},

		aiGateway: {
			publishMcpTool: async (def) => {
				state.tools.set(def.name, def);
				return ok(undefined);
			},
			onMcpInvoke: (name, handler) => {
				state.handlers.set(name, handler);
				return () => {
					if (state.handlers.get(name) === handler) state.handlers.delete(name);
				};
			},
		},

		security: {
			isApprovedByUser: async (capability, args) => {
				return ok(state.approvals.has(hashKey(capability, args)));
			},
			requestApproval: async (card: ApprovalCard) => {
				const key = hashKey(card.capability, card.args);
				if (state.denials.has(key)) return ok(false);
				if (state.approvals.has(key)) return ok(true);
				return ok(false);
			},
		},

		close: async () => {
			state = freshState();
		},

		__reset() {
			state = freshState();
		},
		__approve(capability, args) {
			state.approvals.add(hashKey(capability, args));
		},
		__deny(capability, args) {
			state.denials.add(hashKey(capability, args));
		},
		__seedSsh(c) {
			state.ssh.set(c.id, c);
		},
		__seedDb(c) {
			state.dbs.set(c.id, c);
		},
	};

	return bridge;
}
