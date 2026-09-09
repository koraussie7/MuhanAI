import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { Readable, Writable } from "node:stream";
import {
	getHoundMcpClient,
	HoundCallError,
	HoundMcpClient,
	HoundUnavailableError,
	__resetHoundMcpClientForTests,
} from "./hound-mcp-client.js";

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

describe("HoundMcpClient", () => {
	beforeEach(() => {
		__resetHoundMcpClientForTests();
	});
	afterEach(() => {
		__resetHoundMcpClientForTests();
	});

	function makeClient(overrides: Partial<ConstructorParameters<typeof HoundMcpClient>[0]> = {}) {
		const spawned: FakeSpawn[] = [];
		const client = new HoundMcpClient({
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

	it("search() round-trips through initialize + tools/call", async () => {
		const { client, spawned } = makeClient();
		const callPromise = client.search("best pizza seoul");

		// Wait for spawn → install handlers BEFORE pushing any responses.
		const handle = await waitForSpawn(spawned);

		// Wait for initialize to land on stdin, then respond.
		await vi.waitFor(() => {
			const writes = (handle.proc.stdin as unknown as FakeWritable).writes;
			if (!findInitialize(writes)) throw new Error("waiting for initialize");
		});
		const initReq = findInitialize((handle.proc.stdin as unknown as FakeWritable).writes);
		handle.proc.stdout.push(
			`${JSON.stringify({
				jsonrpc: "2.0",
				id: initReq?.["id"],
				result: { ok: true, protocolVersion: "2024-11-05" },
			})}\n`,
		);

		// Wait for tools/call, respond with a search result.
		await vi.waitFor(() => {
			const writes = (handle.proc.stdin as unknown as FakeWritable).writes;
			if (!findToolsCall(writes)) throw new Error("waiting for tools/call");
		});
		const callReq = findToolsCall((handle.proc.stdin as unknown as FakeWritable).writes);
		handle.proc.stdout.push(
			`${JSON.stringify({
				jsonrpc: "2.0",
				id: callReq?.["id"],
				result: {
					content: [
						{
							type: "text",
							text: JSON.stringify([
								{
									title: "Best Pizza in Seoul",
									url: "https://example.com/pizza",
									snippet: "Top picks",
									engines: ["duckduckgo", "brave"],
									consensus: 0.85,
								},
							]),
						},
					],
				},
			})}\n`,
		);

		const results = await callPromise;
		expect(results).toHaveLength(1);
		expect(results[0]?.url).toBe("https://example.com/pizza");
		expect(results[0]?.consensus).toBeCloseTo(0.85);

		await client.close();
	});

	it("fetch() parses snake_case + camelCase fields", async () => {
		const { client, spawned } = makeClient();
		const fetchPromise = client.fetch("https://example.com", { focus: "pricing" });
		const handle = await waitForSpawn(spawned);

		await vi.waitFor(() => {
			const writes = (handle.proc.stdin as unknown as FakeWritable).writes;
			if (!findInitialize(writes)) throw new Error("waiting for initialize");
		});
		const initReq = findInitialize((handle.proc.stdin as unknown as FakeWritable).writes);
		handle.proc.stdout.push(
			`${JSON.stringify({
				jsonrpc: "2.0",
				id: initReq?.["id"],
				result: { ok: true, protocolVersion: "2024-11-05" },
			})}\n`,
		);

		await vi.waitFor(() => {
			const writes = (handle.proc.stdin as unknown as FakeWritable).writes;
			if (!findToolsCall(writes)) throw new Error("waiting for tools/call");
		});
		const callReq = findToolsCall((handle.proc.stdin as unknown as FakeWritable).writes);
		handle.proc.stdout.push(
			`${JSON.stringify({
				jsonrpc: "2.0",
				id: callReq?.["id"],
				result: {
					content: [
						{
							type: "text",
							text: JSON.stringify({
								url: "https://example.com",
								final_url: "https://example.com/?ref=1",
								title: "Example",
								text: "body text",
								quality_score: 0.92,
								content_ok: true,
								page_type: "article",
								source_type: "official_docs",
								is_official: true,
								is_stale: false,
								next_action: "use",
								engines_consensus: 4,
								fetch_relevance: 0.81,
							}),
						},
					],
				},
			})}\n`,
		);

		const result = await fetchPromise;
		expect(result.url).toBe("https://example.com");
		expect(result.finalUrl).toBe("https://example.com/?ref=1");
		expect(result.title).toBe("Example");
		expect(result.content).toBe("body text");
		expect(result.qualityScore).toBeCloseTo(0.92);
		expect(result.contentOk).toBe(true);
		expect(result.isOfficial).toBe(true);
		expect(result.nextAction).toBe("use");

		await client.close();
	});

	it("screenshot() decodes base64 image content", async () => {
		const { client, spawned } = makeClient();
		const shotPromise = client.screenshot("https://example.com");
		const handle = await waitForSpawn(spawned);

		await vi.waitFor(() => {
			const writes = (handle.proc.stdin as unknown as FakeWritable).writes;
			if (!findInitialize(writes)) throw new Error("waiting for initialize");
		});
		const initReq = findInitialize((handle.proc.stdin as unknown as FakeWritable).writes);
		handle.proc.stdout.push(
			`${JSON.stringify({
				jsonrpc: "2.0",
				id: initReq?.["id"],
				result: { ok: true, protocolVersion: "2024-11-05" },
			})}\n`,
		);

		await vi.waitFor(() => {
			const writes = (handle.proc.stdin as unknown as FakeWritable).writes;
			if (!findToolsCall(writes)) throw new Error("waiting for tools/call");
		});
		const callReq = findToolsCall((handle.proc.stdin as unknown as FakeWritable).writes);
		const pngB64 = Buffer.from("FAKE_PNG_BYTES").toString("base64");
		handle.proc.stdout.push(
			`${JSON.stringify({
				jsonrpc: "2.0",
				id: callReq?.["id"],
				result: {
					content: [{ type: "image", data: pngB64 }],
				},
			})}\n`,
		);

		const out = await shotPromise;
		expect(out.mimeType).toBe("image/png");
		expect(Buffer.from(out.bytes).toString("utf8")).toBe("FAKE_PNG_BYTES");

		await client.close();
	});

	it("crawl() returns pages and totalBytes", async () => {
		const { client, spawned } = makeClient();
		const crawlPromise = client.crawl("https://example.com", { depth: 1, maxPages: 3 });
		const handle = await waitForSpawn(spawned);

		await vi.waitFor(() => {
			const writes = (handle.proc.stdin as unknown as FakeWritable).writes;
			if (!findInitialize(writes)) throw new Error("waiting for initialize");
		});
		const initReq = findInitialize((handle.proc.stdin as unknown as FakeWritable).writes);
		handle.proc.stdout.push(
			`${JSON.stringify({
				jsonrpc: "2.0",
				id: initReq?.["id"],
				result: { ok: true, protocolVersion: "2024-11-05" },
			})}\n`,
		);

		await vi.waitFor(() => {
			const writes = (handle.proc.stdin as unknown as FakeWritable).writes;
			if (!findToolsCall(writes)) throw new Error("waiting for tools/call");
		});
		const callReq = findToolsCall((handle.proc.stdin as unknown as FakeWritable).writes);
		handle.proc.stdout.push(
			`${JSON.stringify({
				jsonrpc: "2.0",
				id: callReq?.["id"],
				result: {
					content: [
						{
							type: "text",
							text: JSON.stringify({
								pages: [{ url: "https://example.com/a", qualityScore: 0.9 }],
								total_bytes: 1024,
							}),
						},
					],
				},
			})}\n`,
		);

		const result = await crawlPromise;
		expect(result.pages).toHaveLength(1);
		expect(result.pages[0]?.url).toBe("https://example.com/a");
		expect(result.totalBytes).toBe(1024);

		await client.close();
	});

	it("throws HoundUnavailableError when spawnFn throws", async () => {
		const client = new HoundMcpClient({
			spawnFn: () => {
				throw new Error("ENOENT");
			},
		});
		await expect(client.search("anything")).rejects.toBeInstanceOf(HoundUnavailableError);
	});

	it("rejects pending requests when subprocess closes mid-flight", async () => {
		const { client, spawned } = makeClient();
		const callPromise = client.search("hello");
		const handle = await waitForSpawn(spawned);

		// Let the client finish its initialize handshake before closing.
		await new Promise<void>((r) => setTimeout(r, 50));
		handle.close(1);

		await expect(callPromise).rejects.toBeInstanceOf(HoundUnavailableError);
	});

	it("close() rejects pending requests with HoundUnavailableError", async () => {
		const { client, spawned } = makeClient();
		const callPromise = client.search("ping");
		const handle = await waitForSpawn(spawned);

		// Let the initialize handshake complete so the search call is in flight.
		await vi.waitFor(() => {
			const writes = (handle.proc.stdin as unknown as FakeWritable).writes;
			if (!findInitialize(writes)) throw new Error("waiting for initialize");
		});
		const initReq = findInitialize((handle.proc.stdin as unknown as FakeWritable).writes);
		handle.proc.stdout.push(
			`${JSON.stringify({
				jsonrpc: "2.0",
				id: initReq?.["id"],
				result: { ok: true, protocolVersion: "2024-11-05" },
			})}\n`,
		);

		await client.close();

		await expect(callPromise).rejects.toBeInstanceOf(HoundCallError);
	});

	it("getHoundMcpClient returns a singleton", () => {
		const a = getHoundMcpClient();
		const b = getHoundMcpClient();
		expect(a).toBe(b);
	});

	it("ignores non-JSON stdout lines", async () => {
		const { client, spawned } = makeClient();
		const callPromise = client.search("noise test");
		const handle = await waitForSpawn(spawned);

		// Push the noise line BEFORE we wait, but AFTER spawn so it lands on a listener.
		handle.proc.stdout.push("[progress] 50% done\n");

		await vi.waitFor(() => {
			const writes = (handle.proc.stdin as unknown as FakeWritable).writes;
			if (!findInitialize(writes)) throw new Error("waiting for initialize");
		});
		const initReq = findInitialize((handle.proc.stdin as unknown as FakeWritable).writes);
		handle.proc.stdout.push(
			`${JSON.stringify({
				jsonrpc: "2.0",
				id: initReq?.["id"],
				result: { ok: true, protocolVersion: "2024-11-05" },
			})}\n`,
		);

		await vi.waitFor(() => {
			const writes = (handle.proc.stdin as unknown as FakeWritable).writes;
			if (!findToolsCall(writes)) throw new Error("waiting for tools/call");
		});
		const callReq = findToolsCall((handle.proc.stdin as unknown as FakeWritable).writes);
		handle.proc.stdout.push(
			`${JSON.stringify({
				jsonrpc: "2.0",
				id: callReq?.["id"],
				result: { content: [{ type: "text", text: "[]" }] },
			})}\n`,
		);

		const result = await callPromise;
		expect(result).toEqual([]);

		await client.close();
	});

	it("uses HOUND_COMMAND env var when no command override is given", () => {
		const previous = process.env.HOUND_COMMAND;
		process.env.HOUND_COMMAND = "/custom/path/hound";
		try {
			const client = new HoundMcpClient();
			const cmd = (client as unknown as { command: string }).command;
			expect(cmd).toBe("/custom/path/hound");
		} finally {
			if (previous === undefined) delete process.env.HOUND_COMMAND;
			else process.env.HOUND_COMMAND = previous;
		}
	});
});
