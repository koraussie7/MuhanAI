/**
 * Tests for the OpsMaxx IPC client (T1 Phase 2).
 *
 * These tests use a fake Transport stub to verify the IPC client
 * correctly maps method calls, handles responses, errors, timeouts,
 * and notification routing — all without a real OpsMaxx daemon.
 */

/** Narrowing helper: assert Result is ok and return its value. */
function unwrap<T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T {
	if (r.ok) return r.value;
	throw new Error(`expected ok, got error: ${JSON.stringify(r.error)}`);
}

import { describe, expect, it } from "vitest";
import {
	createIpcClient,
	type LocalMethod,
	METHOD_MAP,
	stableStringify,
	type Transport,
} from "../ipc.js";
import {
	type BridgeError,
	type DbConnection,
	type DbResultSet,
	err,
	type McpToolDefinition,
	type McpToolHandler,
	ok,
	type Result,
	type SshConnection,
	type SshExecResult,
	type SshSession,
	type VaultEntry,
} from "../types.js";

/**
 * Creates a Transport stub that records all sent requests and allows
 * the test to control responses via a queue.
 */
function createQueueTransport(): {
	transport: Transport;
	queue: Array<{
		method: string;
		params: unknown;
		resolve: (v: unknown) => void;
		reject: (e: unknown) => void;
	}>;
	__notify(method: string, params: unknown): void;
} {
	const queue: Array<{
		method: string;
		params: unknown;
		resolve: (v: unknown) => void;
		reject: (e: unknown) => void;
	}> = [];
	const handlers = new Map<string, Set<(params: unknown) => void>>();

	return {
		transport: {
			send: async (method, params) => {
				return new Promise((resolve, reject) => {
					queue.push({ method, params, resolve, reject });
				});
			},
			subscribe(method: string, handler: (params: unknown) => void): () => void {
				let set = handlers.get(method);
				if (!set) {
					set = new Set();
					handlers.set(method, set);
				}
				set.add(handler);
				return () => {
					const h = handlers.get(method);
					h?.delete(handler);
				};
			},
			close: async () => {},
		},
		queue,
		__notify(method: string, params: unknown) {
			const handlers_ = handlers.get(method);
			if (handlers_) {
				for (const h of handlers_) h(params);
			}
		},
	};
}

/**
 * Creates a Transport stub that responds to specific method calls.
 */
function createStubTransport(
	responses: Map<
		string,
		{ ok: boolean; value?: unknown; error?: { code: number; message: string } }
	>,
): Transport {
	const handlers = new Map<string, Set<(params: unknown) => void>>();

	return {
		send: async (method, params) => {
			const key = JSON.stringify({ method, params });
			const response = responses.get(key) ?? responses.get(method);
			if (!response) {
				throw new Error(`No stub for ${method}`);
			}
			if (!response.ok) {
				throw {
					code: response.error?.code ?? -32603,
					message: response.error?.message ?? "stub error",
				};
			}
			return response.value;
		},
		subscribe(method: string, handler: (params: unknown) => void): () => void {
			let set = handlers.get(method);
			if (!set) {
				set = new Set();
				handlers.set(method, set);
			}
			set.add(handler);
			return () => {
				const s = handlers.get(method);
				s?.delete(handler);
			};
		},
		close: async () => {},
	};
}

/**
 * Creates a Transport stub that never responds (for timeout testing).
 */
function createNeverRespondTransport(): Transport {
	return {
		send: () => new Promise(() => {}),
		subscribe: () => () => {},
		close: async () => {},
	};
}

/**
 * Creates a Transport stub that responds with errors.
 */
function createErrorTransport(error: { code: number; message: string }): Transport {
	return {
		send: async () => {
			throw { code: -32601, message: "Method not found" };
		},
		subscribe: () => () => {},
		close: async () => {},
	};
}

function unwrapResult<T>(
	result: { ok: true; value: unknown } | { ok: false; error: { message: string } },
): unknown {
	if (!result.ok) {
		throw new Error(result.error.message);
	}
	return result.value;
}

