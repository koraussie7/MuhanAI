import { describe, it, expect, beforeEach } from "vitest";

import {
  createDaemon,
  type MessageTransport,
  type MachineIdentity,
} from "../index.js";
import { decodeMessage, GATEWAY_PUBSUB_TOPIC } from "@agentmesh/gateway";

class InMemoryTransport implements MessageTransport {
  published: { topic: string; bytes: Uint8Array }[] = [];
  private subscribers = new Map<
    string,
    Set<(bytes: Uint8Array) => void>
  >();

  async publish(topic: string, bytes: Uint8Array): Promise<void> {
    this.published.push({ topic, bytes });
    const subs = this.subscribers.get(topic);
    if (subs) for (const fn of subs) fn(bytes);
  }

  subscribe(
    topic: string,
    handler: (bytes: Uint8Array) => void,
  ): () => void {
    let set = this.subscribers.get(topic);
    if (!set) {
      set = new Set();
      this.subscribers.set(topic, set);
    }
    set.add(handler);
    return () => set!.delete(handler);
  }

  inject(topic: string, bytes: Uint8Array): void {
    const subs = this.subscribers.get(topic);
    if (subs) for (const fn of subs) fn(bytes);
  }
}

describe("muhan-agent daemon", () => {
  let transport: InMemoryTransport;

  beforeEach(() => {
    transport = new InMemoryTransport();
  });

  it("publishes a machine-claim on start", async () => {
    const daemon = createDaemon({
      userId: "user_1",
      platform: "macos",
      label: "Test Mac",
      transport,
    });
    await daemon.start();
    try {
      expect(transport.published.length).toBeGreaterThan(0);
      const claim = decodeMessage(transport.published[0]!.bytes);
      expect(claim).toMatchObject({
        kind: "machine-claim",
        userId: "user_1",
        platform: "macos",
        label: "Test Mac",
      });
    } finally {
      await daemon.stop();
    }
  });

  it("publishes heartbeats on the configured interval", async () => {
    const daemon = createDaemon({
      userId: "user_1",
      platform: "linux",
      transport,
      heartbeatIntervalMs: 15,
    });
    await daemon.start();
    try {
      const beforeCount = transport.published.length;
      await new Promise((r) => setTimeout(r, 60));
      expect(transport.published.length).toBeGreaterThan(beforeCount);
    } finally {
      await daemon.stop();
    }
  });

  it("ignores session-routes addressed to a different user", async () => {
    const daemon = createDaemon({
      userId: "user_A",
      platform: "macos",
      transport,
    });
    await daemon.start();
    try {
      const foreignRoute = {
        kind: "session-route" as const,
        v: 1 as const,
        sessionId: "s_1",
        userId: "user_B",
        ciphertext: new Uint8Array([1, 2, 3]),
        issuedAt: Date.now(),
      };
      transport.inject(
        GATEWAY_PUBSUB_TOPIC,
        new TextEncoder().encode(JSON.stringify(foreignRoute)),
      );
    } finally {
      await daemon.stop();
    }
  });
});
