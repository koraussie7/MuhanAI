// packages/knowledge-base/src/p2p-memory/memwal-bridge.ts
import type { MemoryEntry, MemwalConfig, Store } from "./types";
import { IPFSMemoryStore } from "./ipfs-store";

export class MemwalIPFSBridge implements Store {
  private ipfsStore: IPFSMemoryStore;
  private agentId: string;

  constructor(config: MemwalConfig) {
    this.agentId = config.agentId;
    this.ipfsStore = new IPFSMemoryStore({
      endpoint: config.ipfsEndpoint,
      repo: `muhanai-${config.agentId}`,
      gunPeers: config.fellowshipPeers,
    });
  }

  async getNamespace(): Promise<string> {
    return this.agentId;
  }

  async set(key: string, value: any): Promise<void> {
    const entry: MemoryEntry = {
      key,
      value,
      namespace: this.agentId,
      timestamp: Date.now(),
    };
    await this.ipfsStore.put(`${this.agentId}:${key}`, entry);
  }

  async get<T = any>(key: string): Promise<T | undefined> {
    const entry = await this.ipfsStore.get(`${this.agentId}:${key}`);
    return entry?.value as T | undefined;
  }

  async delete(key: string): Promise<void> {
    await this.ipfsStore.delete(`${this.agentId}:${key}`);
  }

  async list(prefix = ""): Promise<string[]> {
    const keys = await this.ipfsStore.list();
    return keys
      .filter(k => k.startsWith(`${this.agentId}:${prefix}`))
      .map(k => k.replace(`${this.agentId}:`, ""));
  }

  async getAll(): Promise<Record<string, any>> {
    const keys = await this.list();
    const result: Record<string, any> = {};
    for (const key of keys) {
      const val = await this.get(key);
      if (val !== undefined) result[key] = val;
    }
    return result;
  }
}
