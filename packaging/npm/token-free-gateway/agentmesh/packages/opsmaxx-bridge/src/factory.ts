/**
 * Factory for the OpsMaxx bridge.
 *
 * Two implementations:
 *   - `createIpcBridge()` — production, talks to the local OpsMaxx daemon
 *     over Electron stdio/IPC. Requires OpsMaxx to be running.
 *   - `createInMemoryBridge()` — used by tests and by T2/T3/T4/T5 during
 *     development. No OpsMaxx required.
 *
 * The choice is intentionally a runtime decision, not a compile-time
 * import, so the same downstream packages (`@agentmesh/agent-daemon`,
 * `services/api`) can ship one binary that works in dev, test, and prod.
 */

import { createHttpTransport, createStdioTransport } from "./transport.js";
import { createIpcClient } from "./ipc.js";
import { createInMemoryBridge } from "./mock.js";
import type { OpsMaxxBridge } from "./types.js";

export type BridgeMode = "ipc" | "memory" | "auto";

export interface FactoryOptions {
	mode?: BridgeMode;
	/** HTTP(S) OpsMaxx RPC endpoint, e.g. http://127.0.0.1:8322. */
	endpoint?: string;
	/** Injectable transport for tests or an embedding host. */
	transport?: Parameters<typeof createIpcClient>[0]["transport"];
	timeoutMs?: number;
	/**
	 * Optional prefix for generated JSON-RPC request ids. Used by the HTTP
	 * transport so tests can drive specific id-shaped paths (e.g. an
	 * "err:" prefix that a mock server interprets as "return a JSON-RPC
	 * error envelope"). Production callers should leave this unset.
	 */
	idPrefix?: string;
}

export async function createOpsMaxxBridge(opts: FactoryOptions = {}): Promise<OpsMaxxBridge> {
	const mode = opts.mode ?? "auto";
	if (mode === "memory") return createInMemoryBridge();
	if (mode === "ipc") {
	const transport = opts.transport ?? createTransport(opts);
	return createIpcClient({ transport, timeoutMs: opts.timeoutMs });
	}
	if (mode === "auto" && (opts.transport || opts.endpoint)) {
	try {
	const transport = opts.transport ?? createTransport(opts);
	const bridge = createIpcClient({ transport, timeoutMs: opts.timeoutMs });
	const probe = await bridge.vault.list();
	if (probe.ok) return bridge;
	await bridge.close();
	} catch {
	// Fall back to memory when the optional local service is absent.
	}
	}
	return createInMemoryBridge();
}

function createTransport(opts: FactoryOptions) {
	if (opts.endpoint?.startsWith("http://") || opts.endpoint?.startsWith("https://")) {
		return createHttpTransport({
			baseUrl: opts.endpoint,
			timeoutMs: opts.timeoutMs,
			idPrefix: opts.idPrefix,
		});
	}
	return createStdioTransport({ timeoutMs: opts.timeoutMs }).transport;
}

export { createInMemoryBridge } from "./mock.js";
