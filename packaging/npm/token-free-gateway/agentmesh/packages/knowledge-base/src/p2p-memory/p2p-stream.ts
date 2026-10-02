// packages/knowledge-base/src/p2p-memory/p2p-stream.ts
import { P2PManager } from "p2p-media-loader";

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
  private manager: P2PManager;
  private chunkSize: number;

  constructor(config: P2PStreamConfig) {
    this.manager = new P2PManager({
      runtimeOptions: {
        logging: true,
      },
    });
    this.chunkSize = config.chunkSize || 1024 * 1024;
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
      await this.manager.shareChunk(chunk.id, data);
    }
  }

  async receiveChunks(chunkIds: string[]): Promise<MemoryChunk[]> {
    const results: MemoryChunk[] = [];
    
    for (const chunkId of chunkIds) {
      try {
        const data = await this.manager.loadChunk(chunkId);
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
    return this.manager.getStats().peersCount;
  }

  destroy(): void {
    this.manager.destroy();
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
