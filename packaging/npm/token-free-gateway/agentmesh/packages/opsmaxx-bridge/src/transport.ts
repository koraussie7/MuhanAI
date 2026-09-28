/**
 * stdio JSON-RPC Transport for OpsMaxx IPC.
 *
 * Communicates with OpsMaxx Electron main process over stdin/stdout
 * using line-delimited JSON-RPC 2.0. Each message is a single line
 * terminated by '\n'. No headers, no framing — just newline separation.
 *
 * Request format (sent by us):
 *   {"jsonrpc":"2.0","id":"<uuid>","method":"vault.list","params":{}}
 *
 * Response format (received):
 *   {"jsonrpc":"2.0","id":"<uuid>","result":{...}}
 *   {"jsonrpc":"2.0","id":"<uuid>","error":{"code":-32601,"message":"..."}}
 *
 * Notification format (received, for server push):
 *   {"jsonrpc":"2.0","method":"mcp.invoke","params":{"name":"...","args":{}}}
 */

/**
 * Transport plugin point — implemented by stdio, HTTP, WebSocket, etc.
 * The IPC client uses this interface to communicate with OpsMaxx.
 */
export interface Transport {
	/**
	 * Send a JSON-RPC request and wait for the matching response.
	 * Implementations are responsible for timeouts and cancellation.
	 */
	send(method: string, params: unknown): Promise<unknown>;

	/**
	 * Optional: receive server-pushed notifications. Used by
	 * `aiGateway.onMcpInvoke` so OpsMaxx can call back into the agent.
	 * Implementations that do not support push should leave this
	 * undefined and throw from `subscribeMcpInvoke` if it is called.
	 */
	subscribe?(method: string, handler: (params: unknown) => void): () => void;

	/** Release the underlying connection. Idempotent. */
	close(): Promise<void>;
}

import { randomUUID } from "node:crypto";

/**
 * Creates a stdio-based JSON-RPC 2.0 Transport over stdin/stdout.
 *
 * The OpsMaxx Electron app must:
 *   - Read from stdin line by line
 *   - Parse each line as JSON-RPC 2.0 request
 *   - Write response/notification to stdout as a single JSON line
 *   - Flush stdout after each write
 *
 * @param options.timeoutMs  Default request timeout in ms (default: 5000)
 * @returns Transport implementation and a shutdown function
 */
function createStdioTransport(options: { timeoutMs?: number } = {}): {
	transport: Transport;
	/** Call to gracefully shut down the child process. */
	shutdown: () => Promise<void>;
} {
	const timeoutMs = options.timeoutMs ?? 5_000;

	// Pending requests awaiting response
	const pending = new Map<
		string,
		{ resolve: (value: unknown) => void; reject: (reason: unknown) => void; timer: NodeJS.Timeout }
	>();

	// Notification handlers
	const handlers = new Map<string, Set<(params: unknown) => void>>();

	let stdinBuffer = "";
	let isShuttingDown = false;

	const stdin = process.stdin;
	const stdout = process.stdout;

	stdin.setEncoding("utf8");
	stdin.on("data", (chunk: string) => {
		stdinBuffer += chunk;
		let newlineIndex;
		while ((newlineIndex = stdinBuffer.indexOf("\n")) !== -1) {
			const line = stdinBuffer.slice(0, newlineIndex).trim();
			stdinBuffer = stdinBuffer.slice(newlineIndex + 1);
			if (line.length === 0) continue;
			try {
				const msg = JSON.parse(line);
				if (msg && typeof msg === "object") {
					if (msg.method && !msg.id) {
						// Notification (server push)
						const handlers_ = handlers.get(msg.method);
						if (handlers_) {
							for (const h of handlers_) {
								try {
									h(msg.params);
								} catch {
									// Ignore handler errors
								}
							}
						}
					} else if (msg.id !== undefined) {
						// Response to our request
						const key = String(msg.id);
						const pendingEntry = pending.get(key);
						if (pendingEntry) {
							pending.delete(key);
							clearTimeout(pendingEntry.timer);
							if (msg.error) {
								pendingEntry.reject({
									code: msg.error.code,
									message: String(msg.error.message ?? "unknown error"),
									data: msg.error.data,
								});
							} else {
								pendingEntry.resolve(msg.result);
							}
}
}
				}
			} catch {
				// Ignore malformed JSON
			}
		}
	});

	stdin.on("close", () => {
		isShuttingDown = true;
		for (const [, entry] of pending) {
			clearTimeout(entry.timer);
			entry.reject(new Error("stdin closed"));
		}
		pending.clear();
	});

	function send(method: string, params: unknown): Promise<unknown> {
		if (isShuttingDown) return Promise.reject(new Error("transport closed"));
		const id = crypto.randomUUID();
		const request = { jsonrpc: "2.0" as const, id, method, params };
		const payload = JSON.stringify(request) + "\n";

		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				reject(new Error(`request timed out after 5000ms`));
			}, 5_000);

			pending.set(id, { resolve, reject, timer });

			try {
				process.stdout.write(payload);
			} catch (e) {
				clearTimeout(timer);
				reject(e);
			}
		}).finally(() => {
			// Timer is cleared in the promise resolution
		});
	}

	function subscribe(method: string, handler: (params: unknown) => void): () => void {
		let set = handlers.get(method);
		if (!set) {
			set = new Set();
			handlers.set(method, set);
		}
		set.add(handler);
		return () => {
			set.delete(handler);
			if (set.size === 0) handlers.delete(method);
		};
	}

	async function close(): Promise<void> {
		isShuttingDown = true;
		// Reject all pending with a clean error
		for (const [, entry] of pending) {
			clearTimeout(entry.timer);
			entry.reject(new Error("transport closed"));
		}
		pending.clear();
		handlers.clear();
	}

	return {
		transport: { send, subscribe, close },
		shutdown: async () => {
			await close();
		},
	};
}

