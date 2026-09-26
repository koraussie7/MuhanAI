export type ManifestSource =
	| { kind: "hf"; repo: string; file: string; revision?: string; integrity?: string }
	| { kind: "https"; url: string; integrity?: string }
	| { kind: "mesh"; peer: string; contentId: string };

/**
 * Per-file content hashes carried by a manifest. The bytes are checked
 * against these on download; sources are interchangeable once `contentId`
 * matches. `merkleRoot` is optional and only present for chunked files
 * (mirrors noema-atlas's per-leaf Merkle root).
 *
 * `algorithm` mirrors noema-atlas / zest terminology:
 *   - "blake3" — chunk-level, 32 bytes, the default for new manifests
 *   - "sha256" — file-level, 32 bytes, mirrors zest xorb reconstruction
 */
export type ContentHashAlgorithm = "blake3" | "sha256";

export interface ContentHashes {
	algorithm: ContentHashAlgorithm;
	sha256?: string;
	blake3?: string;
	merkleRoot?: string;
}

export interface ModelManifest {
	id: string;
	name: string;
	description?: string;
	license?: string;
	quantization?: string;
	sizeBytes: number;
	contentId: string;
	hashes: ContentHashes;
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
