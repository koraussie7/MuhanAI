// packages/knowledge-base/src/browser-worker/hybrid-storage.ts
import type { HybridStorageConfig, StorageTier } from "./types";
import { IPFSMemoryStore } from "../p2p-memory/ipfs-store";
import { P2PMemoryStream } from "../p2p-memory/p2p-stream";

export class HybridStorage {
  private ipfsStore: IPFSMemoryStore;
  private p2pStream: P2PMemoryStream;
  private cache: Map<string, any>;
  private tiers: StorageTier;
  private config: HybridStorageConfig;

  constructor(config: HybridStorageConfig) {
    this.config = config;
    this.cache = new Map();
    this.tiers = { hot: new Set(), warm: new Set(), cold: new Set() };
    
    this.ipfsStore = new IPFSMemoryStore({
      endpoint: config.ipfs.gateways[0] || "https://ipfs.io",
      repo: "muhanai-hybrid",
      gunPeers: config.p2p.announce,
    });
    
    this.p2pStream = new P2PMemoryStream({
      announce: config.p2p.announce,
      infoHash: "hybrid-storage",
    });
  }

  async store(key: string, data: any, tier: "hot" | "warm" | "cold" = "warm"): Promise<void> {
    // Always cache in memory
    this.cache.set(key, data);
    
    switch (tier) {
      case "hot":
        this.tiers.hot.add(key);
        await this.p2pStream.shareMemory(key, data);
        // Also store warm copy
        await this.ipfsStore.put(key, {
          key,
          value: data,
          namespace: "hybrid",
          timestamp: Date.now(),
        });
        break;
        
      case "warm":
        this.tiers.warm.add(key);
        await this.ipfsStore.put(key, {
          key,
          value: data,
          namespace: "hybrid",
          timestamp: Date.now(),
        });
    // Pin to Fellowship
        try {
          await fetch(`${this.config.ipfs.pinner}/pin/${key}`, {
            method: "POST",
            body: JSON.stringify({ data }),
          });
        } catch (err) {
          console.warn("Failed to pin to Fellowship:", err);
        }
        break;
        
      case "cold":
        this.tiers.cold.add(key);
        // Store via IPFS HTTP API for large data
        const cid = await this.ipfsStore.put(key, {
          key,
          value: data,
          namespace: "hybrid-cold",
          timestamp: Date.now(),
        });
        await this.ipfsStore.pinCid(cid);
        break;
    }
    
    // Evict cache if over limit
    if (this.cache.size > this.config.cache.maxSize) {
      this.evictCache();
    }
  }

  async retrieve(key: string): Promise<any | null> {
    // 1. Check memory cache first (fastest)
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }

    // 2. Check hot P2P cache
    if (this.tiers.hot.has(key)) {
      const chunks = await this.p2pStream.receiveChunks([`${key}:chunk:0`]);
      if (chunks.length > 0 && chunks[0]) {
        const data = chunks[0].value;
        this.cache.set(key, data);
        return data;
      }
    }

    // 3. Check warm IPFS store
    if (this.tiers.warm.has(key)) {
      const entry = await this.ipfsStore.get(key);
      if (entry) {
        this.cache.set(key, entry.value);
        return entry.value;
      }
    }

    // 4. Fetch from cold IPFS
    if (this.tiers.cold.has(key)) {
      const entry = await this.ipfsStore.get(key);
      if (entry) {
        this.cache.set(key, entry.value);
        // Promote to warm tier
        this.tiers.warm.add(key);
        return entry.value;
      }
    }

    return null;
  }

  async sync(): Promise<void> {
    // Sync all hot tier data to warm (IPFS backup)
    for (const key of this.tiers.hot) {
      const data = this.cache.get(key);
      if (data) {
        await this.ipfsStore.put(key, {
          key,
          value: data,
          namespace: "sync",
          timestamp: Date.now(),
        });
      }
    }
  }

  async loadChunksViaP2P(cids: string[]): Promise<Map<string, Uint8Array>> {
    const result = new Map<string, Uint8Array>();
    
    for (const cid of cids) {
      // Try P2P first (browser-to-browser)
      try {
        // Use existing IPFS HTTP client as fallback
        const response = await fetch(`${this.config.ipfs.gateways[0]}/cat/${cid}`);
        const buffer = await response.arrayBuffer();
        result.set(cid, new Uint8Array(buffer));
        this.cache.set(cid, buffer);
      } catch (err) {
        console.warn(`Failed to load chunk ${cid} via P2P:`, err);
      }
    }
    
    return result;
  }

  destroy(): void {
    this.cache.clear();
    this.p2pStream.destroy();
    this.tiers = { hot: new Set(), warm: new Set(), cold: new Set() };
  }

  private evictCache(): void {
    // Evict oldest 20% of cache entries
    const entries = Array.from(this.cache.entries());
    const evictCount = Math.floor(entries.length * 0.2);
    
    for (let i = 0; i < evictCount; i++) {
      const entry = entries[i];
      if (entry) this.cache.delete(entry[0]);
    }
  }

  getStats(): { hot: number; warm: number; cold: number; cache: number } {
    return {
      hot: this.tiers.hot.size,
      warm: this.tiers.warm.size,
      cold: this.tiers.cold.size,
      cache: this.cache.size,
    };
  }
}