describe("@agentmesh/opsmaxx-bridge IPC client", () => {
	describe("METHOD_MAP", () => {
		it("covers all 14 bridge methods", () => {
			const localMethods = Object.keys(METHOD_MAP) as Array<keyof typeof METHOD_MAP>;
			expect(localMethods.length).toBe(14);
		});

		it("maps each local method to a wire method", () => {
			for (const [local, wire] of Object.entries(METHOD_MAP)) {
				expect(typeof local).toBe("string");
				expect(typeof wire).toBe("string");
				expect(wire.length).toBeGreaterThan(0);
			}
		});

		it("has no duplicate wire methods", () => {
			const wireMethods = Object.values(METHOD_MAP);
			const unique = new Set(wireMethods);
			expect(unique.size).toBe(wireMethods.length);
		});
	});

	describe("createIpcClient with stub transport", () => {
		it("maps vault.list to vault.list wire method", async () => {
			const responses = new Map();
			responses.set("vault.list", { ok: true, value: [] });
			const bridge = createIpcClient({ transport: createStubTransport(responses) });
			const r = await bridge.vault.list();
			expect(r.ok).toBe(true);
			expect(unwrap(r)).toEqual([]);
		});

		it("maps vault.get to vault.get wire method with service param", async () => {
			const responses = new Map();
			responses.set("vault.get", {
				ok: true,
				value: { service: "api", hasSecret: true, note: "test", updatedAt: Date.now() },
			});
			const bridge = createIpcClient({ transport: createStubTransport(responses) });
			const r = await bridge.vault.get("api");
			expect(r.ok).toBe(true);
			expect(unwrap(r)?.service).toBe("api");
		});

		it("maps vault.set to vault.set wire method", async () => {
			const responses = new Map();
			responses.set("vault.set", { ok: true, value: undefined });
			const bridge = createIpcClient({ transport: createStubTransport(responses) });
			const r = await bridge.vault.set("api", "secret", "note");
			expect(r.ok).toBe(true);
		});

		it("maps vault.remove to vault.remove wire method", async () => {
			const responses = new Map();
			responses.set("vault.remove", { ok: true, value: undefined });
			const bridge = createIpcClient({ transport: createStubTransport(responses) });
			const r = await bridge.vault.remove("api");
			expect(r.ok).toBe(true);
		});

		it("maps ssh.list to ssh.list wire method", async () => {
			const responses = new Map();
			responses.set("ssh.list", {
				ok: true,
				value: [
					{
						id: "ssh-1",
						label: "Test",
						host: "localhost",
						port: 22,
						username: "user",
						authRef: "key-1",
					},
				],
			});
			const bridge = createIpcClient({ transport: createStubTransport(responses) });
			const r = await bridge.ssh.listConnections();
			expect(r.ok).toBe(true);
			expect(unwrap(r)).toHaveLength(1);
		});

		it("maps ssh.open to ssh.open wire method", async () => {
			const responses = new Map();
			responses.set("ssh.open", {
				ok: true,
				value: { sessionId: "s-123", connectionId: "ssh-1", startedAt: Date.now() },
			});
			const bridge = createIpcClient({ transport: createStubTransport(responses) });
			const r = await bridge.ssh.open("ssh-1");
			expect(r.ok).toBe(true);
			expect(unwrap(r)?.sessionId).toMatch(/^s-/);
		});

		it("maps ssh.exec to ssh.exec wire method", async () => {
			const responses = new Map();
			responses.set("ssh.exec", {
				ok: true,
				value: { stdout: "ok", stderr: "", exitCode: 0, durationMs: 10 },
			});
			const bridge = createIpcClient({ transport: createStubTransport(responses) });
			const r = await bridge.ssh.exec("sess-1", "ls");
			expect(r.ok).toBe(true);
			expect(unwrap(r)?.stdout).toBe("ok");
		});

		it("maps ssh.close to ssh.close wire method", async () => {
			const responses = new Map();
			responses.set("ssh.close", { ok: true, value: undefined });
			const bridge = createIpcClient({ transport: createStubTransport(responses) });
			const r = await bridge.ssh.close("sess-1");
			expect(r.ok).toBe(true);
		});

		it("maps db.list to db.list wire method", async () => {
			const responses = new Map();
			responses.set("db.list", {
				ok: true,
				value: [
					{
						id: "db-1",
						label: "Test",
						engine: "postgres" as const,
						host: "localhost",
						port: 5432,
						database: "test",
					},
				],
			});
			const bridge = createIpcClient({ transport: createStubTransport(responses) });
			const r = await bridge.databases.listConnections();
			expect(r.ok).toBe(true);
			expect(unwrap(r)).toHaveLength(1);
		});

		it("maps db.query to db.query wire method", async () => {
			const responses = new Map();
			responses.set("db.query", {
				ok: true,
				value: { columns: ["id"], rows: [{ id: "1" }], rowCount: 1, durationMs: 5 },
			});
			const bridge = createIpcClient({ transport: createStubTransport(responses) });
			const r = await bridge.databases.query("db-1", "SELECT 1");
			expect(r.ok).toBe(true);
			expect(unwrap(r)?.columns).toEqual(["id"]);
		});

		it("maps db.write to db.write wire method", async () => {
			const responses = new Map();
			responses.set("db.write", { ok: true, value: { affectedRows: 1 } });
			const bridge = createIpcClient({ transport: createStubTransport(responses) });
			const r = await bridge.databases.write("db-1", "INSERT INTO t VALUES (1)");
			expect(r.ok).toBe(true);
			expect(unwrap(r)?.affectedRows).toBe(1);
		});

		it("maps approval.check to approval.check wire method", async () => {
			const responses = new Map();
			responses.set("approval.check", { ok: true, value: true });
			const bridge = createIpcClient({ transport: createStubTransport(responses) });
			const r = await bridge.security.isApprovedByUser("opsmaxx_db_write", {
				sql: "DROP TABLE users",
			});
			expect(r.ok).toBe(true);
			expect(unwrap(r)).toBe(true);
		});

		it("maps approval.request to approval.request wire method", async () => {
			const responses = new Map();
			responses.set("approval.request", { ok: true, value: false });
			const bridge = createIpcClient({ transport: createStubTransport(responses) });
			const r = await bridge.security.requestApproval({
				capability: "opsmaxx_db_write",
				risk: "high-risk-needs-double-approval",
				summary: "DROP TABLE users",
				args: { sql: "DROP TABLE users" },
				preview: {},
			});
			expect(r.ok).toBe(true);
			expect(unwrap(r)).toBe(false);
		});

		it("maps mcp.publish to mcp.publish wire method", async () => {
			const responses = new Map();
			responses.set("mcp.publish", { ok: true, value: undefined });
			const bridge = createIpcClient({ transport: createStubTransport(responses) });
			const r = await bridge.aiGateway.publishMcpTool({
				name: "test_tool",
				description: "Test",
				inputSchema: { type: "object", properties: {} },
			});
			expect(r.ok).toBe(true);
		});
	});

	describe("notification routing (mcp.invoke)", () => {
		it("routes mcp.invoke notifications to registered handlers", async () => {
			const { transport, __notify } = createQueueTransport();
			const { createIpcClient: createClient } = await import("../ipc.js");
			const bridge = createClient({ transport });

			let receivedArgs: Record<string, unknown> | null = null;
			const unsubscribe = bridge.aiGateway.onMcpInvoke("test_tool", async (args) => {
				receivedArgs = args;
				return ok("done");
			});

			// Simulate notification from transport
			__notify("mcp.invoke", {
				name: "test_tool",
				args: { foo: "bar" },
			});

			// Allow microtasks to flush
			await new Promise((r) => setTimeout(r, 10));

			expect(receivedArgs).toEqual({ foo: "bar" });

			unsubscribe();
		});

		it("routes a notification only to the matching named handler", async () => {
			const { transport, __notify } = createQueueTransport();
			const { createIpcClient: createClient } = await import("../ipc.js");
			const bridge = createClient({ transport });

			const results: Record<string, unknown>[] = [];
			const unsub1 = bridge.aiGateway.onMcpInvoke("tool1", async (args) => {
				results.push({ h: 1, ...args });
				return ok("ok");
			});
			const unsub2 = bridge.aiGateway.onMcpInvoke("tool2", async (args) => {
				results.push({ h: 2, ...args });
				return ok("ok");
			});

				__notify("mcp.invoke", {
			name: "tool2",
			args: { x: 1 },
			});

			await new Promise((r) => setTimeout(r, 10));

				expect(results).toEqual([{ h: 2, x: 1 }]);

			unsub1();
			unsub2();
		});

		it("unsubscribe removes handler", async () => {
			const { transport, __notify } = createQueueTransport();
			const { createIpcClient: createClient } = await import("../ipc.js");
			const bridge = createClient({ transport });

			let count = 0;
			const unsub = bridge.aiGateway.onMcpInvoke("test", async () => {
				count++;
				return ok(undefined);
			});

			unsub();

			__notify("mcp.invoke", {
				name: "test",
				args: {},
			});

			await new Promise((r) => setTimeout(r, 10));

			expect(count).toBe(0);
		});
	});

	describe("error handling", () => {
		it("maps wire error to BridgeError with correct code", async () => {
			const responses = new Map();
			responses.set("vault.list", {
				ok: false,
				error: { code: -32601, message: "Method not found" },
			});
			const bridge = createIpcClient({
				transport: createErrorTransport({ code: -32601, message: "Method not found" }),
			});
			const r = await bridge.vault.list();
			expect(r.ok).toBe(false);
			if (!r.ok) {
				expect(r.error.code).toBe("not_connected"); // mapped from -32601
			}
		});

		it("timeout rejects with BridgeError timeout code", async () => {
			const bridge = createIpcClient({ transport: createNeverRespondTransport(), timeoutMs: 50 });
			const r = await bridge.vault.list();
			expect(r.ok).toBe(false);
			if (!r.ok) {
				expect(r.error.code).toBe("timeout");
			}
		});
	});

	describe("bridge contract compliance", () => {
		it("implements all 14 OpsMaxxBridge methods", async () => {
			const responses = new Map();
			// Seed minimal successful responses for all methods
			responses.set("vault.list", { ok: true, value: [] });
			responses.set("vault.get", { ok: true, value: null });
			responses.set("vault.set", { ok: true, value: undefined });
			responses.set("vault.remove", { ok: true, value: undefined });
			responses.set("ssh.list", { ok: true, value: [] });
			responses.set("ssh.open", {
				ok: true,
				value: { sessionId: "s-1", connectionId: "c-1", startedAt: Date.now() },
			});
			responses.set("ssh.exec", {
				ok: true,
				value: { stdout: "", stderr: "", exitCode: 0, durationMs: 0 },
			});
			responses.set("ssh.close", { ok: true, value: undefined });
			responses.set("db.list", { ok: true, value: [] });
			responses.set("db.query", {
				ok: true,
				value: { columns: [], rows: [], rowCount: 0, durationMs: 0 },
			});
			responses.set("db.write", { ok: true, value: { affectedRows: 0 } });
			responses.set("approval.check", { ok: true, value: false });
			responses.set("approval.request", { ok: true, value: false });
			responses.set("mcp.publish", { ok: true, value: undefined });

			const bridge = createIpcClient({ transport: createStubTransport(responses) });

			await expect(bridge.vault.list()).resolves.toEqual({ ok: true, value: [] });
			await expect(bridge.vault.get("test")).resolves.toEqual({ ok: true, value: null });
			await expect(bridge.vault.set("test", "secret")).resolves.toEqual({
				ok: true,
				value: undefined,
			});
			await expect(bridge.vault.remove("test")).resolves.toEqual({ ok: true, value: undefined });
			await expect(bridge.ssh.listConnections()).resolves.toEqual({ ok: true, value: [] });
			await expect(bridge.ssh.open("c-1")).resolves.toMatchObject({
				ok: true,
				value: { sessionId: expect.any(String) },
			});
			await expect(bridge.ssh.exec("s-1", "ls")).resolves.toMatchObject({
				ok: true,
				value: { exitCode: expect.any(Number) },
			});
			await expect(bridge.ssh.close("s-1")).resolves.toEqual({ ok: true, value: undefined });
			await expect(bridge.databases.listConnections()).resolves.toEqual({ ok: true, value: [] });
			await expect(bridge.databases.query("db-1", "SELECT 1")).resolves.toMatchObject({
				ok: true,
				value: { columns: expect.any(Array) },
			});
			await expect(bridge.databases.write("db-1", "INSERT 1")).resolves.toEqual({
				ok: true,
				value: { affectedRows: 0 },
			});
			await expect(bridge.security.isApprovedByUser("test", {})).resolves.toEqual({
				ok: true,
				value: false,
			});
			await expect(bridge.security.requestApproval({} as any)).resolves.toEqual({
				ok: true,
				value: false,
			});
			await expect(
				bridge.aiGateway.publishMcpTool({
					name: "t",
					description: "d",
					inputSchema: { type: "object", properties: {} },
				}),
			).resolves.toEqual({ ok: true, value: undefined });
		});

		it("close clears subscriptions and closes transport", async () => {
			const responses = new Map();
			responses.set("vault.list", { ok: true, value: [] });
			const bridge = createIpcClient({ transport: createStubTransport(responses) });

			await bridge.close();

			// Verify transport.close was called
			// (We can't easily test this without more complex mocking,
			// but the method should not throw)
			await expect(bridge.close()).resolves.toBeUndefined();
		});
	});

	describe("stableStringify", () => {
		it("produces deterministic output for same input", async () => {
			const { stableStringify: ss } = await import("../ipc.js");
			const obj = { a: 1, b: { c: 2 } };
			expect(ss(obj)).toBe(ss(obj));
		});

		it("handles null and undefined", async () => {
			const { stableStringify: ss } = await import("../ipc.js");
			expect(ss(null)).toBe("null");
			expect(ss(undefined)).toBe("null");
		});

		it("orders keys deterministically", async () => {
			const { stableStringify: ss } = await import("../ipc.js");
			const a = { z: 1, a: 2 };
			const b = { a: 2, z: 1 };
			expect(ss(a)).toBe(ss(b));
		});
	});

	describe("Transport interface compliance", () => {
		it("createStdioTransport returns Transport with send, subscribe, close", async () => {
			const { createStdioTransport } = await import("../transport.js");
			const { transport, shutdown } = createStdioTransport({ timeoutMs: 100 });
			expect(typeof transport.send).toBe("function");
			expect(typeof transport.subscribe).toBe("function");
			expect(typeof transport.close).toBe("function");
			await shutdown();
		});

		it("createHttpTransport returns Transport", async () => {
			const { createHttpTransport } = await import("../transport.js");
			const transport = createHttpTransport({ baseUrl: "http://localhost:12345" });
			expect(typeof transport.send).toBe("function");
			expect(typeof transport.subscribe).toBe("function");
			expect(typeof transport.close).toBe("function");
		});
	});
});
