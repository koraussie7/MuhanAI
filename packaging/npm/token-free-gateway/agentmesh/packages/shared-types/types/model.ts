/** Model manifest — the P2P-advertisable model metadata shape. */

export type ModelFormat = "GGUF" | "Safetensors" | "ONNX" | "PyTorch";

export interface ModelManifest {
	id: string;
	name: string;
	format: ModelFormat;
	sizeBytes: number;
	quantization?: string;
	languages: string[];
	license: string;
	/** Content hash — the integrity check for every peer download. */
	hash: string;
	/** Peer ids currently seeding this model. */
	peers: string[];
}
