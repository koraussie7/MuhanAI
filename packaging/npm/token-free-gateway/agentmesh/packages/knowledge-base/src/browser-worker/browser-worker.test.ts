// packages/knowledge-base/src/browser-worker/browser-worker.test.ts
import { describe, it, expect, vi } from "vitest";
import { HybridStorage } from "./hybrid-storage";

vi.mock("../wasm-colibri/colibri-bridge", () => ({
  ColibriWASM: vi.fn().mockImplementation(() => ({
    loadModelViaP2P: vi.fn().mockResolvedValue(true),
    generate: vi.fn().mockResolvedValue("Test response"),
    generateWithMemory: vi.fn().mockResolvedValue({
      tokens: "Test response",
      finishReason: "stop",
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    }),
    isInitialized: vi.fn().mockReturnValue(true),
    module: {
      _malloc: vi.fn(),
      _free: vi.fn(),
      HEAP8: new Int8Array(2048),
      cwrap: vi.fn().mockReturnValue(() => 0),
      allocateUTF8: vi.fn(),
    },
    initialized: true,
  })),
}));

vi.mock("p2p-media-loader", () => ({
  P2PManager: vi.fn().mockImplementation(() => ({
    shareChunk: vi.fn().mockResolvedValue(undefined),
    loadChunk: vi.fn().mockResolvedValue(new Uint8Array(10)),
    getStats: vi.fn().mockReturnValue({ peersCount: 3 }),
    destroy: vi.fn(),
  })),
}));

vi.mock("ipfs-http-client", () => ({
  create: () => ({
    add: vi.fn().mockResolvedValue({ cid: { toString: () => "bafytest" } }),
    cat: vi.fn().mockResolvedValue(new Uint8Array(8)),
    pin: { add: vi.fn().mockResolvedValue(undefined) },
    repo: { close: vi.fn().mockResolvedValue(undefined) },
  }),
}));

vi.mock("gun", () => ({
  default: vi.fn(() => ({
    get: vi.fn().mockReturnValue({
      put: vi.fn(),
      once: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      map: vi.fn().mockReturnValue({ once: vi.fn() }),
    }),
  })),
  Gun: vi.fn(() => ({
    get: vi.fn().mockReturnValue({
      put: vi.fn(),
      once: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      map: vi.fn().mockReturnValue({ once: vi.fn() }),
    }),
  })),
}));

vi.mock("multiformats/types", () => ({}));

// Mock global fetch
const mockFetch = vi.fn().mockResolvedValue({
  arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
});
global.fetch = mockFetch;

describe("HybridStorage", () => {
  it("should create hybrid storage instance", () => {
    const storage = new HybridStorage({
      p2p: { announce: ["wss://test"], maxPeers: 10 },
      ipfs: { gateways: ["https://ipfs.io"], pinner: "https://fellowship.test" },
      cache: { maxSize: 100, ttlMs: 3600000 },
    });
    expect(storage).toBeDefined();
  });

  it("should store and retrieve data with tier management", async () => {
    const storage = new HybridStorage({
      p2p: { announce: ["wss://test"], maxPeers: 10 },
      ipfs: { gateways: ["https://ipfs.io"], pinner: "https://fellowship.test" },
      cache: { maxSize: 100, ttlMs: 3600000 },
    });

    await storage.store("test-key", { data: "test-value" }, "warm");
    const stats = storage.getStats();
    
    expect(stats.warm).toBe(1);
    expect(stats.cache).toBe(1);
  });

  it("should load chunks via P2P", async () => {
    const storage = new HybridStorage({
      p2p: { announce: ["wss://test"], maxPeers: 10 },
      ipfs: { gateways: ["https://ipfs.io"], pinner: "https://fellowship.test" },
      cache: { maxSize: 100, ttlMs: 3600000 },
    });

    const chunks = await storage.loadChunksViaP2P([
      "bafytest/0",
      "bafytest/1",
    ]);
    
    expect(chunks.size).toBe(2);
  });

  it("should destroy properly", () => {
    const storage = new HybridStorage({
      p2p: { announce: ["wss://test"], maxPeers: 10 },
      ipfs: { gateways: ["https://ipfs.io"], pinner: "https://fellowship.test" },
      cache: { maxSize: 100, ttlMs: 3600000 },
    });

    storage.store("key1", { val: 1 });
    storage.destroy();
    
    // After destroy, cache should be cleared
    const stats = storage.getStats();
    expect(stats.cache).toBe(0);
  });
});
