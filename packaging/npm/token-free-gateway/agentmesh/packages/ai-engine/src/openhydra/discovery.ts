import type { OpenHydraDiscoveryOptions, OpenHydraNode } from "./protocol";

const DEFAULT_DISCOVERY_TIMEOUT_MS = 3000;

export interface OpenHydraDiscovery {
	discover(signal?: AbortSignal): Promise<OpenHydraNode[]>;
}

/**
 * Discovers OpenHydra nodes by probing each bootstrap endpoint with a
 * `ping` JSON-RPC request over WebSocket. Only nodes that respond within
 * the timeout are returned.
 */
export class OpenHydraDiscoveryImpl implements OpenHydraDiscovery {
	private options: Required<Pick<OpenHydraDiscoveryOptions, "discoveryTimeoutMs">> &
		OpenHydraDiscoveryOptions;

	constructor(options: OpenHydraDiscoveryOptions) {
		this.options = {
			discoveryTimeoutMs: DEFAULT_DISCOVERY_TIMEOUT_MS,
			...options,
		};
	}

	async discover(signal?: AbortSignal): Promise<OpenHydraNode[]> {
		const { bootstrap, discoveryTimeoutMs } = this.options;

		if (!bootstrap || bootstrap.length === 0) {
			return [];
		}

		const results = await Promise.allSettled(
			bootstrap.map((endpoint) => this.probeNode(endpoint, discoveryTimeoutMs, signal)),
		);

		const nodes: OpenHydraNode[] = [];
		for (const result of results) {
			if (result.status === "fulfilled" && result.value) {
				nodes.push(result.value);
			}
		}

		return nodes;
	}

	private async probeNode(
		endpoint: string,
		timeoutMs: number,
		signal?: AbortSignal,
	): Promise<OpenHydraNode | null> {
		if (signal?.aborted) return null;

		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), timeoutMs);

		return new Promise<OpenHydraNode | null>((resolve) => {
			const onAbort = () => {
				clearTimeout(timeout);
				resolve(null);
			};
			if (signal) {
				if (signal.aborted) {
					onAbort();
					return;
				}
				signal.addEventListener("abort", onAbort, { once: true });
			}

			try {
				const ws = new WebSocket(endpoint);
				const cleanup = () => {
					ws.close();
					clearTimeout(timeout);
					signal?.removeEventListener("abort", onAbort);
				};

				const timer = setTimeout(() => {
					cleanup();
					resolve(null);
				}, timeoutMs);

				ws.addEventListener("open", () => {
					try {
						ws.send(
							JSON.stringify({
								jsonrpc: "2.0",
								id: `ping-${Date.now()}`,
								method: "ping",
								params: {},
							}),
						);
					} catch {
						clearTimeout(timer);
						resolve(null);
					}
				});

				ws.addEventListener("message", (event) => {
					clearTimeout(timer);
					try {
						const msg = JSON.parse(event.data.toString()) as { id?: string; result?: unknown };
						if (msg.result !== undefined) {
							resolve({
								peerId: `node-${Math.random().toString(36).slice(2, 10)}`,
								endpoint,
								lastSeen: Date.now(),
							});
						} else {
							resolve(null);
						}
					} catch {
						resolve(null);
					} finally {
						ws.close();
					}
				});

				ws.addEventListener("error", () => {
					clearTimeout(timer);
					resolve(null);
					ws.close();
				});
			} catch {
				clearTimeout(timeout);
				resolve(null);
			}
		});
	}
}

/**
 * Simple factory for creating a discovery instance.
 */
export function createOpenHydraDiscovery(options: OpenHydraDiscoveryOptions): OpenHydraDiscovery {
	return new OpenHydraDiscoveryImpl(options);
}
