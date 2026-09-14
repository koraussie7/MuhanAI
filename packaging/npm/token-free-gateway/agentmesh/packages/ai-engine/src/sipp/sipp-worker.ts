import type { Message, StreamChunk } from "../types";

interface WorkerConfig {
	backend: "webgpu" | "wasm" | "cpu";
}

interface GenerateOptions {
	maxTokens?: number;
	temperature?: number;
	topP?: number;
	topK?: number;
	stream?: boolean;
	onToken?: (token: string) => void;
	onComplete?: (text: string) => void;
	onError?: (error: Error) => void;
	signal?: AbortSignal;
}

type EventHandler = (...args: any[]) => void;

export class SippWorker {
	private worker: Worker | null = null;
	private messageId = 0;
	private pending = new Map<
		number,
		{
			onToken?: (token: string) => void;
			onComplete?: (text: string) => void;
			onError?: (error: Error) => void;
		}
	>();
	private eventHandlers = new Map<string, Set<EventHandler>>();

	async init(config: WorkerConfig): Promise<void> {
		this.worker = new Worker(new URL("./sipp-worker-impl.ts", import.meta.url), {
			type: "module",
		});

		this.worker.onmessage = (e) => this.handleMessage(e.data);
		this.worker.onerror = (e) => this.handleError(e);

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => reject(new Error("Worker init timeout")), 30000);

			const handler = (e: MessageEvent) => {
				if (e.data.type === "ready") {
					clearTimeout(timeout);
					this.worker!.removeEventListener("message", handler);
					this.worker!.onmessage = (e) => this.handleMessage(e.data);
					resolve();
				}
			};

			this.worker!.addEventListener("message", handler);
			this.worker!.postMessage({ type: "init", config });
		});
	}

	async loadModel(config: { path: string; format: string }): Promise<void> {
		return this.postMessage("loadModel", config);
	}

	generate(messages: Message[], options: GenerateOptions): void {
		const id = ++this.messageId;
		this.pending.set(id, {
			onToken: options.onToken,
			onComplete: options.onComplete,
			onError: options.onError,
		});

		// onToken/onComplete/onError 함수와 AbortSignal은 structured-clone이
		// 불가능하다. 콜백은 위 pending 맵에서 라우팅되므로 전송 페이로드에는
		// 복제 가능한 값만 담는다. (DataCloneError 수정)
		const wireOptions = {
			maxTokens: options.maxTokens,
			temperature: options.temperature,
			topP: options.topP,
			topK: options.topK,
			stream: options.stream,
		};
		this.postMessage("generate", { id, messages, options: wireOptions });
	}

	async unloadModel(): Promise<void> {
		return this.postMessage("unloadModel", {});
	}

	async terminate(): Promise<void> {
		if (this.worker) {
			this.worker.terminate();
			this.worker = null;
		}
		this.pending.clear();
	}

	on(event: string, handler: EventHandler): void {
		if (!this.eventHandlers.has(event)) {
			this.eventHandlers.set(event, new Set());
		}
		this.eventHandlers.get(event)!.add(handler);
	}

	off(event: string, handler: EventHandler): void {
		this.eventHandlers.get(event)?.delete(handler);
	}

	private emit(event: string, ...args: any[]): void {
		this.eventHandlers.get(event)?.forEach((h) => h(...args));
	}

	private handleMessage(data: any) {
		switch (data.type) {
			case "token":
				this.pending.get(data.id)?.onToken?.(data.token);
				break;
			case "complete":
				this.pending.get(data.id)?.onComplete?.(data.text);
				this.pending.delete(data.id);
				break;
			case "error":
				this.pending.get(data.id)?.onError?.(new Error(data.error));
				this.pending.delete(data.id);
				break;
			case "modelLoaded":
				this.emit("modelLoaded", data.modelId);
				break;
			case "progress":
				this.emit("progress", data.progress);
				break;
		}
	}

	private handleError(error: ErrorEvent) {
		this.pending.forEach((callbacks) => {
			callbacks.onError?.(new Error(error.message));
		});
		this.pending.clear();
	}

	private postMessage(type: string, payload: any): Promise<void> {
		return new Promise((resolve, reject) => {
			const id = ++this.messageId;

			const handler = (e: MessageEvent) => {
				if (e.data.id === id) {
					this.worker!.removeEventListener("message", handler);
					if (e.data.error) {
						reject(new Error(e.data.error));
					} else {
						resolve(e.data.result);
					}
				}
			};

			this.worker!.addEventListener("message", handler);
			this.worker!.postMessage({ type, id, ...payload });
		});
	}
}
