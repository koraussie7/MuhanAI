// packages/knowledge-base/src/wasm-colibri/colibri-wasm.test.ts
import { describe, it, expect, vi } from "vitest";
import { ColibriWASM } from "./colibri-bridge";

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

describe("ColibriWASM Browser Integration", () => {
  it("should create ColibriWASM instance", () => {
    const colibri = new ColibriWASM({
      numThreads: 4,
      memorySize: 256,
      vocabSize: 152064,
      contextSize: 8192,
    });
    expect(colibri).toBeDefined();
  });

  it("should handle graceful fallback when WASM fails to load", async () => {
    const colibri = new ColibriWASM({
      numThreads: 4,
      memorySize: 256,
      vocabSize: 152064,
      contextSize: 8192,
    });

    // loadWASM with invalid URL should not crash
    await colibri.loadWASM("invalid-wasm.js");
    expect(colibri.isInitialized()).toBe(false);
  });

  it("should proxy to Fellowship when no native WASM module", async () => {
    const colibri = new ColibriWASM({
      numThreads: 4,
      memorySize: 256,
      vocabSize: 152064,
      contextSize: 8192,
    });

    // Simulate initialized state without WASM module
    (colibri as any).initialized = true;
    (colibri as any).modelLoaded = true;
    (colibri as any).module = null;

    const result = await colibri.generate("Hello");
    expect(result.tokens).toContain("Mock");
  });

  it("should run native inference when WASM module available", async () => {
    const colibri = new ColibriWASM({
      numThreads: 4,
      memorySize: 256,
      vocabSize: 152064,
      contextSize: 8192,
    });

    // Simulate loaded WASM module
    (colibri as any).initialized = true;
    (colibri as any).modelLoaded = true;
    
    // Track the completion handler that ColibriWASM will assign
    let assignedCompleteHandler: (result: string) => void = () => {};
    
    (colibri as any).module = {
      _output_token: vi.fn(),
      // Getter/setter for _generate_complete so we capture the handler
      get _generate_complete() { return assignedCompleteHandler; },
      set _generate_complete(cb: (result: string) => void) { assignedCompleteHandler = cb; },
      allocateUTF8: vi.fn().mockReturnValue(100),
      cwrap: vi.fn().mockImplementation((name: string) => {
        if (name === "colibri_generate") {
          return () => {
            // Synchronously trigger completion callback
            assignedCompleteHandler("Response from WASM");
            return 0;
          };
        }
        return () => 0;
      }),
      _free: vi.fn(),
    };

    const result = await colibri.generate("Test prompt");
    expect(result.tokens).toBeDefined();
    expect(result.tokens).toBe("Response from WASM");
  }, 10000);

  it("should destroy properly", async () => {
    const colibri = new ColibriWASM({
      numThreads: 4,
      memorySize: 256,
      vocabSize: 152064,
      contextSize: 8192,
    });

    await colibri.destroy();
    expect(colibri.isInitialized()).toBe(false);
  });
});
