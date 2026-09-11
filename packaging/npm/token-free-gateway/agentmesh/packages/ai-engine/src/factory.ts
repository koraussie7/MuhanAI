import { SippEngine } from "./sipp/sipp-engine";
import { OllamaEngine } from "./ollama/ollama-engine";
import { CloudEngine } from "./cloud/cloud-engine";
import type { EngineConfig } from "./types";

export type EngineType = "sipp" | "ollama" | "cloud";

export class AIEngineFactory {
	static create(config: EngineConfig) {
		switch (config.type) {
			case "sipp":
				return new SippEngine(config);
			case "ollama":
				return new OllamaEngine(config);
			case "cloud":
				return new CloudEngine(config);
			default:
				throw new Error(`Unknown engine type: ${config.type as string}`);
		}
	}

	static createDefault(): SippEngine {
		return new SippEngine({
			type: "sipp",
			backend: "webgpu",
			model: "llama-3-8b-q4",
			maxTokens: 2048,
			temperature: 0.7,
		});
	}

	static createForElectron(): OllamaEngine {
		return new OllamaEngine({
			type: "ollama",
			model: "llama3:8b",
			endpoint: "http://localhost:11434",
		});
	}
}
