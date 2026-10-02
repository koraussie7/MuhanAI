// packages/knowledge-base/src/wasm-colibri/colibri-bridge.test.ts
import { describe, it, expect, vi } from "vitest";
import { ColibriWASM } from "./colibri-bridge";
import { P2PMemoryStream } from "../p2p-memory/p2p-stream";

vi.mock("p2p-media-loader", () => ({
  P2PManager: vi.fn().mockImplementation(() => ({
    shareChunk: vi.fn().mockResolvedValue(undefined),
    loadChunk: vi.fn().mockResolvedValue(new TextEncoder().encode(JSON.stringify({
      id: "test-chunk",
      namespace: "test-agent",
      key: "test",
      value: { test: true },
      timestamp: Date.now(),
      index: 0,
    }))),
    getStats: vi.fn().mockReturnValue({ peersCount: 3, downloadedFromP2P: 0, uploadedToP2P: 0 }),
    destroy: vi.fn(),
  })),
}));

vi.mock("../p2p-memory/p2p-stream", () => ({
  P2PMemoryStream: vi.fn().mockImplementation(() => ({
    receiveChunks: vi.fn().mockResolvedValue([{
      id: "test",
      namespace: "test-agent",
      key: "test",
      value: { test: true },
      timestamp: Date.now(),
      index: 0,
    }]),
    mergeChunkData: vi.fn().mockReturnValue(new Uint8Array(1024)),
    getPeerCount: vi.fn().mockReturnValue(3),
    destroy: vi.fn(),
    shareMemory: vi.fn().mockResolvedValue(undefined),
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
    }),
  })),
  Gun: vi.fn(() => ({
    get: vi.fn().mockReturnValue({
      put: vi.fn(),
      once: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    }),
  })),
}));

vi.mock("multiformats/types", () => ({}));

describe("ColibriWASM", () => {
  it("should create WASM bridge instance", () => {
    const colibri = new ColibriWASM({
      numThreads: 1,
      memorySize: 256,
      vocabSize: 152064,
      contextSize: 8192,
    });
    expect(colibri).toBeDefined();
  });

  it("should return false for initialized state before loading", () => {
    const colibri = new ColibriWASM({
      numThreads: 1,
      memorySize: 256,
      vocabSize: 152064,
      contextSize: 8192,
    });
    expect(colibri.isInitialized()).toBe(false);
  });

  it("should handle model loading via P2P", async () => {
    const colibri = new ColibriWASM({
      numThreads: 1,
      memorySize: 256,
      vocabSize: 152064,
      contextSize: 8192,
    });

    // Mock WASM module
    (colibri as any).module = {
      _malloc: vi.fn().mockReturnValue(1000),
      _free: vi.fn(),
      HEAP8: new Int8Array(10 * 1024 * 1024), // 10MB 힙 확보
      allocateUTF8: vi.fn().mockReturnValue(1000),
      cwrap: vi.fn().mockReturnValue(() => 1),
    };
    (colibri as any).initialized = true;

    const result = await colibri.loadModelViaP2P({
      cid: "bafytestmodel",
      name: "glm-5.2-int4",
      quantization: "int4",
      totalSize: 1024 * 1024,
      chunkSize: 256 * 1024,
    });

    expect(result).toBe(true);
  });

  it("should destroy properly", async () => {
    const colibri = new ColibriWASM({
      numThreads: 1,
      memorySize: 256,
      vocabSize: 152064,
      contextSize: 8192,
    });

    await colibri.destroy();
    expect(colibri.isInitialized()).toBe(false);
  });
});
