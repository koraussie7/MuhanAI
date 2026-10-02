// packages/knowledge-base/src/p2p-memory/p2p-stream.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { P2PMemoryStream } from "./p2p-stream";
import { BrowserMemorySync } from "./browser-bridge";

vi.mock("p2p-media-loader", () => ({
  P2PManager: vi.fn().mockImplementation(() => ({
    shareChunk: vi.fn().mockResolvedValue(undefined),
    loadChunk: vi.fn().mockResolvedValue(new Uint8Array(10)),
    getStats: vi.fn().mockReturnValue({
      peersCount: 5,
      downloadedFromP2P: 1024,
      uploadedToP2P: 512,
    }),
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

describe("P2PMemoryStream", () => {
  it("should create stream manager", () => {
    const stream = new P2PMemoryStream({
      announce: ["wss://fellowship.muhanai.com/p2p"],
      infoHash: "test-hash",
    });
    expect(stream).toBeDefined();
  });

  it("should share and merge memory chunks", async () => {
    const stream = new P2PMemoryStream({
      announce: ["wss://fellowship.muhanai.com/p2p"],
      infoHash: "test-hash",
    });

    const testMemory = {
      "key1": { data: 1 },
      "key2": { data: 2 },
    };

    await stream.shareMemory("test-agent", testMemory);
    expect(stream.getPeerCount()).toBe(5);
    stream.destroy();
  });
});

describe("BrowserMemorySync", () => {
  it("should create sync instance", () => {
    const sync = new BrowserMemorySync({
      announce: ["wss://fellowship.muhanai.com/p2p"],
      infoHash: "browser-sync-hash",
    });
    expect(sync).toBeDefined();
  });

  it("should manage agent memory sharing", async () => {
    const sync = new BrowserMemorySync({
      announce: ["wss://fellowship.muhanai.com/p2p"],
      infoHash: "browser-sync-hash",
    });

    const testMemory = {
      "preferences": { theme: "dark" },
      "history": [{ query: "test", response: "ok" }],
    };

    await sync.shareAgentMemory("agent-123", testMemory);
    const peers = await sync.discoverPeers();
    
    expect(peers).toContain("agent-123:5 peers");
    sync.destroy();
  });
});
