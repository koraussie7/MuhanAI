import { EventEmitter } from "node:events";
import type { Readable, Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	__resetOmniRouteMcpClientForTests,
	getOmniRouteMcpClient,
	OmniRouteCallError,
	OmniRouteMcpClient,
	OmniRouteUnavailableError,
} from "./omniroute-mcp-client.js";

interface FakeStdio extends EventEmitter {
	stdin: Writable;
	stdout: Readable;
	stderr: Readable;
}

class FakeWritable extends EventEmitter {
	readonly writes: string[] = [];
	_write(chunk: string | Buffer, _enc: string, cb: () => void): void {
		this.writes.push(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
		cb();
	}
	write = (chunk: string | Buffer): boolean => {
		this._write(chunk as string, "utf8", () => {});
		return true;
	};
	end(): void {
		this.emit("finish");
	}
}

class FakeReadable extends EventEmitter {
	setEncoding(): this {
		return this;
	}
	push(chunk: string | Buffer): void {
		this.emit("data", typeof chunk === "string" ? chunk : chunk);
	}
	end(): void {
		this.emit("end");
	}
}

interface FakeSpawn {
	proc: FakeStdio;
	close: (code?: number | null) => void;
}

function makeFakeProc(): FakeSpawn {
	const proc = new EventEmitter() as FakeStdio;
	proc.stdin = new FakeWritable() as unknown as Writable;
	proc.stdout = new FakeReadable() as unknown as Readable;
	proc.stderr = new FakeReadable() as unknown as Readable;
	return {
		proc,
		close: (code: number | null = 0) => proc.emit("close", code),
	};
}

function parseWrittenLines(writes: string[]): Array<Record<string, unknown>> {
	return writes
		.join("")
		.split("\n")
		.filter((line) => line.length > 0)
		.map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe("OmniRouteMcpClient", () => {
	beforeEach(() => {
		__resetOmniRouteMcpClientForTests();
	});
	afterEach(() => {
		__resetOmniRouteMcpClientForTests();
	});

	function makeClient(
		overrides: Partial<ConstructorParameters<typeof OmniRouteMcpClient>[0]> = {},
	) {
		const spawned: FakeSpawn[] = [];
		const client = new OmniRouteMcpClient({
			timeoutMs: 2_000,
			spawnFn: (_cmd, _args) => {
				const fake = makeFakeProc();
				spawned.push(fake);
				return fake.proc as unknown as ReturnType<typeof import("node:child_process").spawn>;
			},
			...overrides,
		});
		return { client, spawned };
	}

	async function waitForSpawn(spawned: FakeSpawn[]): Promise<FakeSpawn> {
		await vi.waitFor(() => {
			if (spawned.length === 0) throw new Error("waiting for spawn");
		});
		const handle = spawned[0];
		if (!handle) throw new Error("spawned empty");
		return handle;
	}

	function findInitialize(writes: string[]) {
		return parseWrittenLines(writes).find((l) => l["method"] === "initialize");
	}

	function findToolsCall(writes: string[]) {
		return parseWrittenLines(writes).find((l) => l["method"] === "tools/call");
	}

	function respondInitialize(handle: FakeSpawn): void {
		const writes = (handle.proc.stdin as unknown as FakeWritable).writes;
		const initReq = findInitialize(writes);
		handle.proc.stdout.push(
			`${JSON.stringify({
				jsonrpc: "2.0",
				id: initReq?.["id"],
				result: { ok: true, protocolVersion: "2024-11-05" },
			})}\n`,
		);
	}

	async function waitForInitializeAndRespond(handle: FakeSpawn): Promise<void> {
		await vi.waitFor(() => {
			const writes = (handle.proc.stdin as unknown as FakeWritable).writes;
			if (!findInitialize(writes)) throw new Error("waiting for initialize");
		});
		respondInitialize(handle);
	}

	async function waitForToolsCallAndRespond(
		handle: FakeSpawn,
		resultContent: unknown,
	): Promise<Record<string, unknown> | undefined> {
		await vi.waitFor(() => {
			const writes = (handle.proc.stdin as unknown as FakeWritable).writes;
			if (!findToolsCall(writes)) throw new Error("waiting for tools/call");
		});
		const callReq = findToolsCall((handle.proc.stdin as unknown as FakeWritable).writes);
		handle.proc.stdout.push(
			`${JSON.stringify({
				jsonrpc: "2.0",
				id: callReq?.["id"],
				result: { content: [{ type: "text", text: JSON.stringify(resultContent) }] },
			})}\n`,
		);
		return callReq;
	}

	it("completion() round-trips through initialize + tools/call with route_request args", async () => {
		const { client, spawned } = makeClient();
		const callPromise = client.completion({
			model: "auto",
			messages: [{ role: "user", content: "summarize the news" }],
			combo: "best-quality",
		});
		const handle = await waitForSpawn(spawned);
		await waitForInitializeAndRespond(handle);
		const callReq = await waitForToolsCallAndRespond(handle, {
			response: { content: "summary text", model: "claude-opus-4" },
			tokens: { prompt: 12, completion: 30 },
			routing: {
				provider: "anthropic",
				combo: "best-quality",
				fallbacksTriggered: 1,
				cost: 0.002,
				latencyMs: 850,
				routingExplanation: "auto-routed via priority strategy",
			},
		});

		expect(callReq?.["params"]).toMatchObject({
			name: "omniroute_route_request",
			arguments: {
				model: "auto",
				combo: "best-quality",
				messages: [{ role: "user", content: "summarize the news" }],
			},
		});

		const result = await callPromise;
		expect(result.content).toBe("summary text");
		expect(result.model).toBe("claude-opus-4");
		expect(result.tokens.prompt).toBe(12);
		expect(result.tokens.completion).toBe(30);
		expect(result.routing.provider).toBe("anthropic");
		expect(result.routing.fallbacksTriggered).toBe(1);
		expect(result.routing.cost).toBeCloseTo(0.002);
		expect(result.routing.routingExplanation).toBe("auto-routed via priority strategy");

		await client.close();
	});

	it("listModels() parses catalog with snake_case + camelCase fields", async () => {
		const { client, spawned } = makeClient();
		const callPromise = client.listModels({ capability: "vision" });
		const handle = await waitForSpawn(spawned);
		await waitForInitializeAndRespond(handle);

		const callReq = await waitForToolsCallAndRespond(handle, {
			models: [
				{
					id: "claude-opus-4",
					provider: "anthropic",
					name: "Claude Opus 4",
					capability: "vision",
					context_window: 200_000,
					supports_tools: true,
					supports_vision: true,
					supports_json_mode: true,
					input_cost_per_1k: 0.015,
					output_cost_per_1k: 0.075,
				},
				{
					// no id field at all — must be filtered out
					provider: "unknown",
					name: "Ghost Model",
				},
			],
			providers: ["anthropic", "openai", "google"],
			capabilities: ["vision", "tools", "json"],
		});

		expect(callReq?.["params"]).toMatchObject({
			name: "omniroute_list_models_catalog",
			arguments: { capability: "vision" },
		});

		const result = await callPromise;
		expect(result.models).toHaveLength(1);
		expect(result.models[0]?.id).toBe("claude-opus-4");
		expect(result.models[0]?.contextWindow).toBe(200_000);
		expect(result.models[0]?.supportsVision).toBe(true);
		expect(result.models[0]?.inputCostPer1k).toBeCloseTo(0.015);
		expect(result.providers).toEqual(["anthropic", "openai", "google"]);
		expect(result.capabilities).toEqual(["vision", "tools", "json"]);

		await client.close();
	});

	it("checkQuota() accepts provider-scoped and unscoped queries", async () => {
		const { client, spawned } = makeClient();
		const callPromise = client.checkQuota({ provider: "groq" });
		const handle = await waitForSpawn(spawned);
		await waitForInitializeAndRespond(handle);

		const callReq = await waitForToolsCallAndRespond(handle, {
			provider: "groq",
			quotas: [
				{
					provider: "groq",
					used: 100,
					limit: 1000,
					remaining: 900,
					resetAt: "2026-09-10T00:00:00Z",
				},
			],
		});

		expect(callReq?.["params"]).toMatchObject({
			name: "omniroute_check_quota",
			arguments: { provider: "groq" },
		});

		const result = await callPromise;
		expect(result.provider).toBe("groq");
		expect(result.quotas).toHaveLength(1);
		expect(result.quotas[0]?.provider).toBe("groq");
		expect(result.quotas[0]?.remaining).toBe(900);

		await client.close();
	});

	it("webSearch() returns results with provider + query echo", async () => {
		const { client, spawned } = makeClient();
		const callPromise = client.webSearch("agent mesh p2p", { maxResults: 3 });
		const handle = await waitForSpawn(spawned);
		await waitForInitializeAndRespond(handle);

		const callReq = await waitForToolsCallAndRespond(handle, {
			provider: "tavily",
			results: [
				{
					title: "AgentMesh Whitepaper",
					url: "https://example.com/agentmesh",
					snippet: "P2P agent networks",
					position: 1,
					publishedAt: "2026-08-01",
				},
			],
		});

		expect(callReq?.["params"]).toMatchObject({
			name: "omniroute_web_search",
			arguments: { query: "agent mesh p2p", max_results: 3 },
		});

		const result = await callPromise;
		expect(result.provider).toBe("tavily");
		expect(result.query).toBe("agent mesh p2p");
		expect(result.results).toHaveLength(1);
		expect(result.results[0]?.url).toBe("https://example.com/agentmesh");
		expect(result.results[0]?.position).toBe(1);

		await client.close();
	});

	it("webFetch() decodes markdown + links + image content blocks", async () => {
		const { client, spawned } = makeClient();
		const callPromise = client.webFetch("https://example.com", { format: "markdown" });
		const handle = await waitForSpawn(spawned);
		await waitForInitializeAndRespond(handle);

		await vi.waitFor(() => {
			const writes = (handle.proc.stdin as unknown as FakeWritable).writes;
			if (!findToolsCall(writes)) throw new Error("waiting for tools/call");
		});
		const callReq = findToolsCall((handle.proc.stdin as unknown as FakeWritable).writes);
		const pngB64 = Buffer.from("FAKE_PNG_BYTES").toString("base64");
		const payload = {
			url: "https://example.com",
			final_url: "https://example.com/?ref=1",
			markdown: "# Example",
			links: [{ text: "Docs", url: "https://example.com/docs" }],
		};
		handle.proc.stdout.push(
			`${JSON.stringify({
				jsonrpc: "2.0",
				id: callReq?.["id"],
				result: {
					content: [
						{ type: "text", text: JSON.stringify(payload) },
						{ type: "image", data: pngB64 },
					],
				},
			})}\n`,
		);

		const result = await callPromise;
		expect(result.url).toBe("https://example.com");
		expect(result.finalUrl).toBe("https://example.com/?ref=1");
		expect(result.markdown).toBe("# Example");
		expect(result.links).toEqual([{ text: "Docs", url: "https://example.com/docs" }]);
		expect(result.screenshot?.mimeType).toBe("image/png");
		expect(Buffer.from(result.screenshot?.bytes ?? new Uint8Array()).toString("utf8")).toBe(
			"FAKE_PNG_BYTES",
		);

		await client.close();
	});

	it("getHealth() returns uptime + version + degraded sources", async () => {
		const { client, spawned } = makeClient();
		const callPromise = client.getHealth();
		const handle = await waitForSpawn(spawned);
		await waitForInitializeAndRespond(handle);

		await waitForToolsCallAndRespond(handle, {
			uptime: 12345,
			version: "3.8.51",
			memoryUsage: { heapUsed: 100 * 1024 * 1024, heapTotal: 512 * 1024 * 1024 },
			cacheStats: { hits: 80, misses: 20, hitRate: 0.8 },
			degraded: [{ source: "rateLimits", error: "timeout" }],
		});

		const result = await callPromise;
		expect(result.uptime).toBe("12345");
		expect(result.version).toBe("3.8.51");
		expect(result.memoryUsage?.heapUsed).toBe(100 * 1024 * 1024);
		expect(result.cacheStats?.hitRate).toBeCloseTo(0.8);
		expect(result.degraded).toEqual([{ source: "rateLimits", error: "timeout" }]);

		await client.close();
	});

	it("throws OmniRouteUnavailableError when spawnFn throws", async () => {
		const client = new OmniRouteMcpClient({
			spawnFn: () => {
				throw new Error("ENOENT");
			},
		});
		await expect(
			client.completion({ model: "auto", messages: [{ role: "user", content: "x" }] }),
		).rejects.toBeInstanceOf(OmniRouteUnavailableError);
	});

	it("rejects pending requests when subprocess closes mid-flight", async () => {
		const { client, spawned } = makeClient();
		const callPromise = client.listModels();
		const handle = await waitForSpawn(spawned);

		// Let the client finish its initialize handshake before closing.
		await new Promise<void>((r) => setTimeout(r, 50));
		handle.close(1);

		await expect(callPromise).rejects.toBeInstanceOf(OmniRouteUnavailableError);
	});

	it("close() rejects pending requests with OmniRouteCallError", async () => {
		const { client, spawned } = makeClient();
		const callPromise = client.checkQuota();
		const handle = await waitForSpawn(spawned);

		// Let the initialize handshake complete so the quota call is in flight.
		await waitForInitializeAndRespond(handle);

		await client.close();

		await expect(callPromise).rejects.toBeInstanceOf(OmniRouteCallError);
	});

	it("getOmniRouteMcpClient returns a singleton", () => {
		const a = getOmniRouteMcpClient();
		const b = getOmniRouteMcpClient();
		expect(a).toBe(b);
	});

	it("ignores non-JSON stdout lines", async () => {
		const { client, spawned } = makeClient();
		const callPromise = client.getHealth();
		const handle = await waitForSpawn(spawned);

		// Push the noise line BEFORE we wait, but AFTER spawn so it lands on a listener.
		handle.proc.stdout.push("[progress] warming cache\n");

		await waitForInitializeAndRespond(handle);
		await waitForToolsCallAndRespond(handle, {
			uptime: "0",
			version: "test",
		});

		const result = await callPromise;
		expect(result.version).toBe("test");

		await client.close();
	});

	it("uses OMNIROUTE_COMMAND env var when no command override is given", () => {
		const previous = process.env.OMNIROUTE_COMMAND;
		process.env.OMNIROUTE_COMMAND = "/custom/path/omniroute-mcp-server";
		try {
			const client = new OmniRouteMcpClient();
			const cmd = (client as unknown as { command: string }).command;
			expect(cmd).toBe("/custom/path/omniroute-mcp-server");
		} finally {
			if (previous === undefined) delete process.env.OMNIROUTE_COMMAND;
			else process.env.OMNIROUTE_COMMAND = previous;
		}
	});
});
