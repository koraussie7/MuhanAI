// packages/knowledge-base/src/p2p-memory/p2p-memory.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemwalIPFSBridge } from "./memwal-bridge";
import { IPFSMemoryStore } from "./ipfs-store";

// Mock IPFS HTTP Client
vi.mock("ipfs-http-client", () => ({
  create: () => ({
    add: vi.fn().mockResolvedValue({ cid: { toString: () => "bafytest123" } }),
    cat: vi.fn().mockResolvedValue(new Uint8Array(8)),
    pin: { add: vi.fn().mockResolvedValue(undefined) },
    repo: { close: vi.fn().mockResolvedValue(undefined) },
  }),
}));

// Mock Gun
vi.mock("gun", () => {
  const mockGun = {
    get: vi.fn(),
  };
  const factory = vi.fn(() => mockGun);
  factory.default = factory;
  factory.create = factory;
  return {
    default: vi.fn(() => mockGun),
    Gun: vi.fn(() => mockGun),
    create: vi.fn(() => mockGun),
    __mock: mockGun,
  };
});

vi.mock("multiformats/types", () => ({}));

describe("MemwalIPFSBridge", () => {
  it("should create bridge with agent config", () => {
    const bridge = new MemwalIPFSBridge({
      agentId: "test-agent",
      ipfsEndpoint: "http://localhost:5001",
      fellowshipPeers: ["http://fellowship.muhanai.com/gun"],
      gunPeers: ["http://fellowship.muhanai.com/gun"],
    });

    expect(bridge).toBeDefined();
  });

  it("should implement Store interface", async () => {
    const { Gun } = await import("gun");
    const mockGunInstance = (Gun as any)();

    const mockChain = {
      once: vi.fn((cb: Function) => cb({ cid: "bafytest123", timestamp: Date.now() })),
      put: vi.fn().mockResolvedValue(undefined),
      set: vi.fn(),
      delete: vi.fn(),
    };
    (mockGunInstance.get as any).mockReturnValue(mockChain);

    const bridge = new MemwalIPFSBridge({
      agentId: "test-agent",
      ipfsEndpoint: "http://localhost:5001",
      fellowshipPeers: ["http://fellowship.muhanai.com/gun"],
      gunPeers: ["http://fellowship.muhanai.com/gun"],
    });

    expect(await bridge.getNamespace()).toBe("test-agent");

    await bridge.set("test-key", { foo: "bar" });

    expect(mockChain.put).toHaveBeenCalled();
  });
});

describe("IPFSMemoryStore", () => {
  it("should store and retrieve entries via IPFS+Gun", async () => {
    const { Gun } = await import("gun");
    const mockGunInstance = (Gun as any)();

    const mockChain = {
      put: vi.fn().mockResolvedValue(undefined),
      once: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      map: vi.fn(),
    };
    (mockGunInstance.get as any).mockReturnValue(mockChain);

    const store = new IPFSMemoryStore({
      endpoint: "http://localhost:5001",
      repo: "test-repo",
      gunPeers: ["http://fellowship.muhanai.com/gun"],
    });

    const entry = {
      key: "test",
      value: { data: 1 },
      namespace: "agent1",
      timestamp: Date.now(),
    };

    await store.put("test-key", entry);
    expect(mockChain.put).toHaveBeenCalled();
  });
});
