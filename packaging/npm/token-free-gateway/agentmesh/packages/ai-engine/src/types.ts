export interface EngineConfig {
	type: "sipp" | "ollama" | "cloud";
	model?: string;
	backend?: "webgpu" | "wasm" | "cpu";
	endpoint?: string;
	maxTokens?: number;
	temperature?: number;
	topP?: number;
	systemPrompt?: string;
}

export interface ChatOptions {
	stream?: boolean;
	onToken?: (token: string) => void;
	onComplete?: (fullText: string) => void;
	onError?: (error: Error) => void;
	signal?: AbortSignal;
}

export interface ModelInfo {
	id: string;
	name: string;
	size: number;
	format: "gguf" | "onnx" | "safetensors";
	parameters: string;
	quantization: string;
	downloaded: boolean;
	downloadedBytes: number;
}

export interface EngineStatus {
	ready: boolean;
	loading: boolean;
	modelLoaded: string | null;
	memoryUsage: number;
	backend: string;
	error: string | null;
}

export interface Message {
	role: "system" | "user" | "assistant";
	content: string;
}

export interface GenerationConfig {
	maxTokens: number;
	temperature: number;
	topP: number;
	topK: number;
	repeatPenalty: number;
	seed: number;
	stopSequences: string[];
}

export interface StreamChunk {
	token: string;
	done: boolean;
	fullText?: string;
	stats?: {
		tokensPerSecond: number;
		totalTokens: number;
		elapsedMs: number;
	};
}
