import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { Readable, Writable } from "node:stream";
import {
	FolkloreCallError,
	FolkloreMcpClient,
	FolkloreUnavailableError,
	getFolkloreMcpClient,
	__resetFolkloreMcpClientForTests,
} from "./folklore-mcp-client.js";

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

describe("FolkloreMcpClient", () => {
	beforeEach(() => {
		__resetFolkloreMcpClientForTests();
	});
	afterEach(() => {
		__resetFolkloreMcpClientForTests();
	});

	function makeClient(overrides: Partial<ConstructorParameters<typeof FolkloreMcpClient>[0]> = {}) {
		const spawned: FakeSpawn[] = [];
		const client = new FolkloreMcpClient({
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

	function findToolCall(writes: string[], toolName?: string) {
		return parseWrittenLines(writes).find((l) => {
			if (l["method"] !== "tools/call") return false;
			if (!toolName) return true;
			const params = l["params"] as { name?: string };
			return params?.name === toolName;
		});
	}

	async function respondInitialize(handle: FakeSpawn): Promise<void> {
		await vi.waitFor(() => {
			const writes = (handle.proc.stdin as unknown as FakeWritable).writes;
			if (!findInitialize(writes)) throw new Error("waiting for initialize");
		});
		const initReq = findInitialize((handle.proc.stdin as unknown as FakeWritable).writes);
		handle.proc.stdout.push(
			`${JSON.stringify({
				jsonrpc: "2.0",
				id: initReq?.["id"],
				result: { ok: true, protocolVersion: "2024-11-05", serverInfo: { name: "folklore", version: "0.0.1" } },
			})}\n`,
		);
	}

	async function respondTool(handle: FakeSpawn, toolName: string, text: string): Promise<void> {
		await vi.waitFor(() => {
			const writes = (handle.proc.stdin as unknown as FakeWritable).writes;
			if (!findToolCall(writes, toolName)) throw new Error(`waiting for tools/call ${toolName}`);
		});
		const callReq = findToolCall((handle.proc.stdin as unknown as FakeWritable).writes, toolName);
		handle.proc.stdout.push(
			`${JSON.stringify({
				jsonrpc: "2.0",
				id: callReq?.["id"],
				result: { content: [{ type: "text", text }] },
			})}\n`,
		);
	}

	it("search() round-trips through initialize + tools/call parse", async () => {
		const { client, spawned } = makeClient({
			command: "node",
			args: ["launcher.mjs", "mcp", "start"],
		});
		const callPromise = client.search("what is folklre cognitive bindings");

		const handle = await waitForSpawn(spawned);
		expect(handle.proc.stdin).toBeTruthy();
		await respondInitialize(handle);
		await respondTool(
			handle,
			"search",
			JSON.stringify([
				{
					id: "abc-123",
					content: "Cognitive bindings are retrieved thoughts.",
					score: 0.88,
					type: "answer",
					source_uri: "https://example.com/fsrs",
				},
			]),
		);

		const results = await callPromise;
		expect(results).toHaveLength(1);
		expect(results[0]?.id).toBe("abc-123");
		expect(results[0]?.score).toBeCloseTo(0.88);
		expect(results[0]?.type).toBe("answer");
		expect(results[0]?.source_uri).toBe("https://example.com/fsrs");

		await client.close();
	});

	it("ask() extracts context + satisfaction from JSON text block", async () => {
		const { client, spawned } = makeClient();
		const callPromise = client.ask("how does fsrs retrieval work?");

		const handle = await waitForSpawn(spawned);
		await respondInitialize(handle);
		await respondTool(
			handle,
			"ask",
			JSON.stringify({
				context: "FSRS is a spaced-repetition scheduling algorithm.",
				satisfaction: 0.92,
				hits: [{ id: "n1", score: 0.92, content: "FSRS" }],
			}),
		);

		const result = await callPromise;
		expect(result.context).toContain("FSRS");
		expect(result.satisfaction).toBeCloseTo(0.92);
		expect(result.hits).toHaveLength(1);

		await client.close();
	});

	it("recall() returns hits + reused flag", async () => {
		const { client, spawned } = makeClient();
		const callPromise = client.recall("debug sqlx offline prep");

		const handle = await waitForSpawn(spawned);
		await respondInitialize(handle);
		await respondTool(
			handle,
			"recall",
			JSON.stringify({ hits: [{ id: "r1", content: "sqlx offline", score: 0.9 }], reused: true }),
		);

		const result = await callPromise;
		expect(result.reused).toBe(true);
		expect(result.hits[0]?.id).toBe("r1");

		await client.close();
	});

	it("federated_search() delegates to the federated_search tool", async () => {
		const { client, spawned } = makeClient();
		const callPromise = client.federatedSearch("tokio rc across await", { k: 3 });

		const handle = await waitForSpawn(spawned);
		await respondInitialize(handle);
		await respondTool(
			handle,
			"federated_search",
			JSON.stringify([{ id: "f1", content: "tokio-rc", score: 0.71 }]),
		);

		const results = await callPromise;
		expect(results[0]?.id).toBe("f1");

		await client.close();
	});

	it("getNode() returns null when node is missing", async () => {
		const { client, spawned } = makeClient();
		const callPromise = client.getNode("missing-id");

		const handle = await waitForSpawn(spawned);
		await respondInitialize(handle);
		await respondTool(handle, "get_node", JSON.stringify({}));

		const result = await callPromise;
		expect(result).toBeNull();

		await client.close();
	});

	it("graphStats() parses nodes + byType", async () => {
		const { client, spawned } = makeClient();
		const callPromise = client.graphStats();

		const handle = await waitForSpawn(spawned);
		await respondInitialize(handle);
		await respondTool(
			handle,
			"graph_stats",
			JSON.stringify({ nodes: 42, edges: 17, byType: { answer: 20, question: 22 } }),
		);

		const result = await callPromise;
		expect(result.nodes).toBe(42);
		expect(result.edges).toBe(17);
		expect(result.byType?.["answer"]).toBe(20);

		await client.close();
	});

	it("throws FolkloreUnavailableError when spawn throws ENOENT", async () => {
		const { client } = makeClient({
			spawnFn: () => {
				throw Object.assign(new Error("spawn folklore ENOENT"), { code: "ENOENT" });
			},
		});

		await expect(client.search("anything")).rejects.toBeInstanceOf(FolkloreUnavailableError);
		await expect(client.search("anything")).rejects.toMatchObject({
			name: "FolkloreUnavailableError",
		});
	});

	it("wraps a tools/call error in FolkloreCallError", async () => {
		const { client, spawned } = makeClient();
		const callPromise = client.search("anything");

		const handle = await waitForSpawn(spawned);
		await respondInitialize(handle);

		await vi.waitFor(() => {
			const writes = (handle.proc.stdin as unknown as FakeWritable).writes;
			if (!findToolCall(writes, "search")) throw new Error("waiting for tools/call search");
		});
		const callReq = findToolCall((handle.proc.stdin as unknown as FakeWritable).writes, "search");
		handle.proc.stdout.push(
			`${JSON.stringify({
				jsonrpc: "2.0",
				id: callReq?.["id"],
				error: { code: -32000, message: "graph not initialized" },
			})}\n`,
		);

		await expect(callPromise).rejects.toBeInstanceOf(FolkloreCallError);
		await expect(callPromise).rejects.toMatchObject({ toolName: "search" });

		await client.close();
	});

	it("close() rejects in-flight calls with FolkloreUnavailableError", async () => {
		const { client, spawned } = makeClient();
		const callPromise = client.search("stalled");
		const handle = await waitForSpawn(spawned);

		await client.close();
		handle.close(0);

		await expect(callPromise).rejects.toBeInstanceOf(FolkloreUnavailableError);
	});

	it("getFolkloreMcpClient() returns a shared singleton", () => {
		const a = getFolkloreMcpClient();
		const b = getFolkloreMcpClient();
		expect(a).toBe(b);
		__resetFolkloreMcpClientForTests();
		const c = getFolkloreMcpClient();
		expect(c).not.toBe(a);
	});
});