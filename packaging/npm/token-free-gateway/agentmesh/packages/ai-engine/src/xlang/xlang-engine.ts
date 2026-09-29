import type { ChatOptions, EngineConfig, EngineStatus, ModelInfo } from "../types";
import { EventEmitter } from "../utils/events";
import { Logger } from "../utils/logger";
import { type XLangChatOptions, XLangClient } from "./client";
import type { XLangPeerInfo } from "./protocol";

export class XLangEngine extends EventEmitter {
	private readonly config: EngineConfig;
	private readonly logger: Logger;
	private client: XLangClient | null = null;
	private peerInfo: XLangPeerInfo | null = null;
	private status: EngineStatus = {
		ready: false,
		loading: false,
		modelLoaded: null,
		memoryUsage: 0,
		backend: "xlang",
		error: null,
	};

	constructor(config: EngineConfig) {
		super();
		this.config = { maxTokens: 2048, temperature: 0.7, ...config };
		this.logger = new Logger("XLangEngine");
	}

	async init(): Promise<void> {
		const endpoint = this.config.endpoint ?? this.config.endpoints?.[0];
		if (!endpoint) throw new Error("XLang endpoint is required");
		this.status.loading = true;
		this.emit("status", { ...this.status });
		try {
			this.client = new XLangClient({ endpoint, timeoutMs: this.config.discoveryTimeoutMs });
			if (!(await this.client.health())) throw new Error("XLang peer is not healthy");
			this.peerInfo = await this.client.capabilities();
			this.status.ready = true;
			this.status.loading = false;
			this.status.error = null;
			this.emit("status", { ...this.status });
		} catch (error) {
			this.status.loading = false;
			this.status.error = error instanceof Error ? error.message : String(error);
			this.emit("status", { ...this.status });
			throw error;
		}
	}

	async loadModel(modelId: string): Promise<void> {
		this.config.model = modelId;
		this.status.modelLoaded = modelId;
		this.emit("status", { ...this.status });
	}

	async chat(message: string, options?: ChatOptions): Promise<string> {
		if (!this.client || !this.status.ready) throw new Error("XLangEngine is not ready");
		const chatOptions: XLangChatOptions = {
			model: this.config.model,
			stream: options?.stream,
			signal: options?.signal,
		};
		try {
			const text = await this.client.chat(message, chatOptions);
			options?.onComplete?.(text);
			return text;
		} catch (error) {
			const normalized = error instanceof Error ? error : new Error(String(error));
			options?.onError?.(normalized);
			this.status.error = normalized.message;
			this.emit("error", normalized);
			throw normalized;
		}
	}

	stream(message: string, onToken: (token: string) => void, signal?: AbortSignal): void {
		void this.chat(message, { stream: true, signal, onToken }).catch(() => undefined);
	}

	async execute(workflow: unknown, signal?: AbortSignal): Promise<unknown> {
		if (!this.client || !this.status.ready) throw new Error("XLangEngine is not ready");
		return this.client.execute(workflow, signal);
	}

	async getModels(): Promise<ModelInfo[]> {
		return (this.peerInfo?.models ?? []).map((id) => ({
			id,
			name: id,
			size: 0,
			format: "gguf",
			parameters: "unknown",
			quantization: "unknown",
			downloaded: false,
			downloadedBytes: 0,
		}));
	}

	getPeerInfo(): XLangPeerInfo | null {
		return this.peerInfo;
	}

	async unloadModel(): Promise<void> {
		this.status.modelLoaded = null;
		this.emit("status", { ...this.status });
	}

	getStatus(): EngineStatus {
		return { ...this.status };
	}

	async dispose(): Promise<void> {
		this.client = null;
		this.peerInfo = null;
		this.status.ready = false;
		this.status.modelLoaded = null;
		this.emit("status", { ...this.status });
	}
}
