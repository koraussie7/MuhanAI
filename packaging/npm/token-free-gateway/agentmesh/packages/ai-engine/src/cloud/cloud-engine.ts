import type { EngineConfig, ChatOptions, ModelInfo, EngineStatus, Message } from "../types";
import { EventEmitter } from "../utils/events";
import { Logger } from "../utils/logger";

export class CloudEngine extends EventEmitter {
	private config: EngineConfig;
	private status: EngineStatus = {
		ready: false,
		loading: false,
		modelLoaded: null,
		memoryUsage: 0,
		backend: "cloud",
		error: null,
	};
	private logger: Logger;

	constructor(config: EngineConfig) {
		super();
		this.config = {
			maxTokens: 2048,
			temperature: 0.7,
			...config,
		};
		this.logger = new Logger("CloudEngine");
	}

	async init(): Promise<void> {
		this.logger.info("Initializing CloudEngine...");
		this.status.ready = true;
		this.emit("status", { ...this.status });
	}

	async loadModel(modelId: string): Promise<void> {
		this.config.model = modelId;
		this.status.modelLoaded = modelId;
		this.emit("status", { ...this.status });
	}

	async chat(message: string, options?: ChatOptions): Promise<string> {
		const messages: Message[] = [];
		if (this.config.systemPrompt) {
			messages.push({ role: "system", content: this.config.systemPrompt });
		}
		messages.push({ role: "user", content: message });

		this.logger.info("Cloud chat request:", { model: this.config.model, messages });

		// TODO: Implement actual cloud API call
		throw new Error("CloudEngine.chat not implemented");
	}

	stream(message: string, onToken: (token: string) => void, signal?: AbortSignal): void {
		throw new Error("CloudEngine.stream not implemented");
	}

	async getModels(): Promise<ModelInfo[]> {
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
		this.emit("status", { ...this.status });
	}
}
