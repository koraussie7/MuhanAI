/**
 * TASK-C base adapter primitives.
 *
 * Every TASK-C component declares its data flow through `ResourceAdapter<T>`,
 * so component code stays unaware of whether the snapshot comes from a stub
 * (UI dev), an HTTP endpoint (real backend), or an in-memory bus (tests).
 *
 * The two factories here are intentionally minimal:
 *   - `createStubAdapter`    — pure, no I/O. Tests love this.
 *   - `createHttpAdapter`    — wraps `fetch(url) → JSON`. Components can opt
 *                              in once `/api/...` endpoints exist, and the
 *                              shape they consume doesn't change.
 *
 * Components that need mutators (SecuritySettings) declare their own extended
 * interface (e.g. `SecurityAdapter extends ResourceAdapter<SecuritySnapshot>`)
 * and re-use `createStubAdapter` for the read path while adding save/cmd
 * methods directly.
 */

export interface ResourceAdapter<TSnapshot> {
	loadSnapshot(): Promise<TSnapshot>;
}

/**
 * Build a stub adapter from a producer function. The producer is invoked on
 * every `loadSnapshot()` call, so UI timestamps and counters stay "alive"
 * without a backend connection.
 */
export function createStubAdapter<TSnapshot>(
	produce: () => TSnapshot,
): ResourceAdapter<TSnapshot> {
	return {
		async loadSnapshot() {
			return produce();
		},
	};
}

export interface HttpAdapterOptions {
	signal?: AbortSignal;
	headers?: HeadersInit;
	credentials?: RequestCredentials;
	/** Inject a custom fetcher (used by tests to mock the network). */
	fetcher?: typeof fetch;
}

/**
 * Build an HTTP-backed adapter that does `GET url → JSON`.
 *
 * Throws on non-2xx with a `[adapter] <url> → <status>` message so the
 * component can render a visible error state — adapters never silently
 * swallow network failures.
 */
export function createHttpAdapter<TSnapshot>(
	url: string,
	options: HttpAdapterOptions = {},
): ResourceAdapter<TSnapshot> {
	const f = options.fetcher ?? fetch;
	return {
		async loadSnapshot() {
			const res = await f(url, {
				method: "GET",
				headers: { Accept: "application/json", ...options.headers },
				credentials: options.credentials,
				signal: options.signal,
			});
			if (!res.ok) {
				throw new Error(
					`[adapter] ${url} -> ${res.status} ${res.statusText ?? ""}`.trim(),
				);
			}
			return (await res.json()) as TSnapshot;
		},
	};
}

/**
 * Compose a read-only base with mutator commands. Components that need
 * `saveToggles`, `revokeKey`, etc. extend this with their own `TCommand`
 * union instead of reinventing the contract.
 */
export interface WritableResourceAdapter<TSnapshot>
	extends ResourceAdapter<TSnapshot> {
	saveSnapshot(snapshot: TSnapshot): Promise<void>;
}
