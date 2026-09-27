/**
 * Lazy singleton + init-promise pattern used by Bitterbot's local
 * engines (SippEngine, future OpenHydraEngine, etc.).
 *
 * `getCachedEngine` returns:
 *   - the cached engine if a previous call resolved successfully,
 *   - the in-flight init promise if one is currently resolving,
 *   - `null` if the most recent init attempt failed.
 *
 * Init failures are non-fatal: the caller can still answer with the
 * next fallback. Concurrent callers share the same init promise so
 * WebGPU download / OpenHydra discovery only happens once.
 *
 * IMPORTANT: this module is intentionally generic so Part C's
 * OpenHydra wiring can plug in without duplicating the SippEngine
 * boilerplate. Keep the contract minimal — no engine-specific
 * knowledge leaks into here.
 */
export interface CachedEngine<T> {
	/** Eagerly initialize (e.g. on app mount). Safe to call many times. */
	preload(): void;
	/** Returns the engine when ready, or null if the last init failed. */
	get(): Promise<T | null>;
	/** Forget the cached engine. Next `get()` will re-init. */
	reset(): void;
}

export interface CachedEngineOptions<T> {
	/** Async factory that creates and initializes a single engine instance. */
	init: () => Promise<T>;
	/** Called once after a successful init. Used to wire status listeners. */
	onReady?: (engine: T) => void;
}

/**
 * Create a cached-engine handle. Concurrent `get()` calls share the
 * same init promise; failed inits return `null` without retrying on
 * the same call site (call `reset()` to retry).
 */
export function createCachedEngine<T>(options: CachedEngineOptions<T>): CachedEngine<T> {
	let engine: T | null = null;
	let initPromise: Promise<T | null> | null = null;
	/** Set when the last init attempt failed; cleared on successful init or reset(). */
	let lastInitFailed = false;

	const run = async (): Promise<T | null> => {
		try {
			const next = await options.init();
			engine = next;
			lastInitFailed = false;
			options.onReady?.(next);
			return next;
		} catch {
			lastInitFailed = true;
			return null;
		} finally {
			// Always release the in-flight promise so the next get()
			// can either reuse a successful cache or, if it failed,
			// skip re-init until reset() is called.
			initPromise = null;
		}
	};

	return {
		preload(): void {
			if (engine || initPromise || lastInitFailed) return;
			initPromise = run();
		},
		async get(): Promise<T | null> {
			if (engine) return engine;
			if (lastInitFailed) return null;
			if (initPromise) return initPromise;
			initPromise = run();
			return initPromise;
		},
		reset(): void {
			engine = null;
			initPromise = null;
			lastInitFailed = false;
		},
	};
}