/**
 * HTTP-based Transport for OpsMaxx IPC (alternative to stdio).
 *
 * Useful when OpsMaxx exposes an HTTP endpoint instead of stdio.
 * Each request is a POST to /rpc with JSON-RPC 2.0 body.
 *
 * @param options.baseUrl  Base URL of the OpsMaxx HTTP API (e.g., "http://localhost:12345")
 * @param options.timeoutMs  Request timeout in ms
 * @returns Transport implementation
 */
function createHttpTransport(options: {
	baseUrl: string;
	timeoutMs?: number;
	/**
	 * Optional prefix for generated JSON-RPC request ids. Used by tests
	 * that need to drive id-shaped paths in a mock server (e.g. an
	 * "err:" prefix that the mock interprets as "return a JSON-RPC error
	 * envelope"). Production callers should leave this unset.
	 */
	idPrefix?: string;
	/** Number of retries for connection failures (default: 3). */
	retries?: number;
	/** Base delay between retries in ms (default: 50). */
	retryDelayMs?: number;
}): Transport {
	const timeoutMs = options.timeoutMs ?? 5_000;
	const baseUrl = options.baseUrl.replace(/\/$/, "");
	const idPrefix = options.idPrefix ?? "";
	const maxRetries = options.retries ?? 3;
	const retryDelayMs = options.retryDelayMs ?? 50;

	const handlers = new Map<string, Set<(params: unknown) => void>>();

	async function sendWithRetry(method: string, params: unknown, attempt: number): Promise<unknown> {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);

		try {
			const response = await fetch(`${baseUrl}/rpc`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: idPrefix + crypto.randomUUID(),
					method,
					params,
				}),
				signal: controller.signal,
			});
			clearTimeout(timer);

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}
			const data = (await response.json()) as {
				error?: { code?: unknown; message?: unknown; data?: unknown };
				result?: unknown;
			};
			if (data.error) {
				throw {
					code: data.error.code,
					message: data.error.message,
					data: data.error.data,
				};
			}
			return data.result;
		} catch (error) {
			clearTimeout(timer);
			// Retry on network errors (ECONNREFUSED, fetch failed, etc.) but not on HTTP errors or JSON-RPC errors
			// Only transport-level failures are retried. HTTP status errors
			// ("HTTP 5xx") and JSON-RPC error envelopes are deterministic:
			// replaying them would just burn the retry budget and delay the
			// caller, so they fall straight through to `throw error`.
			const isHttpError = error instanceof Error && error.message.startsWith("HTTP ");
			const isJsonRpcError = error !== null && typeof error === "object" && "code" in error;
			const isNetworkError =
				!isHttpError &&
				!isJsonRpcError &&
				(error instanceof TypeError ||
					(error instanceof Error &&
						(error.message.includes("fetch failed") ||
							error.message.includes("ECONNREFUSED") ||
							error.message.includes("ENOTFOUND") ||
							error.message.includes("ENETUNREACH") ||
							error.message.includes("connection refused") ||
							error.message.includes("network"))));

			if (attempt < maxRetries && isNetworkError) {
				await new Promise((r) => setTimeout(r, retryDelayMs * attempt));
				return sendWithRetry(method, params, attempt + 1);
			}
			throw error;
		}
	}

	async function send(method: string, params: unknown): Promise<unknown> {
		return sendWithRetry(method, params, 1);
	}

	function subscribe(method: string, handler: (params: unknown) => void): () => void {
		// HTTP transport doesn't support server push by default.
		// If OpsMaxx supports WebSocket for notifications, use a different transport.
		if (method === "mcp.invoke") {
			// Could implement polling here if needed
			console.warn("[OpsMaxx HTTP transport] subscribe not supported for mcp.invoke");
		}
		return () => {};
	}

	async function close(): Promise<void> {
		// No persistent connection to close for HTTP
	}

	return { send, subscribe, close };
}

export { createStdioTransport, createHttpTransport };