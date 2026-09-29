/**
 * A2A (Agent-to-Agent) Client — JSON-RPC 2.0 over HTTP/WebSocket.
 *
 * Implements the A2A protocol (https://github.com/a2aproject/A2A)
 * for agent discovery, task execution, and skill invocation.
 *
 * Reuses the Transport pattern from packages/opsmaxx-bridge/src/transport.ts
 * so the wire protocol (HTTP / WebSocket / stdio) is swappable.
 */

import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// A2A Protocol Types (per A2A spec)
// ---------------------------------------------------------------------------

export interface AgentCard {
	name: string;
	description: string;
	url: string;
	version: string;
	capabilities: {
		streaming?: boolean;
		pushNotifications?: boolean;
		stateTransitionHistory?: boolean;
	};
	authentication?: {
		schemes: string[];
		credentials?: string;
	};
	skills: AgentSkill[];
	defaultInputModes: string[];
	defaultOutputModes: string[];
}

export interface AgentSkill {
	id: string;
	name: string;
	description: string;
	tags: string[];
	examples?: string[];
	inputModes: string[];
	outputModes: string[];
}

export interface Task {
	id: string;
	contextId?: string;
	status: TaskStatus;
	artifacts?: TaskArtifact[];
	history?: TaskMessage[];
	metadata?: Record<string, unknown>;
}

export type TaskStatusState =
	| "submitted"
	| "working"
	| "input-required"
	| "completed"
	| "failed"
	| "canceled";

export interface TaskStatus {
	state: TaskStatusState;
	message?: TaskMessage;
	timestamp: string;
}

export interface TaskMessage {
	role: "user" | "agent";
	parts: TaskPart[];
	metadata?: Record<string, unknown>;
}

export type TaskPart =
	| { type: "text"; text: string }
	| { type: "data"; data: Record<string, unknown>; mimeType?: string }
	| { type: "file"; file: { name: string; mimeType: string; bytes: string } };

export interface TaskArtifact {
	name: string;
	description?: string;
	parts: TaskPart[];
	metadata?: Record<string, unknown>;
}

export interface TaskPushNotificationConfig {
	url: string;
	token?: string;
	authentication?: Record<string, unknown>;
}

export interface TaskQueryParams {
	id: string;
	historyLength?: number;
}

export interface TaskSendParams {
	id: string;
	message: TaskMessage;
	pushNotification?: TaskPushNotificationConfig;
	historyLength?: number;
}

export interface TaskCancelParams {
	id: string;
}

export interface TaskSubscribeParams {
	id: string;
}

// JSON-RPC 2.0 types
export interface JsonRpcRequest<T = unknown> {
	jsonrpc: "2.0";
	id: string | number;
	method: string;
	params?: T;
}

export interface JsonRpcResponse<T = unknown> {
	jsonrpc: "2.0";
	id: string | number;
	result?: T;
	error?: JsonRpcError;
}

export interface JsonRpcError {
	code: number;
	message: string;
	data?: unknown;
}

export interface JsonRpcNotification<T = unknown> {
	jsonrpc: "2.0";
	method: string;
	params?: T;
}

// ---------------------------------------------------------------------------
// Transport Interface (same pattern as opsmaxx-bridge)
// ---------------------------------------------------------------------------

export interface A2aTransport {
	/**
	 * Send a JSON-RPC request and wait for the matching response.
	 */
	send(method: string, params: unknown): Promise<unknown>;

	/**
	 * Optional: receive server-pushed notifications (e.g., task status updates).
	 */
	subscribe?(method: string, handler: (params: unknown) => void): () => void;

