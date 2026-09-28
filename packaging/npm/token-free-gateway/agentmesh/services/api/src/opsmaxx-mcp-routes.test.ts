/**
 * Tests for the OpsMaxx MCP Safe Tool Surface (T3-A)
 *
 * Covers the 8 read-only tools at POST /api/opsmaxx-mcp/rpc.
 * Uses the in-memory bridge mock from @agentmesh/opsmaxx-bridge/mock.
 */

import type { DbConnection, SshConnection } from "@agentmesh/opsmaxx-bridge";
import { createInMemoryBridge } from "@agentmesh/opsmaxx-bridge/mock";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { __setOpsMaxxBridgeForTest } from "./opsmaxx-mcp-routes.js";
import { buildApp } from "./server.js";

// Disable auth for tests — scoped to this suite via beforeAll/afterAll so
// we do not leak DISABLE_AUTH=1 into later test files (server.test.ts).
let app: Awaited<ReturnType<typeof buildApp>>;
let bridge: ReturnType<typeof createInMemoryBridge>;
let prevDisableAuth: string | undefined;
beforeAll(async () => {
	prevDisableAuth = process.env.DISABLE_AUTH;
	process.env.DISABLE_AUTH = "true";
	bridge = createInMemoryBridge();
	// Seed some test data before buildApp decorates the app with it.
	bridge.__seedSsh({
		id: "ssh-1",
		label: "Production Server",
		host: "prod.example.com",
		port: 22,
		username: "deploy",
		authRef: "opsmaxx-ssh-key-1",
	});
	bridge.__seedSsh({
		id: "ssh-2",
		label: "Staging Server",
		host: "staging.example.com",
		port: 22,
		username: "deploy",
		authRef: "opsmaxx-ssh-key-2",
	});
	bridge.__seedDb({
		id: "db-1",
		label: "Main Postgres",
		engine: "postgres",
		host: "db.example.com",
		port: 5432,
		database: "main",
	});
	bridge.__seedDb({
		id: "db-2",
		label: "Analytics MySQL",
		engine: "mysql",
		host: "analytics.example.com",
		port: 3306,
		database: "analytics",
	});
	bridge.__seedSsh({
		id: "ssh-2",
		label: "Staging Server",
		host: "staging.example.com",
		port: 22,
		username: "deploy",
		authRef: "opsmaxx-ssh-key-2",
	});
	await bridge.vault.set("openai", "sk-test-123", "Test API key");
	await bridge.vault.set("anthropic", "sk-ant-test-456", "Anthropic test key");
	app = await buildApp({
		enableTransport: false,
		opsmaxxBridge: bridge,
	});
	await app.ready();
});
afterAll(async () => {
	if (prevDisableAuth === undefined) {
		delete process.env.DISABLE_AUTH;
	} else {
		process.env.DISABLE_AUTH = prevDisableAuth;
	}
	await app.close();
});
interface JsonRpcResponse {
	jsonrpc: "2.0";
	id: unknown;
	result?: unknown;
	error?: { code: number; message: string; data?: unknown };
}
describe("OpsMaxx MCP Safe Tools — POST /api/opsmaxx-mcp/rpc", () => {
	async function rpc(
		method: string,
		params: Record<string, unknown> = {},
	): Promise<JsonRpcResponse> {
		const res = await app.inject({
			method: "POST",
			url: "/api/opsmaxx-mcp/rpc",
			payload: { jsonrpc: "2.0", id: 1, method, params },
		});
		return res.json() as JsonRpcResponse;
	}

	function parseContent(res: JsonRpcResponse): unknown {
		expect(res.result).toBeDefined();
		const contentArray = (res.result as { content: Array<{ text: string }> }).content;
		expect(contentArray).toBeDefined();
		expect(contentArray.length).toBeGreaterThan(0);
		const first = contentArray[0] as { text: string };
		return JSON.parse(first.text);
	}

	describe("tools/list", () => {
		it("returns exactly the 8 safe tools", async () => {
			const res = await rpc("tools/list", {});
			expect(res.result).toBeDefined();
			const tools = (res.result as { tools: Array<{ name: string }> }).tools;
			expect(tools).toHaveLength(8);
			const names = tools.map((t) => t.name).sort();
			expect(names).toEqual([
				"opsmaxx_approval_status",
				"opsmaxx_db_list",
				"opsmaxx_db_query",
				"opsmaxx_sftp_read",
				"opsmaxx_ssh_list",
				"opsmaxx_ssh_session_open",
				"opsmaxx_vault_list",
				"opsmaxx_whoami",
			]);
		});

		it("each tool has valid inputSchema", async () => {
			const res = await rpc("tools/list", {});
			const tools = (res.result as { tools: Array<{ inputSchema: object }> }).tools;
			for (const tool of tools) {
				expect(tool.inputSchema).toHaveProperty("type", "object");
				expect(tool.inputSchema).toHaveProperty("properties");
			}
		});
	});

	describe("opsmaxx_ssh_list", () => {
		it("returns seeded SSH connections", async () => {
			const res = await rpc("tools/call", { name: "opsmaxx_ssh_list", arguments: {} });
			const content = parseContent(res);
			expect(content).toHaveProperty("connections");
			const connections = (content as { connections: unknown[] }).connections;
			expect(connections).toHaveLength(2);
			const conn0 = connections[0] as Record<string, unknown>;
			expect(conn0).toHaveProperty("id", "ssh-1");
			expect(conn0).toHaveProperty("label", "Production Server");
			expect(conn0).not.toHaveProperty("secret"); // no secret field
		});
	});

	describe("opsmaxx_db_list", () => {
		it("returns seeded database connections", async () => {
			const res = await rpc("tools/call", { name: "opsmaxx_db_list", arguments: {} });
			const content = parseContent(res);
			expect(content).toHaveProperty("connections");
			const connections = (content as { connections: unknown[] }).connections;
			expect(connections).toHaveLength(2);
			const conn0 = connections[0] as Record<string, unknown>;
			expect(conn0).toHaveProperty("id", "db-1");
			expect(conn0).toHaveProperty("engine", "postgres");
			expect(conn0).not.toHaveProperty("password");
		});
	});

	describe("opsmaxx_vault_list", () => {
		it("returns vault entries with metadata only (no secrets)", async () => {
			const res = await rpc("tools/call", { name: "opsmaxx_vault_list", arguments: {} });
			const content = parseContent(res);
			expect(content).toHaveProperty("entries");
			const entries = (content as { entries: unknown[] }).entries;
			expect(entries).toHaveLength(2);
			for (const entry of entries) {
				const e = entry as Record<string, unknown>;
				expect(e).toHaveProperty("service");
				expect(e).toHaveProperty("hasSecret", true);
				expect(e).not.toHaveProperty("secret"); // CRITICAL: secret must never be exposed
				expect(e).not.toHaveProperty("value");
			}
		});
	});

	describe("opsmaxx_db_query", () => {
		it("executes a SELECT query and returns DbResultSet shape", async () => {
			const res = await rpc("tools/call", {
				name: "opsmaxx_db_query",
				arguments: { connectionId: "db-1", sql: "SELECT * FROM users LIMIT 10" },
			});
			const content = parseContent(res);
			expect(content).toHaveProperty("result");
			const result = content as { result: Record<string, unknown> };
			expect(result.result).toHaveProperty("columns");
			expect(result.result).toHaveProperty("rows");
			expect(result.result).toHaveProperty("rowCount");
			expect(result.result).toHaveProperty("durationMs");
			expect(Array.isArray(result.result.columns)).toBe(true);
			expect(Array.isArray(result.result.rows)).toBe(true);
			expect(typeof result.result.rowCount).toBe("number");
		});

		it("requires connectionId and sql", async () => {
			const res = await rpc("tools/call", {
				name: "opsmaxx_db_query",
				arguments: { sql: "SELECT 1" },
			});
			expect(res.error).toBeDefined();
			expect(res.error?.message).toContain("connectionId");
		});
	});

	describe("opsmaxx_ssh_session_open", () => {
		it("returns a sessionId for valid connection", async () => {
			const res = await rpc("tools/call", {
				name: "opsmaxx_ssh_session_open",
				arguments: { connectionId: "ssh-1" },
			});
			const content = parseContent(res);
			expect(content).toHaveProperty("session");
			const session = content as { session: Record<string, unknown> };
			expect(session.session).toHaveProperty("sessionId");
			expect(typeof session.session.sessionId).toBe("string");
			expect(session.session.sessionId as string).toMatch(/^s-/);
		});

		it("rejects unknown connectionId", async () => {
			const res = await rpc("tools/call", {
				name: "opsmaxx_ssh_session_open",
				arguments: { connectionId: "ssh-unknown" },
			});
			expect(res.error).toBeDefined();
			expect(res.error?.message).toContain("unknown connection");
		});
	});

	describe("opsmaxx_approval_status", () => {
		it("returns approved: false for unapproved capability", async () => {
			const res = await rpc("tools/call", {
				name: "opsmaxx_approval_status",
				arguments: { capability: "opsmaxx_ssh_exec", args: { cmd: "ls" } },
			});
			const content = parseContent(res);
			expect(content).toEqual({ approved: false });
		});
	});

	describe("opsmaxx_whoami", () => {
		it("returns bridge mode and service count", async () => {
			const res = await rpc("tools/call", { name: "opsmaxx_whoami", arguments: {} });
			const content = parseContent(res);
			expect(content).toHaveProperty("bridge");
			expect(["memory", "ipc"]).toContain((content as Record<string, unknown>).bridge);
			expect(content).toHaveProperty("services");
			expect(typeof (content as Record<string, unknown>).services).toBe("number");
		});
	});

	describe("error handling", () => {
		it("unknown tool returns METHOD_NOT_FOUND", async () => {
			const res = await rpc("tools/call", { name: "opsmaxx_nonexistent", arguments: {} });
			expect(res.error).toBeDefined();
			expect(res.error?.code).toBe(-32601);
			expect(res.error?.message).toContain("not found");
		});

		it("bridge error is mapped to BRIDGE_ERROR (-32000) without leaking internals", async () => {
			// SFTP read not implemented throws "not implemented"
			const res = await rpc("tools/call", {
				name: "opsmaxx_sftp_read",
				arguments: { connectionId: "ssh-1", path: "/etc/passwd" },
			});
			expect(res.error).toBeDefined();
			expect(res.error?.code).toBe(-32000);
			// Should not leak raw BridgeError message
			expect(res.error?.message).not.toContain("BridgeError");
		});

		it("malformed input returns INVALID_PARAMS", async () => {
			const res = await rpc("tools/call", {
				name: "opsmaxx_db_query",
				arguments: { sql: "SELECT 1" }, // missing connectionId
			});
			expect(res.error).toBeDefined();
			expect([-32602, -32000]).toContain(res.error?.code);
		});
	});
});
