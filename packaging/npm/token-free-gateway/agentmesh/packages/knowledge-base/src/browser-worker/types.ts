// packages/knowledge-base/src/browser-worker/types.ts
export interface WorkerMessage {
  type: string;
  id: string;
  payload?: any;
}

export interface InferenceRequest extends WorkerMessage {
  type: "infer";
  payload: {
    prompt: string;
    modelCid: string;
    agentId: string;
  };
}

export interface InferenceResponse extends WorkerMessage {
  type: "token" | "complete" | "error";
  payload: {
    token?: string;
    result?: string;
    error?: string;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  };
}

export interface ModelLoadRequest extends WorkerMessage {
  type: "load-model";
  payload: {
    modelCid: string;
    modelSize: number;
    chunkSize: number;
  };
}

export interface ModelLoadResponse extends WorkerMessage {
  type: "model-loaded" | "progress" | "error";
  payload: {
    progress?: number;
    bytesLoaded?: number;
    totalBytes?: number;
    error?: string;
  };
}

export interface MemoryStoreRequest extends WorkerMessage {
  type: "store-memory" | "retrieve-memory" | "sync-memory";
  payload: {
    agentId: string;
    key?: string;
    value?: any;
  };
}

export interface HybridStorageConfig {
  p2p: {
    announce: string[];
    maxPeers: number;
  };
  ipfs: {
    gateways: string[];
    pinner: string;
  };
  cache: {
    maxSize: number;
    ttlMs: number;
  };
}

export interface StorageTier {
  hot: Set<string>;     // P2P 브라우저 간 실시간 공유
  warm: Set<string>;    // Fellowship 노드 캐시
  cold: Set<string>;    // IPFS 영구 저장
}