	/** Release the underlying connection. Idempotent. */
	close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// HTTP Transport Implementation
// ---------------------------------------------------------------------------

export interface CreateHttpTransportOptions {
	baseUrl: string;
	timeoutMs?: number;
	/** Optional prefix for generated JSON-RPC request ids. Used by tests. */
	idPrefix?: string;
	/** Number of retries for connection failures (default: 3). */
	retries?: number;
	/** Base delay between retries in ms (default: 50). */
	retryDelayMs?: number;
	/** Optional headers to include in every request. */
	headers?: Record<string, string>;
	/** Optional fetch implementation for deterministic tests or custom runtimes. */
	fetchImpl?: typeof fetch;
}

function createHttpTransport(options: CreateHttpTransportOptions): A2aTransport {
	const timeoutMs = options.timeoutMs ?? 5_000;
	const baseUrl = options.baseUrl.replace(/\/$/, "");
	const idPrefix = options.idPrefix ?? "";
	const maxRetries = options.retries ?? 3;
	const retryDelayMs = options.retryDelayMs ?? 50;
	const customHeaders = options.headers ?? {};
	const fetchImpl = options.fetchImpl ?? fetch;

	const _handlers = new Map<string, Set<(params: unknown) => void>>();

	async function sendWithRetry(method: string, params: unknown, attempt: number): Promise<unknown> {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);

		try {
			const response = await fetchImpl(`${baseUrl}/a2a/rpc`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					...customHeaders,
				},
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: idPrefix + randomUUID(),
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

	function subscribe(method: string, _handler: (params: unknown) => void): () => void {
		// HTTP transport doesn't support server push by default.
		// If the agent supports WebSocket for notifications, use a different transport.
		if (method.startsWith("tasks/")) {
			console.warn("[A2A HTTP transport] subscribe not supported for task notifications");
		}
		return () => {};
	}

	async function close(): Promise<void> {
		// No persistent connection to close for HTTP
	}

	return { send, subscribe, close };
}

// ---------------------------------------------------------------------------
// WebSocket Transport Implementation
// ---------------------------------------------------------------------------

export interface CreateWebSocketTransportOptions {
	url: string;
	timeoutMs?: number;
	idPrefix?: string;
	reconnect?: boolean;
	reconnectDelayMs?: number;
	maxReconnectAttempts?: number;
	headers?: Record<string, string>;
}

function createWebSocketTransport(options: CreateWebSocketTransportOptions): A2aTransport {
	const timeoutMs = options.timeoutMs ?? 5_000;
	const idPrefix = options.idPrefix ?? "";
	const shouldReconnect = options.reconnect ?? true;
	const reconnectDelayMs = options.reconnectDelayMs ?? 1_000;
	const maxReconnectAttempts = options.maxReconnectAttempts ?? 5;
	const _customHeaders = options.headers ?? {};

	const handlers = new Map<string, Set<(params: unknown) => void>>();
	const pending = new Map<
		string,
		{
			resolve: (value: unknown) => void;
			reject: (reason: unknown) => void;
			timer: ReturnType<typeof setTimeout>;
		}
	>();
	let ws: WebSocket | null = null;
	let reconnectAttempts = 0;
	let isClosing = false;
	let connectPromise: Promise<void> | null = null;

	function connect(): Promise<void> {
		if (connectPromise) return connectPromise;

		connectPromise = new Promise((resolve, reject) => {
			try {
				ws = new WebSocket(options.url);

				ws.onopen = () => {
					reconnectAttempts = 0;
					resolve();
				};

				ws.onmessage = (event) => {
					try {
						const msg = JSON.parse(event.data);
						if (msg && typeof msg === "object") {
							if (msg.method && !msg.id) {
								// Notification
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
								// Response
								const key = String(msg.id);
								const entry = pending.get(key);
								if (entry) {
									pending.delete(key);
									clearTimeout(entry.timer);
									if (msg.error) {
										entry.reject({
											code: msg.error.code,
											message: String(msg.error.message ?? "unknown error"),
											data: msg.error.data,
										});
									} else {
										entry.resolve(msg.result);
									}
								}
							}
						}
					} catch {
						// Ignore malformed JSON
					}
				};

				ws.onerror = (_event) => {
					if (reconnectAttempts === 0) {
						// First connection error - reject the connect promise
						reject(new Error("WebSocket connection failed"));
					}
				};

				ws.onclose = () => {
					connectPromise = null;
					if (!isClosing && shouldReconnect && reconnectAttempts < maxReconnectAttempts) {
						reconnectAttempts++;
						setTimeout(() => connect().catch(() => {}), reconnectDelayMs * reconnectAttempts);
					} else {
						// Reject all pending
						for (const [, entry] of pending) {
							clearTimeout(entry.timer);
							entry.reject(new Error("WebSocket closed"));
						}
						pending.clear();
					}
				};
			} catch (e) {
				connectPromise = null;
				reject(e);
			}
		});

		return connectPromise;
	}

	// Initial connection
	connect().catch(() => {});

	async function send(method: string, params: unknown): Promise<unknown> {
		await connect(); // Wait for connection
		if (!ws || ws.readyState !== WebSocket.OPEN) {
			throw new Error("WebSocket not connected");
		}

		const id = idPrefix + randomUUID();
		const request = { jsonrpc: "2.0" as const, id, method, params };

		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				pending.delete(id);
				reject(new Error(`request timed out after ${timeoutMs}ms`));
			}, timeoutMs);

			pending.set(id, { resolve, reject, timer });

			try {
				ws?.send(JSON.stringify(request));
			} catch (e) {
				clearTimeout(timer);
				pending.delete(id);
				reject(e);
			}
		}).finally(() => {
			const entry = pending.get(id);
			if (entry) clearTimeout(entry.timer);
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
		isClosing = true;
		if (ws) {
			ws.close();
			ws = null;
		}
		for (const [, entry] of pending) {
			clearTimeout(entry.timer);
			entry.reject(new Error("transport closed"));
		}
		pending.clear();
		handlers.clear();
	}

	return { send, subscribe, close };
}

