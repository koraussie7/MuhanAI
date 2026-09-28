/**
 * Tests for the T3-B OpsMaxx MCP write surface.
 *
 * Uses the in-memory bridge from `@agentmesh/opsmaxx-bridge` and a
 * standalone Fastify instance so each test owns a fresh approval cache.
 * Covers the 8 cases required by
 * docs/agentmesh/T3-OPSMAXX-MCP-AGENT-B.md plus the two risk cases
 * (approval-cache poisoning, unknown sessionId → 4003).
 */

import { BridgeError, createInMemoryBridge, type Result } from "@agentmesh/opsmaxx-bridge";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	clearBridgeCalls,
	getRecentBridgeCalls,
	setBridgeCallSink,
} from "./audit/bridge-call-log.js";
import {
	OPSMAXX_WRITE_TOOL_NAMES,
	opsmaxxWritesRoutes,
	RESULT_CAPABILITY_UNAVAILABLE,
	RESULT_DENIED,
	RESULT_DOUBLE_CONFIRM_MISMATCH,
	RESULT_INVALID_ARGS,
} from "./opsmaxx-mcp-writes.js";

// Silence the default pino sink so test output stays readable.
setBridgeCallSink(() => {});

type MockBridge = ReturnType<typeof createInMemoryBridge>;

let app: FastifyInstance;
let bridge: MockBridge;

beforeEach(async () => {
	clearBridgeCalls();
	bridge = createInMemoryBridge();
	app = Fastify();
	await app.register(opsmaxxWritesRoutes, { bridge });
	await app.ready();
});

afterEach(async () => {
	await app.close();
});

async function callTool(name: string, args: Record<string, unknown>, id = 1) {
	return app.inject({
		method: "POST",
		url: "/api/opsmaxx-mcp/writes",
		payload: { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } },
	});
}

function contentJson(res: { json: () => unknown }) {
	const body = res.json() as { result: { content: { text: string }[] } };
	return JSON.parse(body.result.content[0]?.text ?? "{}");
}

async function seedSession(): Promise<string> {
	bridge.__seedSsh({
		id: "c1",
		label: "web-1",
		host: "web.example.com",
		port: 22,
		username: "deploy",
		authRef: "keyring:1",
	});
	const opened = await bridge.ssh.open("c1");
	if (!opened.ok) throw new Error("failed to seed ssh session");
	return opened.value.sessionId;
}

describe("POST /api/opsmaxx-mcp/writes — surface", () => {
	it("tools/list returns exactly the 7 write tools (no T3-A read tools)", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/api/opsmaxx-mcp/writes",
			payload: { jsonrpc: "2.0", id: 1, method: "tools/list" },
		});
		expect(res.statusCode).toBe(200);
		const names = (res.json().result.tools as Array<{ name: string }>).map((t) => t.name);
		expect([...names].sort()).toEqual([...OPSMAXX_WRITE_TOOL_NAMES].sort());
		expect(names).toHaveLength(7);
		for (const readTool of ["opsmaxx_ssh_list", "opsmaxx_db_query", "opsmaxx_whoami"]) {
			expect(names).not.toContain(readTool);
		}
	});

	it("rejects a read-side / unknown tool with 404 + -32601 and logs nothing", async () => {
		const res = await callTool("opsmaxx_ssh_list", {});
		expect(res.statusCode).toBe(404);
		expect(res.json().error.code).toBe(-32601);
		expect(await getRecentBridgeCalls({})).toHaveLength(0);
	});
});

