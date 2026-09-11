import type { EngineConfig, ChatOptions, ModelInfo, EngineStatus, Message } from "../types";
import { EventEmitter } from "../utils/events";
import { Logger } from "../utils/logger";

export class OllamaEngine extends EventEmitter {
	private config: EngineConfig;
	private status: EngineStatus = {
		ready: false,
		loading: false,
		modelLoaded: null,
		memoryUsage: 0,
		backend: "ollama",
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
		this.logger = new Logger("OllamaEngine");
	}

	async init(): Promise<void> {
		this.logger.info("Initializing OllamaEngine...");
		this.emit("status", { ...this.status, loading: true });

		try {
			const response = await fetch(`${this.config.endpoint}/api/tags`);
			if (!response.ok) throw new Error("Ollama server not reachable");

			this.status.ready = true;
			this.status.loading = false;
			this.emit("status", { ...this.status });
		} catch (error) {
			this.status.error = (error as Error).message;
			this.status.loading = false;
			throw error;
		}
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

		const response = await fetch(`${this.config.endpoint}/api/chat`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model: this.config.model,
				messages,
				stream: false,
				options: {
					temperature: this.config.temperature,
					top_p: this.config.topP,
					num_predict: this.config.maxTokens,
				},
			}),
		});

		if (!response.ok) throw new Error(`Ollama request failed: ${response.status}`);

		const data = (await response.json()) as { message?: { content?: string } };
		return data.message?.content || "";
	}

	stream(message: string, onToken: (token: string) => void, signal?: AbortSignal): void {
		const messages: Message[] = [];
		if (this.config.systemPrompt) {
			messages.push({ role: "system", content: this.config.systemPrompt });
		}
		messages.push({ role: "user", content: message });

		fetch(`${this.config.endpoint}/api/chat`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model: this.config.model,
				messages,
				stream: true,
				options: {
					temperature: this.config.temperature,
					top_p: this.config.topP,
					num_predict: this.config.maxTokens,
				},
			}),
			signal,
		}).then(async (response) => {
			const reader = response.body!.getReader();
			const decoder = new TextDecoder();

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				const text = decoder.decode(value);
				const lines = text.split("\n").filter((l) => l.trim());

				for (const line of lines) {
					try {
						const data = JSON.parse(line);
						if (data.message?.content) {
							onToken(data.message.content);
						}
					} catch {
						// skip invalid JSON
					}
				}
			}
		});
	}

	async getModels(): Promise<ModelInfo[]> {
		const response = await fetch(`${this.config.endpoint}/api/tags`);
		const data = (await response.json()) as { models?: any[] };

		return (data.models || []).map((m: any) => ({
			id: m.name,
			name: m.name,
			size: m.size,
			format: "gguf",
			parameters: "unknown",
			quantization: "unknown",
			downloaded: true,
			downloadedBytes: m.size,
		}));
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
