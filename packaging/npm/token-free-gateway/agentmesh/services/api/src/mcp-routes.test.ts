/**
 * Tests for the MCP JSON-RPC routes mounted at /api/mcp.
 *
 * Covers the surface the cosmic prompt bar calls
 * (apps/web/src/components/find/CosmicPromptBar.tsx → /api/mcp/rpc →
 * muhanai_ask_quorum) and the manifest/config discovery endpoints consumed by
 * external MCP clients (Claude Desktop, Cline, Cursor).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./server.js";

let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
	app = await buildApp({ enableTransport: false });
	await app.ready();
});

afterAll(async () => {
	await app.close();
});

describe("GET /api/mcp/manifest.json", () => {
	it("returns the MCP server declaration", async () => {
		const res = await app.inject({ method: "GET", url: "/api/mcp/manifest.json" });
		expect(res.statusCode).toBe(200);
		const body = res.json();
		expect(body.schema_version).toBe("v1");
		expect(body.name_for_model).toBe("muhanai_agentmesh");
		expect(body.transport.rpc_endpoint).toBe("/api/mcp/rpc");
		expect(Array.isArray(body.tools)).toBe(true);
		expect(Array.isArray(body.prompts)).toBe(true);
	});

	it("lists the four canonical MuhanAI tools", async () => {
		const res = await app.inject({ method: "GET", url: "/api/mcp/manifest.json" });
		const names = (res.json().tools as Array<{ name: string }>).map((t) => t.name);
		expect(names).toContain("muhanai_ask_quorum");
		expect(names).toContain("muhanai_search_knowledge");
		expect(names).toContain("muhanai_publish_note");
		expect(names).toContain("muhanai_get_pulse");
	});
});

describe("GET /.well-known/mcp.json", () => {
	it("exposes the discovery alias with tool names only", async () => {
		const res = await app.inject({ method: "GET", url: "/.well-known/mcp.json" });
		expect(res.statusCode).toBe(200);
		const body = res.json();
		expect(body.rpc_endpoint).toBe("/api/mcp/rpc");
		expect(body.tools).toContain("muhanai_ask_quorum");
		expect(body.prompts).toContain("human_ai_symbiosis");
	});
});

describe("GET /api/mcp/config", () => {
	it("returns configurations for claude desktop, cline, cursor", async () => {
		const res = await app.inject({ method: "GET", url: "/api/mcp/config" });
		expect(res.statusCode).toBe(200);
		const body = res.json();
		expect(body.claudeDesktop.mcpServers.muhanai.command).toBe("npx");
		expect(body.cline.mcpServers["muhanai-mesh"].url).toMatch(/\/api\/mcp\/rpc$/);
		expect(body.cursor.type).toBe("sse");
		expect(body.curlExample).toContain("/api/mcp/rpc");
	});
});

describe("POST /api/mcp/rpc", () => {
	it("tools/list returns the manifest", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/api/mcp/rpc",
			payload: { jsonrpc: "2.0", id: 1, method: "tools/list" },
		});
		expect(res.statusCode).toBe(200);
		const body = res.json();
		expect(body.jsonrpc).toBe("2.0");
		expect(body.id).toBe(1);
		expect(body.result.tools.length).toBeGreaterThan(0);
	});

	it("tools/call muhanai_ask_quorum echoes the question in the consensus summary", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/api/mcp/rpc",
			payload: {
				jsonrpc: "2.0",
				id: 7,
				method: "tools/call",
				params: { name: "muhanai_ask_quorum", arguments: { question: "What is CRDT?" } },
			},
		});
		expect(res.statusCode).toBe(200);
		const body = res.json();
		expect(body.id).toBe(7);
		expect(body.result.content[0].type).toBe("text");
		expect(body.result.content[0].text).toContain("CRDT?");
		expect(body.result.content[0].text).toMatch(/Quorum Consensus/i);
	});

	it("tools/call muhanai_search_knowledge returns ranked matches", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/api/mcp/rpc",
			payload: {
				jsonrpc: "2.0",
				id: 2,
				method: "tools/call",
				params: { name: "muhanai_search_knowledge", arguments: { query: "CRDT" } },
			},
		});
		const body = res.json();
		expect(body.id).toBe(2);
		const parsed = JSON.parse(body.result.content[0].text);
		expect(parsed.query).toBe("CRDT");
		expect(parsed.matches.length).toBeGreaterThan(0);
		expect(parsed.matches[0].relevance).toBeGreaterThan(0.9);
	});

	it("tools/call muhanai_get_pulse returns mesh telemetry", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/api/mcp/rpc",
			payload: {
				jsonrpc: "2.0",
				id: 3,
				method: "tools/call",
				params: { name: "muhanai_get_pulse", arguments: {} },
			},
		});
		const body = res.json();
		const parsed = JSON.parse(body.result.content[0].text);
		expect(parsed.status).toBe("operational");
		expect(parsed.peers).toBeGreaterThan(0);
		expect(Array.isArray(parsed.activeModels)).toBe(true);
	});

	it("tools/call muhanai_publish_note returns a node id with the title", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/api/mcp/rpc",
			payload: {
				jsonrpc: "2.0",
				id: 4,
				method: "tools/call",
				params: {
					name: "muhanai_publish_note",
					arguments: { title: "Hello", content: "body" },
				},
			},
		});
		const body = res.json();
		expect(body.result.content[0].text).toContain("[[Hello.md]]");
		expect(body.result.content[0].text).toMatch(/note-\d+/);
	});

	it("tools/call with unknown tool returns 404 + JSON-RPC error", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/api/mcp/rpc",
			payload: {
				jsonrpc: "2.0",
				id: 5,
				method: "tools/call",
				params: { name: "muhanai_does_not_exist", arguments: {} },
			},
		});
		expect(res.statusCode).toBe(404);
		const body = res.json();
		expect(body.error.code).toBe(-32601);
		expect(body.error.message).toContain("not found");
	});

	it("unknown method returns 400 + JSON-RPC error", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/api/mcp/rpc",
			payload: { jsonrpc: "2.0", id: 6, method: "foo/bar" },
		});
		expect(res.statusCode).toBe(400);
		const body = res.json();
		expect(body.error.code).toBe(-32601);
	});

	it("prompts/get builds a Korean prompt by default", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/api/mcp/rpc",
			payload: {
				jsonrpc: "2.0",
				id: 8,
				method: "prompts/get",
				params: { name: "human_ai_symbiosis", arguments: { topic: "topic A" } },
			},
		});
		const body = res.json();
		expect(body.id).toBe(8);
		expect(body.result.messages[0].content.text).toContain("사람과 AI의 공존");
		expect(body.result.messages[0].content.text).toContain("주제: topic A");
	});

	it("prompts/get honors accept-language for English", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/api/mcp/rpc",
			headers: { "accept-language": "en-US,en;q=0.9" },
			payload: {
				jsonrpc: "2.0",
				id: 9,
				method: "prompts/get",
				params: { name: "human_ai_symbiosis", arguments: { topic: "topic B" } },
			},
		});
		const body = res.json();
		expect(body.result.messages[0].content.text).toContain("Human-AI Symbiosis");
	});

	it("prompts/get falls back to Korean for unknown language", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/api/mcp/rpc",
			payload: {
				jsonrpc: "2.0",
				id: 10,
				method: "prompts/get",
				params: {
					name: "human_ai_symbiosis",
					arguments: { topic: "x", language: "zz" },
				},
			},
		});
		const body = res.json();
		expect(body.result.messages[0].content.text).toContain("사람과 AI의 공존");
	});

	it("preserves the rpc id when supplied as a string", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/api/mcp/rpc",
			payload: { jsonrpc: "2.0", id: "abc-123", method: "tools/list" },
		});
		const body = res.json();
		expect(body.id).toBe("abc-123");
	});
});
