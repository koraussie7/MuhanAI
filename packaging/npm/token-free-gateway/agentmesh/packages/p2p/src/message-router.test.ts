import { describe, expect, it } from "vitest";
import type { P2PMessage } from "./types.ts";
import { PeerRegistry } from "./peer-registry.ts";
import { MessageRouter } from "./message-router.ts";

function peer(id: string, capabilities: string[] = []) {
  return {
    id: { id },
    displayName: id,
    protocol: "memory" as const,
    addresses: [],
    capabilities,
  };
}

function message(id: string, to: string, overrides: Partial<P2PMessage> = {}): P2PMessage {
  return {
    id,
    type: "test",
    from: "self",
    to,
    payload: {},
    timestamp: Date.now(),
    ...overrides,
  };
}

describe("MessageRouter", () => {
  it("delivers to a connected peer", async () => {
    const registry = new PeerRegistry();
    registry.register(peer("alice"));
    registry.updateConnection("alice", "connected");
    const router = new MessageRouter(registry);

    const receipt = await router.send(message("m1", "alice"));

    expect(receipt.status).toBe("delivered");
    expect(receipt.deliveredTo).toEqual(["alice"]);
    expect(receipt.errors).toEqual([]);
    expect(router.deliveredCount).toBe(1);
    expect(router.pendingCount).toBe(0);
  });

  it("fails when the peer is unknown", async () => {
    const router = new MessageRouter(new PeerRegistry());

    const receipt = await router.send(message("m1", "ghost"));

    expect(receipt.status).toBe("failed");
    expect(receipt.errors).toEqual(["unknown peer: ghost"]);
    expect(router.pendingCount).toBe(0);
  });

  it("returns pending when the peer is known but offline", async () => {
    const registry = new PeerRegistry();
    registry.register(peer("alice"));
    const router = new MessageRouter(registry);

    const receipt = await router.send(message("m1", "alice"));

    expect(receipt.status).toBe("pending");
    expect(receipt.errors).toEqual(["peer alice not connected"]);
    expect(router.pendingCount).toBe(1);
  });

  it("broadcasts to connected peers and excludes listed ids", async () => {
    const registry = new PeerRegistry();
    registry.register(peer("alice"));
    registry.register(peer("bob"));
    registry.register(peer("carol"));
    registry.updateConnection("alice", "connected");
    registry.updateConnection("bob", "connected");
    // carol registered but offline

    const router = new MessageRouter(registry);
    const receipt = await router.broadcast(message("b1", "alice"), ["bob"]);

    expect(receipt.status).toBe("delivered");
    expect(receipt.deliveredTo).toEqual(["alice"]);
    expect(receipt.errors).toEqual(["peer carol not connected"]);
  });

  it("marks failed broadcasts when nothing was delivered", async () => {
    const registry = new PeerRegistry();
    registry.register(peer("alice"));
    const router = new MessageRouter(registry);

    const receipt = await router.broadcast(message("b1", "alice"));

    expect(receipt.status).toBe("failed");
    expect(receipt.deliveredTo).toEqual([]);
    expect(receipt.errors).toEqual(["peer alice not connected"]);
  });

  it("receive() records delivery and clears pending", async () => {
    const registry = new PeerRegistry();
    registry.register(peer("alice"));
    const router = new MessageRouter(registry);

    await router.send(message("m1", "alice"));
    expect(router.pendingCount).toBe(1);

    router.receive(message("m1", "alice"));

    expect(router.deliveredCount).toBe(1);
    expect(router.pendingCount).toBe(0);
  });

  it("evicts messages past their TTL", async () => {
    const registry = new PeerRegistry();
    registry.register(peer("alice"));
    const router = new MessageRouter(registry, 0); // 0s TTL
    await router.send(message("m1", "alice"));
    expect(router.pendingCount).toBe(1);

    const expired = router.evictExpired();
    expect(expired).toEqual(["m1"]);
    expect(router.pendingCount).toBe(0);
  });

  it("defaults timestamp and ttl on send", async () => {
    const registry = new PeerRegistry();
    registry.register(peer("alice"));
    registry.updateConnection("alice", "connected");
    const router = new MessageRouter(registry);

    const msg = {
      id: "m1",
      type: "test",
      from: "self",
      to: "alice",
      payload: {},
      timestamp: 0 as number | undefined,
    } as unknown as P2PMessage;

    await router.send(msg);

    expect(msg.timestamp).toBeGreaterThan(0);
    expect(msg.ttl).toBe(60);
  });
});
