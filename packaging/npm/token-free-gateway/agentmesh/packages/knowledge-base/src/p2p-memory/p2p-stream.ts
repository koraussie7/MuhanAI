// packages/knowledge-base/src/p2p-memory/p2p-stream.ts
// NOTE: p2p-media-loader is an OPTIONAL dep — lazy-loaded so Node unit tests
// (services/api) don't hard-fail when it isn't installed.
type P2PLoaderModule = {
  P2PManager: new (opts?: {
    runtimeOptions?: { logging?: boolean };
  }) => {
    shareChunk(chunkId: string, data: Uint8Array): Promise<void>;
    loadChunk(chunkId: string): Promise<Uint8Array>;
    getStats(): { peersCount: number };
    destroy(): void;
  };
};

async function loadP2PManager(): Promise<P2PLoaderModule["P2PManager"]> {
  const mod = (await import("p2p-media-loader")) as unknown as P2PLoaderModule;
  return mod.P2PManager;
}

export interface P2PStreamConfig {
  announce: string[];
  infoHash: string;
  chunkSize?: number;
}

export interface MemoryChunk {
  id: string;
  namespace: string;
  key: string;
  value: any;
  timestamp: number;
  index: number;
}

export class P2PMemoryStream {
  private manager: InstanceType<P2PLoaderModule["P2PManager"]> | null = null;
  private managerPromise: Promise<
    InstanceType<P2PLoaderModule["P2PManager"]>
  > | null = null;
  private chunkSize: number;

  constructor(config: P2PStreamConfig) {
    this.chunkSize = config.chunkSize || 1024 * 1024;
  }

  private async ensureManager(): Promise<
    InstanceType<P2PLoaderModule["P2PManager"]>
  > {
    if (this.manager) return this.manager;
    if (!this.managerPromise) {
      this.managerPromise = (async () => {
        const P2PManager = await loadP2PManager();
        this.manager = new P2PManager({
          runtimeOptions: {
            logging: true,
          },
        });
        return this.manager;
      })();
    }
    return this.managerPromise;
  }

  async shareMemory(namespace: string, memory: Record<string, any>): Promise<void> {
    const entries = Object.entries(memory);
    
    const chunks: MemoryChunk[] = [];
    let chunkIndex = 0;
    
    for (let i = 0; i < entries.length; i += 10) {
      const batch = entries.slice(i, i + 10);
      const chunk: MemoryChunk = {
        id: `${namespace}:chunk:${chunkIndex}`,
        namespace,
        key: `batch-${chunkIndex}`,
        value: Object.fromEntries(batch),
        timestamp: Date.now(),
        index: chunkIndex,
      };
      chunks.push(chunk);
      chunkIndex++;
    }

    for (const chunk of chunks) {
      const data = this.serializeChunk(chunk);
      const manager = await this.ensureManager();
      await manager.shareChunk(chunk.id, data);
    }
  }

  async receiveChunks(chunkIds: string[]): Promise<MemoryChunk[]> {
    const results: MemoryChunk[] = [];
    const manager = await this.ensureManager();

    for (const chunkId of chunkIds) {
      try {
        const data = await manager.loadChunk(chunkId);
        const chunk = this.deserializeChunk(data);
        if (chunk) results.push(chunk);
      } catch (err) {
        console.warn(`Failed to load chunk ${chunkId}:`, err);
      }
    }

    results.sort((a, b) => a.index - b.index);
    return results;
  }

  mergeChunks(chunks: MemoryChunk[]): Record<string, any> {
    const result: Record<string, any> = {};
    
    for (const chunk of chunks) {
      Object.assign(result, chunk.value);
    }
    
    return result;
  }

  mergeChunkData(chunks: MemoryChunk[]): Uint8Array {
    const allData = chunks.map(c => this.serializeChunk(c));
    const totalLength = allData.reduce((sum, arr) => sum + arr.byteLength, 0);
    const result = new Uint8Array(totalLength);
    
    let offset = 0;
    for (const arr of allData) {
      result.set(arr, offset);
      offset += arr.byteLength;
    }
    
    return result;
  }

  getPeerCount(): number {
    try {
      // Sync accessor — returns 0 until lazy manager is initialized.
      return (this.manager?.getStats().peersCount ?? 0);
    } catch {
      return 0;
    }
  }

  destroy(): void {
    try {
      this.manager?.destroy();
    } catch {
      // ignore — manager may never have initialized
    }
    this.manager = null;
    this.managerPromise = null;
  }

  private serializeChunk(chunk: MemoryChunk): Uint8Array {
    return new TextEncoder().encode(JSON.stringify(chunk));
  }

  private deserializeChunk(data: Uint8Array): MemoryChunk | null {
    try {
      return JSON.parse(new TextDecoder().decode(data)) as MemoryChunk;
    } catch {
      return null;
    }
  }
}