// ---------------------------------------------------------------------------
// A2A Client
// ---------------------------------------------------------------------------

export interface A2aClientOptions {
	transport: A2aTransport;
	/** Default request timeout in ms; default 5000. */
	timeoutMs?: number;
}

export class A2aClient {
	private readonly transport: A2aTransport;
	private readonly timeoutMs: number;
	private readonly subscriptions = new Map<
		string,
		Set<{ name: string; handler: (params: unknown) => unknown }>
	>();

	constructor(options: A2aClientOptions) {
		this.transport = options.transport;
		this.timeoutMs = options.timeoutMs ?? 5_000;
	}

	// --- Agent Card ---

	async getAgentCard(): Promise<AgentCard> {
		return this.call<AgentCard>("agent/getCard", {});
	}

	// --- Task Lifecycle ---

	async sendTask(params: TaskSendParams): Promise<Task> {
		return this.call<Task>("tasks/send", params);
	}

	async sendTaskSubscribe(params: TaskSendParams): Promise<Task> {
		return this.call<Task>("tasks/sendSubscribe", params);
	}

	async getTask(params: TaskQueryParams): Promise<Task> {
		return this.call<Task>("tasks/get", params);
	}

	async cancelTask(params: TaskCancelParams): Promise<Task> {
		return this.call<Task>("tasks/cancel", params);
	}

	// --- Push Notifications ---

	async setPushNotification(params: {
		taskId: string;
		config: TaskPushNotificationConfig;
	}): Promise<void> {
		await this.call<void>("tasks/pushNotification/set", params);
	}

	async getPushNotification(params: {
		taskId: string;
	}): Promise<TaskPushNotificationConfig | null> {
		return this.call<TaskPushNotificationConfig | null>("tasks/pushNotification/get", params);
	}

	// --- Subscriptions (server push) ---

	/**
	 * Subscribe to task status updates.
	 * Requires a transport that supports push (WebSocket).
	 */
	onTaskStatusUpdate(
		taskId: string,
		handler: (status: TaskStatus) => Promise<unknown> | unknown,
	): () => void {
		const method = `tasks/${taskId}/status`;
		let set = this.subscriptions.get(method);
		if (!set) {
			set = new Set();
			this.subscriptions.set(method, set);
			this.transport.subscribe?.(method, (params) => {
				const status = params as TaskStatus;
				const currentSet = this.subscriptions.get(method);
				if (!currentSet) return;
				for (const sub of currentSet) {
					if (sub.name === taskId) {
						const result = sub.handler(status);
						if (result && typeof (result as Promise<unknown>).then === "function") {
							void (result as Promise<unknown>).catch(() => {});
						}
					}
				}
			});
		}
		const subscription = { name: taskId, handler: handler as (params: unknown) => unknown };
		set.add(subscription);
		return () => {
			set.delete(subscription);
		};
	}

