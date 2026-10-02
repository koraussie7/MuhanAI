// packages/knowledge-base/src/p2p-memory/types.ts
export interface MemoryEntry {
  key: string;
  value: any;
  namespace: string;
  timestamp: number;
}

export interface MemwalConfig {
  agentId: string;
  ipfsEndpoint: string;
  fellowshipPeers: string[];
  gunPeers: string[];
}

export interface Store {
  getNamespace(): Promise<string>;
  set(key: string, value: any): Promise<void>;
  get<T = any>(key: string): Promise<T | undefined>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
  getAll(): Promise<Record<string, any>>;
}
