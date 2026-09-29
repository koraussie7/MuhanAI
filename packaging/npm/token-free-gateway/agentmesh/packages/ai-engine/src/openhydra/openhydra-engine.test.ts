import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OpenHydraEngine } from "./openhydra-engine";

type TestNode = { peerId: string; endpoint: string; lastSeen: number };

function mockNodes(endpoints: string[]): TestNode[] {
	return endpoints.map((ep, i) => ({
		peerId: `node-${i}`,
		endpoint: ep,
		lastSeen: Date.now(),
	}));
}

async function initEngine(engine: OpenHydraEngine, endpoints: string[]) {
	vi.spyOn(engine as any, "discoverNodes").mockResolvedValue(mockNodes(endpoints));
	await engine.init();
}

describe("OpenHydraEngine", () => {
	let originalFetch: typeof globalThis.fetch | undefined;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		vi.restoreAllMocks();
		if (originalFetch) globalThis.fetch = originalFetch;
		else delete (globalThis as any).fetch;
	});

	describe("init", () => {
		it("throws when no endpoints configured", async () => {
			const engine = new OpenHydraEngine({ type: "openhydra" });
			await expect(engine.init()).rejects.toThrow("No OpenHydra endpoints configured");
			expect(engine.getStatus().ready).toBe(false);
		});

		it("throws when no nodes respond", async () => {
			const engine = new OpenHydraEngine({
				type: "openhydra",
				endpoints: ["ws://nonexistent:9999"],
				discoveryTimeoutMs: 100,
			});
			vi.spyOn(engine as any, "discoverNodes").mockResolvedValue([]);
			await expect(engine.init()).rejects.toThrow("No OpenHydra nodes responded");
			expect(engine.getStatus().ready).toBe(false);
		});

		it("initializes successfully when a node responds", async () => {
			const engine = new OpenHydraEngine({
				type: "openhydra",
				endpoints: ["ws://localhost:8080"],
			});
			await initEngine(engine, ["ws://localhost:8080"]);
			expect(engine.getStatus().ready).toBe(true);
			expect(engine.getStatus().backend).toBe("openhydra");
		});
	});

	describe("chat", () => {
		it("throws when engine is not initialized", async () => {
			const engine = new OpenHydraEngine({ type: "openhydra" });
			await expect(engine.chat("hi")).rejects.toThrow("not initialized");
		});

		it("returns text when the node responds", async () => {
			const engine = new OpenHydraEngine({
				type: "openhydra",
				endpoints: ["ws://localhost:8080"],
			});
			await initEngine(engine, ["ws://localhost:8080"]);

			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: () =>
					Promise.resolve({
						jsonrpc: "2.0",
						id: "chat-1",
						result: { text: "Hello from OpenHydra" },
					}),
			}) as any;

			const result = await engine.chat("hi");
			expect(result).toBe("Hello from OpenHydra");
		});

		it("uses token field as fallback", async () => {
			const engine = new OpenHydraEngine({
				type: "openhydra",
				endpoints: ["ws://localhost:8080"],
			});
			await initEngine(engine, ["ws://localhost:8080"]);

			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: () =>
					Promise.resolve({
						jsonrpc: "2.0",
						id: "chat-1",
						result: { token: "Token response" },
					}),
			}) as any;

			const result = await engine.chat("hi");
			expect(result).toBe("Token response");
		});

		it("falls through to the second node when the first fails", async () => {
			const engine = new OpenHydraEngine({
				type: "openhydra",
				endpoints: ["ws://node-a:8080", "ws://node-b:8080"],
			});
			await initEngine(engine, ["ws://node-a:8080", "ws://node-b:8080"]);

			globalThis.fetch = vi
				.fn()
				.mockRejectedValueOnce(new Error("ECONNREFUSED"))
				.mockResolvedValueOnce({
					ok: true,
					json: () =>
						Promise.resolve({
							jsonrpc: "2.0",
							id: "chat-2",
							result: { text: "Secondary node response" },
						}),
				}) as any;

			const result = await engine.chat("test");
			expect(result).toBe("Secondary node response");
			expect(globalThis.fetch).toHaveBeenCalledTimes(2);
		});

		it("throws when all nodes fail", async () => {
			const engine = new OpenHydraEngine({
				type: "openhydra",
				endpoints: ["ws://node-a:8080", "ws://node-b:8080"],
			});
			await initEngine(engine, ["ws://node-a:8080", "ws://node-b:8080"]);

			globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error")) as any;

			await expect(engine.chat("fail")).rejects.toThrow("All OpenHydra nodes failed");
		});

		it("throws on non-ok HTTP response", async () => {
			const engine = new OpenHydraEngine({
				type: "openhydra",
				endpoints: ["ws://localhost:8080"],
			});
			await initEngine(engine, ["ws://localhost:8080"]);

			globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 }) as any;

			await expect(engine.chat("hi")).rejects.toThrow("OpenHydra HTTP 503");
		});

		it("handles JSON-RPC error response", async () => {
			const engine = new OpenHydraEngine({
				type: "openhydra",
				endpoints: ["ws://localhost:8080"],
			});
			await initEngine(engine, ["ws://localhost:8080"]);

			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: () =>
					Promise.resolve({
						jsonrpc: "2.0",
						id: "chat-3",
						error: { code: -32001, message: "Model not loaded" },
					}),
			}) as any;

			await expect(engine.chat("hi")).rejects.toThrow("OpenHydra error: Model not loaded");
		});

		it("emits error event when a node fails", async () => {
			const engine = new OpenHydraEngine({
				type: "openhydra",
				endpoints: ["ws://localhost:8080"],
			});
			await initEngine(engine, ["ws://localhost:8080"]);

			globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error")) as any;

			const errors: Error[] = [];
			engine.on("error", (err: Error) => errors.push(err));

			await expect(engine.chat("hi")).rejects.toThrow();
			expect(errors.length).toBeGreaterThan(0);
		});
	});

	describe("stream", () => {
		it("delivers tokens via onToken callback", async () => {
			const engine = new OpenHydraEngine({
				type: "openhydra",
				endpoints: ["ws://localhost:8080"],
			});
			await initEngine(engine, ["ws://localhost:8080"]);

			const tokens: string[] = [];
			const mockReader = {
				read: vi
					.fn()
					.mockResolvedValueOnce({
						done: false,
						value: new TextEncoder().encode(
							'{"jsonrpc":"2.0","id":"s1","result":{"token":"Hello "}}',
						),
					})
					.mockResolvedValueOnce({
						done: false,
						value: new TextEncoder().encode(
							'{"jsonrpc":"2.0","id":"s1","result":{"token":"world!"}}',
						),
					})
					.mockResolvedValueOnce({ done: true, value: undefined }),
				releaseLock: vi.fn(),
			};
			const mockBody = { getReader: () => mockReader };

			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: true,
				body: mockBody,
			}) as any;

			await new Promise<void>((resolve) => {
				engine.stream("hi", (token) => tokens.push(token));
				setTimeout(() => {
					expect(tokens).toEqual(["Hello ", "world!"]);
					resolve();
				}, 200);
			});
		});

		it("stops on abort signal without errors", async () => {
			const engine = new OpenHydraEngine({
				type: "openhydra",
				endpoints: ["ws://localhost:8080"],
			});
			await initEngine(engine, ["ws://localhost:8080"]);

			const controller = new AbortController();
			controller.abort();

			const mockReader = {
				read: vi.fn().mockResolvedValue({ done: true, value: undefined }),
				releaseLock: vi.fn(),
			};
			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: true,
				body: { getReader: () => mockReader },
			}) as any;

			engine.stream("hi", () => {}, controller.signal);
			await new Promise((r) => setTimeout(r, 50));
		});

		it("skips invalid JSON lines in stream", async () => {
			const engine = new OpenHydraEngine({
				type: "openhydra",
				endpoints: ["ws://localhost:8080"],
			});
			await initEngine(engine, ["ws://localhost:8080"]);

			const tokens: string[] = [];
			const mockReader = {
				read: vi
					.fn()
					.mockResolvedValueOnce({ done: false, value: new TextEncoder().encode("not-json") })
					.mockResolvedValueOnce({
						done: false,
						value: new TextEncoder().encode(
							'{"jsonrpc":"2.0","id":"s1","result":{"token":"valid"}}',
						),
					})
					.mockResolvedValueOnce({ done: true, value: undefined }),
				releaseLock: vi.fn(),
			};

			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: true,
				body: { getReader: () => mockReader },
			}) as any;

			await new Promise<void>((resolve) => {
				engine.stream("hi", (token) => tokens.push(token));
				setTimeout(() => {
					expect(tokens).toEqual(["valid"]);
					resolve();
				}, 200);
			});
		});

		it("falls through to next node on stream failure", async () => {
			const engine = new OpenHydraEngine({
				type: "openhydra",
				endpoints: ["ws://node-a:8080", "ws://node-b:8080"],
			});
			await initEngine(engine, ["ws://node-a:8080", "ws://node-b:8080"]);

			const tokens: string[] = [];
			const mockReader = {
				read: vi
					.fn()
					.mockResolvedValueOnce({
						done: false,
						value: new TextEncoder().encode('{"jsonrpc":"2.0","id":"s1","result":{"token":"B!"}}'),
					})
					.mockResolvedValueOnce({ done: true, value: undefined }),
				releaseLock: vi.fn(),
			};

			globalThis.fetch = vi
				.fn()
				.mockRejectedValueOnce(new Error("Connection refused"))
				.mockResolvedValueOnce({
					ok: true,
					body: { getReader: () => mockReader },
				}) as any;

			await new Promise<void>((resolve) => {
				engine.stream("hi", (token) => tokens.push(token));
				setTimeout(() => {
					expect(tokens).toEqual(["B!"]);
					resolve();
				}, 200);
			});
		});
	});

	describe("getModels", () => {
		it("returns mapped model info", async () => {
			const engine = new OpenHydraEngine({
				type: "openhydra",
				endpoints: ["ws://localhost:8080"],
			});
			await initEngine(engine, ["ws://localhost:8080"]);

			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: () =>
					Promise.resolve({
						jsonrpc: "2.0",
						id: "models-1",
						result: { models: [{ name: "llama3:8b", size: 4_000_000_000 }] },
					}),
			}) as any;

			const models = await engine.getModels();
			expect(models).toHaveLength(1);
			expect(models[0]?.id).toBe("llama3:8b");
			expect(models[0]?.size).toBe(4_000_000_000);
		});

		it("returns empty array when all nodes fail", async () => {
			const engine = new OpenHydraEngine({
				type: "openhydra",
				endpoints: ["ws://localhost:8080"],
			});
			await initEngine(engine, ["ws://localhost:8080"]);

			globalThis.fetch = vi.fn().mockRejectedValue(new Error("fail")) as any;

			const models = await engine.getModels();
			expect(models).toEqual([]);
		});

		it("throws when engine is not initialized", async () => {
			const engine = new OpenHydraEngine({ type: "openhydra" });
			await expect(engine.getModels()).rejects.toThrow("not initialized");
		});
	});

	describe("unloadModel and dispose", () => {
		it("unloadModel clears modelLoaded and emits status", async () => {
			const engine = new OpenHydraEngine({
				type: "openhydra",
				endpoints: ["ws://localhost:8080"],
			});
			await initEngine(engine, ["ws://localhost:8080"]);
			await engine.loadModel("test-model");
			expect(engine.getStatus().modelLoaded).toBe("test-model");

			await engine.unloadModel();
			expect(engine.getStatus().modelLoaded).toBeNull();
		});

		it("dispose sets ready to false and clears nodes", async () => {
			const engine = new OpenHydraEngine({
				type: "openhydra",
				endpoints: ["ws://localhost:8080"],
			});
			await initEngine(engine, ["ws://localhost:8080"]);
			engine["nodes"] = mockNodes(["ws://localhost:8080"]);

			await engine.dispose();
			expect(engine.getStatus().ready).toBe(false);
			expect(engine["nodes"]).toHaveLength(0);
		});
	});
});