	/**
	 * Subscribe to task artifact updates.
	 */
	onTaskArtifactUpdate(
		taskId: string,
		handler: (artifact: TaskArtifact) => Promise<unknown> | unknown,
	): () => void {
		const method = `tasks/${taskId}/artifact`;
		let set = this.subscriptions.get(method);
		if (!set) {
			set = new Set();
			this.subscriptions.set(method, set);
			this.transport.subscribe?.(method, (params) => {
				const artifact = params as TaskArtifact;
				const currentSet = this.subscriptions.get(method);
				if (!currentSet) return;
				for (const sub of currentSet) {
					if (sub.name === taskId) {
						const result = sub.handler(artifact);
						if (result && typeof (result as Promise<unknown>).then === "function") {
							void (result as Promise<unknown>).catch(() => {});
						}
					}
				}
			});
		}
		const subscription = { name: taskId, handler: handler as (params: unknown) => unknown };
		set.add(subscription);
		return () => {
			set.delete(subscription);
		};
	}

	// --- Internal call helper ---

	private async call<T>(method: string, params: unknown): Promise<T> {
		return new Promise((resolve, reject) => {
			let settled = false;
			const timer = setTimeout(() => {
				if (settled) return;
				settled = true;
				reject(new Error(`${method} timed out after ${this.timeoutMs}ms`));
			}, this.timeoutMs);

			this.transport
				.send(method, params)
				.then((raw) => {
					if (settled) return;
					settled = true;
					clearTimeout(timer);
					// Handle both bare values and JSON-RPC envelopes
					if (raw && typeof raw === "object" && "jsonrpc" in raw) {
						const envelope = raw as JsonRpcResponse;
						if (envelope.error) {
							reject(
								new Error(
									`JSON-RPC error: ${envelope.error.message} (code: ${envelope.error.code})`,
								),
							);
						} else {
							resolve(envelope.result as T);
						}
					} else if (raw && typeof raw === "object" && "error" in raw) {
						reject(new Error(`Server error: ${(raw as { error: unknown }).error}`));
					} else {
						resolve(raw as T);
					}
				})
				.catch((e: unknown) => {
					if (settled) return;
					settled = true;
					clearTimeout(timer);
					reject(e);
				});
		});
	}

	async close(): Promise<void> {
		this.subscriptions.clear();
		await this.transport.close();
	}
}

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

export function createA2aHttpClient(
	options: CreateHttpTransportOptions & { timeoutMs?: number },
): A2aClient {
	return new A2aClient({
		transport: createHttpTransport(options),
		timeoutMs: options.timeoutMs,
	});
}

export function createA2aWebSocketClient(
	options: CreateWebSocketTransportOptions & { timeoutMs?: number },
): A2aClient {
	return new A2aClient({
		transport: createWebSocketTransport(options),
		timeoutMs: options.timeoutMs,
	});
}

// ---------------------------------------------------------------------------
// AgentCard builder helper
// ---------------------------------------------------------------------------

export interface BuildAgentCardOptions {
	name: string;
	description: string;
	url: string;
	version: string;
	skills: AgentSkill[];
	streaming?: boolean;
	pushNotifications?: boolean;
	authentication?: AgentCard["authentication"];
	defaultInputModes?: string[];
	defaultOutputModes?: string[];
}

export function buildAgentCard(options: BuildAgentCardOptions): AgentCard {
	return {
		name: options.name,
		description: options.description,
		url: options.url,
		version: options.version,
		capabilities: {
			streaming: options.streaming ?? false,
			pushNotifications: options.pushNotifications ?? false,
			stateTransitionHistory: false,
		},
		authentication: options.authentication,
		skills: options.skills,
		defaultInputModes: options.defaultInputModes ?? ["text"],
		defaultOutputModes: options.defaultOutputModes ?? ["text"],
	};
}

// ---------------------------------------------------------------------------
// Task builder helpers
// ---------------------------------------------------------------------------

export function createTaskMessage(role: "user" | "agent", text: string): TaskMessage {
	return {
		role,
		parts: [{ type: "text", text }],
	};
}

export function createTaskDataMessage(
	role: "user" | "agent",
	data: Record<string, unknown>,
	mimeType?: string,
): TaskMessage {
	return {
		role,
		parts: [{ type: "data", data, mimeType }],
	};
}

export function createTaskId(): string {
	return `task-${Date.now()}-${randomUUID().slice(0, 8)}`;
}
