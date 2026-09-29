import type { ChatOptions, EngineConfig, EngineStatus, Message, ModelInfo } from "../types";
import { EventEmitter } from "../utils/events";
import { Logger } from "../utils/logger";
import { OpenHydraDiscoveryImpl } from "./discovery";
import type {
	OpenHydraEngineConfig,
	OpenHydraNode,
	OpenHydraRequest,
	OpenHydraResponse,
} from "./protocol";

/**
 * OpenHydra P2P inference engine.
 *
 * Implements the same interface as OllamaEngine / CloudEngine / SippEngine
 * so it can be used as a drop-in fallback in the bitterbot engine chain.
 *
 * Unlike the single-endpoint engines, OpenHydra connects to multiple
 * peer nodes discovered via Kademlia/mDNS. If the primary node fails or
 * disconnects mid-stream, it transparently retries against the next
 * available node.
 */
export class OpenHydraEngine extends EventEmitter {
	private config: EngineConfig & OpenHydraEngineConfig;
	private status: EngineStatus = {
		ready: false,
		loading: false,
		modelLoaded: null,
		memoryUsage: 0,
		backend: "openhydra",
		error: null,
	};
	private logger: Logger;
	private discovery: OpenHydraDiscoveryImpl | null = null;
	private nodes: OpenHydraNode[] = [];
	private nodeCacheExpiryMs = 30_000;
	private lastDiscovery = 0;

	constructor(config: EngineConfig) {
		super();
		this.config = {
			maxTokens: 2048,
			temperature: 0.7,
			...config,
		} as EngineConfig & OpenHydraEngineConfig;
		this.logger = new Logger("OpenHydraEngine");
	}

	async init(): Promise<void> {
		this.logger.info("Initializing OpenHydraEngine...");
		this.status.loading = true;
		this.status.error = null;
		this.emit("status", { ...this.status });

		const bootstrap = this.config.bootstrap ?? this.config.endpoints ?? [];
		if (bootstrap.length === 0) {
			this.status.error = "No OpenHydra endpoints configured (set endpoint or bootstrap in config)";
			this.status.loading = false;
			this.emit("status", { ...this.status });
			throw new Error(this.status.error);
		}

		this.discovery = new OpenHydraDiscoveryImpl({
			bootstrap,
			discoveryTimeoutMs: this.config.discoveryTimeoutMs,
		});

		const discovered = await this.discoverNodes();
		if (discovered.length === 0) {
			this.status.error = "No OpenHydra nodes responded to discovery";
			this.status.loading = false;
			this.emit("status", { ...this.status });
			throw new Error(this.status.error);
		}

		this.status.ready = true;
		this.status.loading = false;
		this.logger.info(`OpenHydraEngine ready — ${discovered.length} node(s) discovered`);
		this.emit("status", { ...this.status });
	}

	async loadModel(modelId: string): Promise<void> {
		this.config.model = modelId;
		this.status.modelLoaded = modelId;
		this.emit("status", { ...this.status });
	}

	async chat(message: string, options?: ChatOptions): Promise<string> {
		if (!this.status.ready) {
			throw new Error("OpenHydraEngine not initialized — call init() first");
		}

		const messages: Message[] = [];
		if (this.config.systemPrompt) {
			messages.push({ role: "system", content: this.config.systemPrompt });
		}
		messages.push({ role: "user", content: message });

		const nodes = await this.getOrDiscoverNodes();
		if (nodes.length === 0) {
			throw new Error("No OpenHydra nodes available for chat");
		}

		let lastError: Error | null = null;
		for (const node of nodes) {
			try {
				return await this.chatFromNode(node.endpoint, messages, options);
			} catch (err: unknown) {
				lastError = err instanceof Error ? err : new Error(String(err));
				this.logger.warn(`Chat failed on node ${node.endpoint}:`, lastError.message);
				this.emit("error", lastError);
			}
		}

		throw new Error(`All OpenHydra nodes failed. Last error: ${lastError?.message ?? "unknown"}`);
	}