describe("opsmaxx_ssh_exec (needs-approval)", () => {
	it("is denied by default with 4001 and audits one denied event", async () => {
		const sessionId = await seedSession();
		const res = await callTool("opsmaxx_ssh_exec", {
			sessionId,
			cmd: "systemctl restart nginx",
			summary: "Restart nginx after deploy",
		});
		expect(res.statusCode).toBe(200);
		expect(res.json().error.code).toBe(RESULT_DENIED);

		const events = await getRecentBridgeCalls({});
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			capability: "opsmaxx_ssh_exec",
			verdict: "denied",
			errorCode: RESULT_DENIED,
			risk: "needs-approval",
		});
		expect(events[0]?.argsHash).toMatch(/^[0-9a-f]{64}$/);
	});

	it("proceeds after __approve and audits exactly one ok event", async () => {
		const sessionId = await seedSession();
		const args = { sessionId, cmd: "uptime", summary: "Check load after deploy" };
		bridge.__approve("opsmaxx_ssh_exec", args);

		const res = await callTool("opsmaxx_ssh_exec", args);
		const parsed = contentJson(res);
		expect(parsed.exitCode).toBe(0);

		const events = await getRecentBridgeCalls({});
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({ capability: "opsmaxx_ssh_exec", verdict: "ok" });
	});

	it("refuses to reuse an approval for different args (cache poisoning)", async () => {
		const sessionId = await seedSession();
		bridge.__approve("opsmaxx_ssh_exec", { sessionId, cmd: "ls", summary: "List files" });
		const res = await callTool("opsmaxx_ssh_exec", {
			sessionId,
			cmd: "rm -rf /",
			summary: "List files",
		});
		expect(res.json().error.code).toBe(RESULT_DENIED);
		expect((await getRecentBridgeCalls({}))[0]).toMatchObject({
			verdict: "denied",
			errorCode: RESULT_DENIED,
		});
	});

	it("denies an unknown sessionId with 4003 after approval and audits it", async () => {
		const args = { sessionId: "s-nope", cmd: "id", summary: "Check identity" };
		bridge.__approve("opsmaxx_ssh_exec", args);

		const res = await callTool("opsmaxx_ssh_exec", args);
		expect(res.json().error.code).toBe(RESULT_INVALID_ARGS);
		expect(res.json().error.message).toContain("unknown session");
		expect((await getRecentBridgeCalls({}))[0]).toMatchObject({
			verdict: "denied",
			errorCode: RESULT_INVALID_ARGS,
		});
	});

	it("requires a non-empty summary when the approval card is needed", async () => {
		const sessionId = await seedSession();
		const res = await callTool("opsmaxx_ssh_exec", { sessionId, cmd: "ls" });
		expect(res.json().error.code).toBe(RESULT_INVALID_ARGS);
		expect((await getRecentBridgeCalls({}))[0]).toMatchObject({ verdict: "denied" });
	});
});

describe("opsmaxx_db_write (high-risk-needs-double-approval)", () => {
	it("requires typed confirm; mismatched confirm returns 4002", async () => {
		const res = await callTool("opsmaxx_db_write", {
			connectionId: "db1",
			sql: "DELETE FROM sessions WHERE expired = true",
			typedConfirm: "db1-typo",
			summary: "Clean expired sessions",
		});
		expect(res.json().error.code).toBe(RESULT_DOUBLE_CONFIRM_MISMATCH);
		const events = await getRecentBridgeCalls({});
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			verdict: "denied",
			errorCode: RESULT_DOUBLE_CONFIRM_MISMATCH,
			risk: "high-risk-needs-double-approval",
		});
	});

	it("matched confirm + approval calls bridge.databases.write and forwards affectedRows", async () => {
		bridge.databases.write = async (): Promise<Result<{ affectedRows: number }, BridgeError>> => ({
			ok: true,
			value: { affectedRows: 7 },
		});
		const args = {
			connectionId: "db1",
			sql: "UPDATE users SET plan = 'pro'",
			params: ["alice"],
			typedConfirm: "db1",
			summary: "Upgrade alice to pro",
		};
		bridge.__approve("opsmaxx_db_write", args);

		const res = await callTool("opsmaxx_db_write", args);
		expect(contentJson(res)).toEqual({ affectedRows: 7 });
		expect((await getRecentBridgeCalls({}))[0]).toMatchObject({ verdict: "ok" });
	});
});

describe("opsmaxx_vault_set (high-risk-needs-double-approval)", () => {
	it("mirrors to OpsMaxx; a bridge error does not surface its raw message to the model", async () => {
		bridge.vault.set = async (): Promise<Result<void, BridgeError>> => ({
			ok: false,
			error: new BridgeError("internal", "electron safeStorage detail: hunter2"),
		});
		const args = {
			service: "openai",
			secret: "sk-test-123",
			typedConfirm: "openai",
			summary: "Rotate the OpenAI key",
		};
		bridge.__approve("opsmaxx_vault_set", args);

		const res = await callTool("opsmaxx_vault_set", args);
		const body = res.json();
		expect(body.error.code).toBe(-32603);
		expect(body.error.message).toContain("failed at the bridge");
		expect(body.error.message).not.toContain("hunter2");
		expect(body.error.message).not.toContain("safeStorage");

		const events = await getRecentBridgeCalls({});
		expect(events[0]).toMatchObject({ verdict: "error", errorCode: "internal" });
		// argsHash only — the raw secret must never reach the audit log.
		expect(JSON.stringify(events)).not.toContain("sk-test-123");
	});

	it("stores the secret after card + typed confirm", async () => {
		const args = {
			service: "anthropic",
			secret: "sk-ant-42",
			note: "primary key",
			typedConfirm: "anthropic",
			summary: "Store the Anthropic key",
		};
		bridge.__approve("opsmaxx_vault_set", args);

		const res = await callTool("opsmaxx_vault_set", args);
		expect(res.json().error).toBeUndefined();
		const entry = await bridge.vault.get("anthropic");
		expect(entry.ok && entry.value?.hasSecret).toBe(true);
		expect((await getRecentBridgeCalls({}))[0]).toMatchObject({ verdict: "ok" });
	});
});

