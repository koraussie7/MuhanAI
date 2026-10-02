// packages/knowledge-base/src/p2p-memory/browser-bridge.ts
import { P2PMemoryStream, type P2PStreamConfig } from "./p2p-stream";
import type { MemoryEntry } from "./types";

export interface BrowserMemoryBridge {
  stream: P2PMemoryStream;
  namespace: string;
}

export class BrowserMemorySync {
  private streams: Map<string, P2PMemoryStream> = new Map();

  constructor(private config: P2PStreamConfig) {}

  async shareAgentMemory(
    agentId: string,
    memory: Record<string, any>
  ): Promise<void> {
    let stream = this.streams.get(agentId);
    
    if (!stream) {
      stream = new P2PMemoryStream(this.config);
      this.streams.set(agentId, stream);
    }

    await stream.shareMemory(agentId, memory);
    
    // Fellowship 노드에 메타데이터 공유
    await this.registerWithFellowship(agentId, stream.getPeerCount());
  }

  async getSharedMemory(
    agentId: string,
    chunkIds: string[]
  ): Promise<Record<string, any>> {
    let stream = this.streams.get(agentId);
    
    if (!stream) {
      stream = new P2PMemoryStream(this.config);
      this.streams.set(agentId, stream);
    }

    const chunks = await stream.receiveChunks(chunkIds);
    return stream.mergeChunks(chunks);
  }

  async discoverPeers(): Promise<string[]> {
    return Array.from(this.streams.keys()).map(id => {
      const stream = this.streams.get(id);
      return `${id}:${stream?.getPeerCount() || 0} peers`;
    });
  }

  private async registerWithFellowship(
    agentId: string,
    peerCount: number
  ): Promise<void> {
    try {
      await fetch("https://fellowship.muhanai.com/p2p/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          peerCount,
          timestamp: Date.now(),
        }),
      });
    } catch (err) {
      console.warn("Failed to register with Fellowship:", err);
    }
  }

  destroy(): void {
    for (const stream of this.streams.values()) {
      stream.destroy();
    }
    this.streams.clear();
  }
}
