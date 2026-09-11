import type {
	EngineConfig,
	ChatOptions,
	ModelInfo,
	EngineStatus,
	StreamChunk,
	Message,
} from "../types";
import { SippWorker } from "./sipp-worker";
import { ModelManager } from "./model-manager";
import { EventEmitter } from "../utils/events";
import { Logger } from "../utils/logger";

export class SippEngine extends EventEmitter {
	private worker: SippWorker | null = null;
	private modelManager: ModelManager;
	private config: EngineConfig;
	private status: EngineStatus = {
		ready: false,
		loading: false,
		modelLoaded: null,
		memoryUsage: 0,
		backend: "webgpu",
		error: null,
	};
	private logger: Logger;

	constructor(config: EngineConfig) {
		super();
		this.config = {
			backend: "webgpu",
			maxTokens: 2048,
			temperature: 0.7,
			topP: 0.9,
			...config,
		};
		this.modelManager = new ModelManager();
		this.logger = new Logger("SippEngine");
	}

	async init(): Promise<void> {
		try {
			this.logger.info("Initializing SippEngine...");
			this.emit("status", { ...this.status, loading: true });

			// WebGPU 지원 확인
			if (this.config.backend === "webgpu" && !(await this.isWebGPUSupported())) {
				this.logger.warn("WebGPU not supported, falling back to WASM");
				this.config.backend = "wasm";
			}

			// Worker 초기화
			this.worker = new SippWorker();
			await this.worker.init({
				backend: this.config.backend!,
			});

			// 이벤트 바인딩
			this.worker.on("ready", () => {
				this.logger.info("SippWorker ready");
				this.status.ready = true;
				this.status.loading = false;
				this.status.backend = this.config.backend!;
				this.emit("status", { ...this.status });
			});

			this.worker.on("error", (error: string) => {
				this.logger.error("Worker error:", error);
				this.status.error = error;
				this.status.loading = false;
				this.emit("error", new Error(error));
			});

			this.worker.on("stream", (chunk: StreamChunk) => {
				this.emit("stream", chunk);
			});

			this.worker.on("modelLoaded", (modelId: string) => {
				this.logger.info(`Model loaded: ${modelId}`);
				this.status.modelLoaded = modelId;
				this.status.loading = false;
				this.status.ready = true;
				this.emit("status", { ...this.status });
				this.emit("modelLoaded", modelId);
			});

		} catch (error) {
			this.logger.error("Init failed:", error);
			this.status.error = (error as Error).message;
			this.status.loading = false;
			throw error;
		}
	}

	async loadModel(modelId: string): Promise<void> {
		if (!this.worker) throw new Error("Engine not initialized");

		const model = await this.modelManager.getModel(modelId);
		if (!model) throw new Error(`Model ${modelId} not found`);

		this.logger.info(`Loading model: ${modelId}`);
		this.emit("status", { ...this.status, loading: true });

		try {
			// 모델 다운로드 (필요시)
			if (!model.downloaded) {
				this.logger.info(`Downloading model: ${modelId}`);
				await this.modelManager.downloadModel(modelId, (progress) => {
					this.emit("downloadProgress", { modelId, progress });
				});
			}

			// 모델 로드
			const modelPath = await this.modelManager.getModelPath(modelId);
			await this.worker.loadModel({
				path: modelPath,
				format: model.format,
			});

		} catch (error) {
			this.logger.error("Load model failed:", error);
			this.status.loading = false;
			this.status.error = (error as Error).message;
			throw error;
		}
	}

	async chat(message: string, options?: ChatOptions): Promise<string> {
		if (!this.worker || !this.status.ready) {
			throw new Error("Engine not ready");
		}

		return new Promise((resolve, reject) => {
			const messages: Message[] = [];

			if (this.config.systemPrompt) {
				messages.push({ role: "system", content: this.config.systemPrompt });
			}

			messages.push({ role: "user", content: message });

			let fullText = "";

			this.worker!.generate(messages, {
				maxTokens: this.config.maxTokens,
				temperature: this.config.temperature,
				topP: this.config.topP,
				stream: options?.stream,
				onToken: (token: string) => {
					fullText += token;
					options?.onToken?.(token);
				},
				onComplete: (text: string) => {
					options?.onComplete?.(text);
					resolve(text);
				},
				onError: (error: Error) => {
					options?.onError?.(error);
					reject(error);
				},
				signal: options?.signal,
			});
		});
	}

	stream(
		message: string,
		onToken: (token: string) => void,
		signal?: AbortSignal
	): void {
		if (!this.worker || !this.status.ready) {
			throw new Error("Engine not ready");
		}

		const messages: Message[] = [];

		if (this.config.systemPrompt) {
			messages.push({ role: "system", content: this.config.systemPrompt });
		}

		messages.push({ role: "user", content: message });

		this.worker.generate(messages, {
			maxTokens: this.config.maxTokens,
			temperature: this.config.temperature,
			topP: this.config.topP,
			stream: true,
			onToken,
			signal,
		});
	}

	async getModels(): Promise<ModelInfo[]> {
		return this.modelManager.listModels();
	}

	async unloadModel(): Promise<void> {
		if (!this.worker) return;

		this.logger.info("Unloading model...");
		await this.worker.unloadModel();
		this.status.modelLoaded = null;
		this.emit("status", { ...this.status });
	}

	getStatus(): EngineStatus {
		return { ...this.status };
	}

	async dispose(): Promise<void> {
		if (this.worker) {
			this.logger.info("Disposing SippEngine...");
			await this.worker.terminate();
			this.worker = null;
		}
		this.status.ready = false;
		this.status.modelLoaded = null;
		this.emit("status", { ...this.status });
	}

	private async isWebGPUSupported(): Promise<boolean> {
		if (!("gpu" in navigator)) return false;
		try {
			const adapter = await (navigator as any).gpu.requestAdapter();
			return adapter !== null;
		} catch {
			return false;
		}
	}
}