describe("opsmaxx_approval_request (safe — mutates the approval cache)", () => {
	it("returns { approved: false } by default and audits the refusal", async () => {
		const res = await callTool("opsmaxx_approval_request", {
			capability: "opsmaxx_vault_set",
			summary: "Store the OpenAI key for the agent",
			args: { service: "openai", secret: "sk-x", typedConfirm: "openai", summary: "store" },
		});
		expect(contentJson(res)).toEqual({ approved: false });
		expect((await getRecentBridgeCalls({}))[0]).toMatchObject({
			capability: "opsmaxx_approval_request",
			verdict: "denied",
			risk: "safe",
		});
	});

	it("returns { approved: true } and unlocks exactly that pair, surviving a bridge cache reset", async () => {
		const targetArgs = {
			service: "openai",
			secret: "sk-live-99",
			typedConfirm: "openai",
			summary: "Store the OpenAI key for the agent",
		};
		// The human clicks "Approve" on the card OpsMaxx shows for
		// exactly this (capability, args) pair:
		bridge.__approve("opsmaxx_vault_set", targetArgs);

		const res = await callTool("opsmaxx_approval_request", {
			capability: "opsmaxx_vault_set",
			summary: targetArgs.summary,
			args: targetArgs,
		});
		expect(contentJson(res)).toEqual({ approved: true });

		// Drop the bridge-side cache — the handler-side approval must be
		// what keeps the gate open (this is the "mutates the cache" bit).
		bridge.__reset();

		const followUp = await callTool("opsmaxx_vault_set", targetArgs);
		expect(followUp.json().error).toBeUndefined();
		const entry = await bridge.vault.get("openai");
		expect(entry.ok && entry.value?.hasSecret).toBe(true);

		const events = await getRecentBridgeCalls({});
		expect(events[0]).toMatchObject({ capability: "opsmaxx_vault_set", verdict: "ok" });
		expect(events[1]).toMatchObject({ capability: "opsmaxx_approval_request", verdict: "ok" });
	});
});

describe("Phase 2 placeholder and audit invariants", () => {
	it("gates sftp_write and then returns 4004 (bridge call ships in T1 Phase 2)", async () => {
		const args = {
			connectionId: "f1",
			remotePath: "/etc/app.conf",
			content: "timeout=30",
			summary: "Update app timeout",
		};
		bridge.__approve("opsmaxx_sftp_write", args);

		const res = await callTool("opsmaxx_sftp_write", args);
		expect(res.json().error.code).toBe(RESULT_CAPABILITY_UNAVAILABLE);
		const events = await getRecentBridgeCalls({});
		expect(events[0]).toMatchObject({ verdict: "error", errorCode: RESULT_CAPABILITY_UNAVAILABLE });
	});

	it("emits exactly one event per attempt across denial, refusal, and success", async () => {
		const sessionId = await seedSession();
		// 1) denied (no approval), 2) 4002 (typed confirm mismatch), 3) ok.
		await callTool("opsmaxx_ssh_exec", { sessionId, cmd: "ls", summary: "list" });
		await callTool("opsmaxx_db_write", {
			connectionId: "db1",
			sql: "SELECT 1",
			typedConfirm: "wrong",
			summary: "probe",
		});
		const approved = { sessionId, cmd: "ls", summary: "list" };
		bridge.__approve("opsmaxx_ssh_exec", approved);
		await callTool("opsmaxx_ssh_exec", approved);

		const events = await getRecentBridgeCalls({});
		expect(events).toHaveLength(3);
		expect(events.map((e) => e.verdict).sort()).toEqual(["denied", "denied", "ok"]);
	});
});
