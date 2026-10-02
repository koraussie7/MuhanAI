// packages/knowledge-base/src/visuals/colibri-metrics.ts
export interface ColibriMetrics {
  memory: {
    used: number;      // MB
    total: number;     // MB
    wasmHeap: number;  // MB
    jsHeap: number;    // MB
  };
  inference: {
    tokensPerSecond: number;
    latencyMs: number;
    batchSize: number;
  };
  p2p: {
    peers: number;
    downloadMbps: number;
    uploadMbps: number;
    chunksCached: number;
    cacheHitRate: number;
  };
  model: {
    cid: string;
    name: string;
    loaded: boolean;
    quantization: string;
    fileSize: number;
  };
}

export interface PeerMetrics {
  id: string;
  region: string;
  type: "browser" | "fellowship" | "gateway";
  connected: boolean;
  downloadMbps: number;
  uploadMbps: number;
  sharedChunks: number;
  lastSeen: number;
}

export interface ModelChunkMetrics {
  cid: string;
  index: number;
  size: number;
  status: "cached" | "downloading" | "pending" | "error";
  peerCount: number;
  downloadSpeed: number;
  estimatedTime: number;
}
