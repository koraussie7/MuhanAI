// packages/knowledge-base/src/visuals/colibri-metrics.test.ts
import { describe, it, expect } from "vitest";
import type { ColibriMetrics, ModelChunkMetrics, PeerMetrics } from "./colibri-metrics";

describe("Colibri Metrics Types", () => {
  it("should validate ColibriMetrics structure", () => {
    const metrics: ColibriMetrics = {
      memory: {
        used: 128,
        total: 256,
        wasmHeap: 200,
        jsHeap: 56,
      },
      inference: {
        tokensPerSecond: 42.5,
        latencyMs: 150,
        batchSize: 8,
      },
      p2p: {
        peers: 12,
        downloadMbps: 45.2,
        uploadMbps: 12.3,
        chunksCached: 1488,
        cacheHitRate: 87.5,
      },
      model: {
        cid: "bafyreibglm52-int4-744b",
        name: "GLM-5.2 744B",
        loaded: true,
        quantization: "int4",
        fileSize: 372_000_000_000,
      },
    };

    expect(metrics.memory.used).toBe(128);
    expect(metrics.model.loaded).toBe(true);
    expect(metrics.p2p.cacheHitRate).toBe(87.5);
  });

  it("should validate ModelChunkMetrics structure", () => {
    const chunk: ModelChunkMetrics = {
      cid: "bafyreibglm52/chunk/0",
      index: 0,
      size: 268435456,
      status: "cached",
      peerCount: 12,
      downloadSpeed: 45.2,
      estimatedTime: 0,
    };

    expect(chunk.status).toBe("cached");
    expect(chunk.peerCount).toBe(12);
  });

  it("should validate PeerMetrics structure", () => {
    const peer: PeerMetrics = {
      id: "peer-001",
      region: "us-west",
      type: "browser",
      connected: true,
      downloadMbps: 120.5,
      uploadMbps: 50.2,
      sharedChunks: 42,
      lastSeen: Date.now(),
    };

    expect(peer.type).toBe("browser");
    expect(peer.connected).toBe(true);
  });
});
