import { describe, expect, it, type Mock, vi } from "vitest";
import { createHttpAdapter, createStubAdapter, type ResourceAdapter } from "./adapter.js";

function mockFetch(impl: Parameters<Mock>[0]): {
	fetcher: typeof fetch;
	fn: Mock;
} {
	const fn = vi.fn(impl);
	return {
		fetcher: fn as unknown as typeof fetch,
		fn,
	};
}

describe("harvest/C adapter primitives", () => {
	describe("createStubAdapter", () => {
		it("returns whatever the producer yields", async () => {
			const a = createStubAdapter(() => ({ routes: ["a"], vault: 1 }));
			expect(await a.loadSnapshot()).toEqual({ routes: ["a"], vault: 1 });
		});

		it("calls the producer on every load (live stub semantics)", async () => {
			let n = 0;
			const a = createStubAdapter(() => ({ ts: ++n }));
			expect(await a.loadSnapshot()).toEqual({ ts: 1 });
			expect(await a.loadSnapshot()).toEqual({ ts: 2 });
			expect(await a.loadSnapshot()).toEqual({ ts: 3 });
		});

		it("conforms to ResourceAdapter<T> shape", async () => {
			const a: ResourceAdapter<{ ok: true }> = createStubAdapter(() => ({
				ok: true as const,
			}));
			expect(a.loadSnapshot).toBeTypeOf("function");
			expect(await a.loadSnapshot()).toEqual({ ok: true });
		});
	});

	describe("createHttpAdapter", () => {
		it("parses a 200 JSON response into a snapshot", async () => {
			const { fetcher, fn } = mockFetch(() =>
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
			expect(snap).toEqual({ gateways: [], vault: [] });
			expect(fn).toHaveBeenCalledOnce();
			expect(fn).toHaveBeenCalledWith(
				"/api/llm-mesh",
				expect.objectContaining({
					method: "GET",
					headers: expect.objectContaining({ Accept: "application/json" }),
				}),
			);
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
			await expect(a.loadSnapshot()).rejects.toThrow("/api/security -> 503 Service Unavailable");
		});

		it("forwards AbortSignal to the fetcher", async () => {
			const controller = new AbortController();
			const { fetcher, fn } = mockFetch(() =>
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
			const callArgs = fn.mock.calls[0]?.[1] as RequestInit | undefined;
			expect(callArgs?.signal).toBe(controller.signal);
		});

		it("uses global fetch when no fetcher is injected", async () => {
			const original = globalThis.fetch;
			const { fetcher, fn } = mockFetch(() =>
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
				expect(fn).toHaveBeenCalledOnce();
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
			expect(snap.id).toBe("x");
			expect(snap.values).toHaveLength(3);
		});
	});
});