	private async chatFromNode(
		endpoint: string,
		messages: Message[],
		options?: ChatOptions,
	): Promise<string> {
		const response = await fetch(endpoint, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
				method: "chat",
				params: {
					model: this.config.model ?? "gpt-3.5-turbo",
					messages,
					stream: false,
					maxTokens: this.config.maxTokens,
					temperature: this.config.temperature,
					topP: this.config.topP,
					systemPrompt: this.config.systemPrompt,
				},
			} satisfies OpenHydraRequest),
			signal: options?.signal,
		});

		if (!response.ok) {
			throw new Error(`OpenHydra HTTP ${response.status}`);
		}

		const data = (await response.json()) as OpenHydraResponse;
		if (data.error) {
			throw new Error(`OpenHydra error: ${data.error.message}`);
		}

		const result = data.result as { text?: string; token?: string };
		const text = result?.text ?? result?.token ?? "";
		return text;
	}

	stream(message: string, onToken: (token: string) => void, signal?: AbortSignal): void {
		if (!this.status.ready) {
			throw new Error("OpenHydraEngine not initialized — call init() first");
		}

		const messages: Message[] = [];
		if (this.config.systemPrompt) {
			messages.push({ role: "system", content: this.config.systemPrompt });
		}
		messages.push({ role: "user", content: message });

		const requestInit: RequestInit = {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: `stream-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
				method: "chat",
				params: {
					model: this.config.model ?? "gpt-3.5-turbo",
					messages,
					stream: true,
					maxTokens: this.config.maxTokens,
					temperature: this.config.temperature,
					topP: this.config.topP,
					systemPrompt: this.config.systemPrompt,
				},
			} satisfies OpenHydraRequest),
			signal,
		};

		this.streamWithFallback(messages, onToken, signal, requestInit);
	}

	private async streamWithFallback(
		messages: Message[],
		onToken: (token: string) => void,
		signal: AbortSignal | undefined,
		requestInit: RequestInit,
	): Promise<void> {
		const nodes = await this.getOrDiscoverNodes();
		if (nodes.length === 0) {
			this.emit("error", new Error("No OpenHydra nodes available for streaming"));
			return;
		}

		for (const node of nodes) {
			if (signal?.aborted) return;

			try {
				await this.streamFromNode(node.endpoint, requestInit, onToken, signal);
				return;
			} catch (err: unknown) {
				const msg = err instanceof Error ? err.message : String(err);
				this.logger.warn(`Stream failed on node ${node.endpoint}:`, msg);
				this.emit("error", err instanceof Error ? err : new Error(msg));
			}
		}

		this.emit("error", new Error("All OpenHydra nodes failed for streaming"));
	}

	private async streamFromNode(
		endpoint: string,
		requestInit: RequestInit,
		onToken: (token: string) => void,
		signal?: AbortSignal,
	): Promise<void> {
		const response = await fetch(endpoint, requestInit);

		if (!response.ok) {
			throw new Error(`OpenHydra stream HTTP ${response.status}`);
		}

		if (!response.body) {
			throw new Error("Response body is null");
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let fullText = "";

		try {
			while (true) {
				if (signal?.aborted) {
					reader.releaseLock();
					return;
				}

				const { done, value } = await reader.read();
				if (done) break;

				const text = decoder.decode(value, { stream: true });
				const lines = text.split("\n").filter((l) => l.trim());

				for (const line of lines) {
					try {
						const data = JSON.parse(line) as OpenHydraResponse;
						if (data.error) {
							throw new Error(`OpenHydra error: ${data.error.message}`);
						}
						const result = data.result as { token?: string; text?: string; done?: boolean };
						if (result?.token) {
							onToken(result.token);
							fullText += result.token;
						} else if (result?.text) {
							onToken(result.text);
							fullText += result.text;
						}
						if (result?.done) break;
					} catch {
						// skip invalid JSON lines
					}
				}
			}
		} finally {
			reader.releaseLock();
		}
	}

	async getModels(): Promise<ModelInfo[]> {
		if (!this.status.ready) {
			throw new Error("OpenHydraEngine not initialized — call init() first");
		}

		const nodes = await this.getOrDiscoverNodes();
		if (nodes.length === 0) {
			return [];
		}

		for (const node of nodes) {
			try {
				const response = await fetch(node.endpoint, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						jsonrpc: "2.0",
						id: `models-${Date.now()}`,
						method: "models",
						params: { model: this.config.model ?? "" },
					} satisfies OpenHydraRequest),
				});

				if (!response.ok) continue;

				const data = (await response.json()) as OpenHydraResponse;
				if (data.error) continue;

				const result = data.result as { models?: Array<{ name: string; size?: number }> };
				if (!result?.models) continue;

				return result.models.map((m) => ({
					id: m.name,
					name: m.name,
					size: m.size ?? 0,
					format: "gguf",
					parameters: "unknown",
					quantization: "unknown",
					downloaded: true,
					downloadedBytes: m.size ?? 0,
				}));
			} catch (err: unknown) {
				this.logger.warn(
					`getModels failed on node ${node.endpoint}:`,
					err instanceof Error ? err.message : String(err),
				);
			}
		}

		return [];
	}

	async unloadModel(): Promise<void> {
		this.status.modelLoaded = null;
		this.emit("status", { ...this.status });
	}

	getStatus(): EngineStatus {
		return { ...this.status };
	}

	async dispose(): Promise<void> {
		this.status.ready = false;
		this.status.modelLoaded = null;
		this.status.loading = false;
		this.nodes = [];
		this.discovery = null;
		this.emit("status", { ...this.status });
	}

	private async discoverNodes(): Promise<OpenHydraNode[]> {
		if (!this.discovery) return [];
		const nodes = await this.discovery.discover();
		this.nodes = nodes;
		this.lastDiscovery = Date.now();
		return nodes;
	}

	private async getOrDiscoverNodes(): Promise<OpenHydraNode[]> {
		if (this.nodes.length > 0 && Date.now() - this.lastDiscovery < this.nodeCacheExpiryMs) {
			return this.nodes;
		}
		return this.discoverNodes();
	}
}
