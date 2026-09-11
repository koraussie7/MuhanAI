import type { ModelInfo } from "../types";

declare global {
	interface Navigator {
		storage?: {
			getDirectory(): Promise<FileSystemDirectoryHandle>;
		};
	}
}

const MUHANAI_MODELS: ModelInfo[] = [
	{
		id: "llama-3-8b-q4",
		name: "Llama 3 8B (Q4_K_M)",
		size: 4_660_000_000,
		format: "gguf",
		parameters: "8B",
		quantization: "Q4_K_M",
		downloaded: false,
		downloadedBytes: 0,
	},
	{
		id: "phi-3-mini-q4",
		name: "Phi-3 Mini (Q4_K_M)",
		size: 2_300_000_000,
		format: "gguf",
		parameters: "3.8B",
		quantization: "Q4_K_M",
		downloaded: false,
		downloadedBytes: 0,
	},
	{
		id: "qwen-2.5-7b-q4",
		name: "Qwen 2.5 7B (Q4_K_M)",
		size: 4_660_000_000,
		format: "gguf",
		parameters: "7B",
		quantization: "Q4_K_M",
		downloaded: false,
		downloadedBytes: 0,
	},
];

export class ModelManager {
	private opfsRoot: FileSystemDirectoryHandle | null = null;
	private modelsDir: FileSystemDirectoryHandle | null = null;

	async init(): Promise<void> {
		const storage = await (navigator as any).storage.getDirectory();
		this.opfsRoot = storage;
		this.modelsDir = await this.opfsRoot!.getDirectoryHandle("models", { create: true });
	}

	async listModels(): Promise<ModelInfo[]> {
		await this.init();

		const models: ModelInfo[] = [];

		for (const model of MUHANAI_MODELS) {
			try {
				await this.modelsDir!.getFileHandle(`${model.id}.gguf`);
				models.push({ ...model, downloaded: true, downloadedBytes: model.size });
			} catch {
				models.push(model);
			}
		}

		return models;
	}

	async getModel(id: string): Promise<ModelInfo | null> {
		return MUHANAI_MODELS.find((m) => m.id === id) || null;
	}

	async downloadModel(
		id: string,
		onProgress?: (progress: number) => void
	): Promise<string> {
		await this.init();

		const model = await this.getModel(id);
		if (!model) throw new Error(`Model ${id} not found`);

		const url = `https://huggingface.co/${id}/resolve/main/model.gguf`;
		const response = await fetch(url);

		if (!response.ok) throw new Error(`Download failed: ${response.status}`);

		const fileHandle = await this.modelsDir!.getFileHandle(`${id}.gguf`, { create: true });
		const writable = await fileHandle.createWritable();

		const reader = response.body!.getReader();
		const contentLength = parseInt(response.headers.get("content-length") || "0");
		let downloaded = 0;

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			await writable.write(value);
			downloaded += value.length;

			if (onProgress && contentLength) {
				onProgress(downloaded / contentLength);
			}
		}

		await writable.close();
		return `opfs://models/${id}.gguf`;
	}

	async deleteModel(id: string): Promise<void> {
		await this.init();
		await this.modelsDir!.removeEntry(`${id}.gguf`);
	}

	async getModelPath(id: string): Promise<string> {
		return `opfs://models/${id}.gguf`;
	}
}
