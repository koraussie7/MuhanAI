export type ManifestSource =
	| { kind: "hf"; repo: string; file: string; revision?: string }
	| { kind: "https"; url: string; integrity?: string }
	| { kind: "mesh"; peer: string; contentId: string };

export interface ModelManifest {
	id: string;
	name: string;
	description?: string;
	license?: string;
	quantization?: string;
	sizeBytes: number;
	contentId: string;
	sources: ManifestSource[];
	signature?: string;
	createdAt: string;
}

export interface ModelSearchRequest {
	query: string;
	limit?: number;
	sources?: Array<"hf" | "mesh" | "https">;
}

export interface ModelSearchResult {
	manifests: ModelManifest[];
	source: "hf" | "mesh" | "local" | "hybrid";
}

export interface DownloadRequest {
	manifestId: string;
	destination?: string;
	sources?: ManifestSource[];
	priority?: "speed" | "privacy" | "balanced";
}

export interface DownloadStatus {
	manifestId: string;
	state: "queued" | "downloading" | "verifying" | "complete" | "failed";
	progress: number;
	bytesTransferred: number;
	totalBytes: number;
	activePeers: number;
	error?: string;
}

export interface BroadcastRequest {
	manifestId: string;
	filePath: string;
	license: string;
	private?: boolean;
}
