import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createHttpAdapter, createStubAdapter, type ResourceAdapter } from "./adapter.js";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface FetchCall {
	args: Parameters<FetchLike>;
}

function createFetchSpy(impl: (...args: Parameters<FetchLike>) => unknown): {
	fn: FetchLike;
	calls: FetchCall[];
} {
	const calls: FetchCall[] = [];
	const fn: FetchLike = (...args) => {
		calls.push({ args });
		return impl(...args) as ReturnType<FetchLike>;
	};
	return { fn, calls };
}

function mockFetch(impl: (...args: Parameters<FetchLike>) => unknown): {
	fetcher: typeof fetch;
	calls: FetchCall[];
} {
	const { fn, calls } = createFetchSpy(impl);
	return {
		fetcher: fn as unknown as typeof fetch,
		calls,
	};
}

describe("harvest/C adapter primitives", () => {
	describe("createStubAdapter", () => {
		it("returns whatever the producer yields", async () => {
			const a = createStubAdapter(() => ({ routes: ["a"], vault: 1 }));
			assert.deepEqual(await a.loadSnapshot(), { routes: ["a"], vault: 1 });
		});

		it("calls the producer on every load (live stub semantics)", async () => {
			let n = 0;
			const a = createStubAdapter(() => ({ ts: ++n }));
			assert.deepEqual(await a.loadSnapshot(), { ts: 1 });
			assert.deepEqual(await a.loadSnapshot(), { ts: 2 });
			assert.deepEqual(await a.loadSnapshot(), { ts: 3 });
		});

		it("conforms to ResourceAdapter<T> shape", async () => {
			const a: ResourceAdapter<{ ok: true }> = createStubAdapter(() => ({
				ok: true as const,
			}));
			assert.equal(typeof a.loadSnapshot, "function");
			assert.deepEqual(await a.loadSnapshot(), { ok: true });
		});
	});

	describe("createHttpAdapter", () => {
		it("parses a 200 JSON response into a snapshot", async () => {
			const { fetcher, calls } = mockFetch(() =>
				Promise.resolve({
					ok: true,
					status: 200,
					statusText: "OK",
					json: () => Promise.resolve({ gateways: [], vault: [] }),
				}),
			);
			const a = createHttpAdapter<{ gateways: unknown[]; vault: unknown[] }>("/api/llm-mesh", {
				fetcher,
			});
			const snap = await a.loadSnapshot();
			assert.deepEqual(snap, { gateways: [], vault: [] });
			assert.equal(calls.length, 1);
			assert.equal(calls[0]!.args[0], "/api/llm-mesh");
			const init = calls[0]!.args[1] as RequestInit;
			assert.equal(init.method, "GET");
			assert.deepEqual(init.headers, { Accept: "application/json" });
		});

		it("throws on non-2xx with URL and status in the message", async () => {
			const { fetcher } = mockFetch(() =>
				Promise.resolve({
					ok: false,
					status: 503,
					statusText: "Service Unavailable",
				}),
			);
			const a = createHttpAdapter("/api/security", { fetcher });
			await assert.rejects(a.loadSnapshot(), "/api/security -> 503 Service Unavailable");
		});

		it("forwards AbortSignal to the fetcher", async () => {
			const controller = new AbortController();
			const { fetcher, calls } = mockFetch(() =>
				Promise.resolve({
					ok: true,
					status: 200,
					statusText: "OK",
					json: () => Promise.resolve({ ok: 1 }),
				}),
			);
			const a = createHttpAdapter("/api/credits", {
				fetcher,
				signal: controller.signal,
			});
			await a.loadSnapshot();
			const init = calls[0]!.args[1] as RequestInit;
			assert.equal(init.signal, controller.signal);
		});

		it("uses global fetch when no fetcher is injected", async () => {
			const original = globalThis.fetch;
			const { fetcher, calls } = mockFetch(() =>
				Promise.resolve({
					ok: true,
					status: 200,
					statusText: "OK",
					json: () => Promise.resolve({ y: 1 }),
				}),
			);
			(globalThis as { fetch: typeof fetch }).fetch = fetcher;
			try {
				const a = createHttpAdapter("/api/x");
				await a.loadSnapshot();
				assert.equal(calls.length, 1);
			} finally {
				(globalThis as { fetch: typeof fetch }).fetch = original;
			}
		});
	});

	describe("adapter contract composition", () => {
		it("arbitrary snapshots are honored through ResourceAdapter<T>", async () => {
			interface Snapshot {
				id: string;
				values: number[];
			}
			const a: ResourceAdapter<Snapshot> = createStubAdapter(() => ({
				id: "x",
				values: [1, 2, 3],
			}));
			const snap = await a.loadSnapshot();
			assert.equal(snap.id, "x");
			assert.equal(snap.values.length, 3);
		});
	});
});
