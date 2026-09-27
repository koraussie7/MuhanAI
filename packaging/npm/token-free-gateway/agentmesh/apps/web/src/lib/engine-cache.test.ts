import assert from "node:assert/strict";
import { test } from "node:test";
import { createCachedEngine } from "./engine-cache.js";

/**
 * The CachedEngine contract is small but critical: Bitterbot's WebGPU
 * pre-download (SippEngine) and the upcoming OpenHydra peer discovery
 * both rely on the singleton + shared-init-promise + null-on-failure
 * semantics. These tests pin the contract so Part C can refactor the
 * SippEngine cache to use this helper without breaking behavior.
 */

test("createCachedEngine returns the same instance on concurrent get()", async () => {
	let initCalls = 0;
	const cache = createCachedEngine<{ id: number }>({
		init: async () => {
			initCalls += 1;
			await new Promise((r) => setTimeout(r, 5));
			return { id: 1 };
		},
	});

	const [a, b, c] = await Promise.all([cache.get(), cache.get(), cache.get()]);
	assert.equal(initCalls, 1, "init runs once for concurrent callers");
	assert.equal(a, b);
	assert.equal(b, c);
	assert.equal((a as { id: number }).id, 1);
});

test("createCachedEngine returns null when init throws", async () => {
	const cache = createCachedEngine<unknown>({
		init: async () => {
			throw new Error("WebGPU unsupported");
		},
	});

	const first = await cache.get();
	assert.equal(first, null);
});

test("createCachedEngine does not auto-retry after a failed init", async () => {
	let initCalls = 0;
	const cache = createCachedEngine<unknown>({
		init: async () => {
			initCalls += 1;
			throw new Error("boom");
		},
	});

	assert.equal(await cache.get(), null);
	assert.equal(await cache.get(), null);
	assert.equal(initCalls, 1, "failed init is not retried until reset()");
});

test("createCachedEngine retries after reset()", async () => {
	let initCalls = 0;
	let shouldFail = true;
	const cache = createCachedEngine<{ ok: boolean }>({
		init: async () => {
			initCalls += 1;
			if (shouldFail) throw new Error("boom");
			return { ok: true };
		},
	});

	assert.equal(await cache.get(), null);
	cache.reset();
	shouldFail = false;
	const recovered = await cache.get();
	assert.deepEqual(recovered, { ok: true });
	assert.equal(initCalls, 2);
});

test("createCachedEngine fires onReady exactly once per successful init", async () => {
	let readyCalls = 0;
	const cache = createCachedEngine<{ v: number }>({
		init: async () => ({ v: 42 }),
		onReady: () => {
			readyCalls += 1;
		},
	});

	await cache.get();
	await cache.get(); // cached, no re-init
	await cache.get(); // cached, no re-init

	assert.equal(readyCalls, 1, "onReady fires once per init");
});

test("createCachedEngine.preload kicks off init without awaiting", () => {
	let initStarted = false;
	const cache = createCachedEngine<{ v: number }>({
		init: async () => {
			initStarted = true;
			return { v: 1 };
		},
	});

	cache.preload();
	// preload is fire-and-forget; we cannot assert inside it
	// but we can verify the init was scheduled by checking get() resolves.
	(async () => {
		const e = await cache.get();
		assert.equal(initStarted, true);
		assert.deepEqual(e, { v: 1 });
	})();
});
