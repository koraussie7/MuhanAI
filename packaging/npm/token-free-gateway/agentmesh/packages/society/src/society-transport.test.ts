import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SocietyClient } from "society-protocol";
import { SocietyTransport } from "../src/society-transport.ts";

function makeEnvelope(body: unknown) {
  return { body: typeof body === "string" ? body : JSON.stringify(body) };
}

describe("SocietyTransport", () => {
  let client: SocietyClient;
  let transport: SocietyTransport;

  beforeEach(() => {
    client = {
      sendMessage: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      off: vi.fn(),
    } as unknown as SocietyClient;
    transport = new SocietyTransport({ client, roomId: "test-room" });
  });

  it("reports protocol as libp2p", () => {
    expect(transport.protocol).toBe("libp2p");
  });

  it("connects and emits a connected event with the local peer", async () => {
    const infoPromise = new Promise((resolve) => {
      transport.onConnectionChange = (info) => resolve(info);
    });
    const local = {
      id: { id: "peer-local" },
      protocol: "libp2p" as const,
      addresses: [],
      capabilities: [],
    };
    const info = await transport.connect(local);
    expect(info.state).toBe("connected");
    expect(info.peerId).toBe("peer-local");
    await infoPromise;
  });

  it("sends a unicast message via client.sendMessage", async () => {
    await transport.connect({
      id: { id: "peer-local" },
      protocol: "libp2p",
      addresses: [],
      capabilities: [],
    });
    const receipt = await transport.send({
      id: "m1",
      type: "ping",
      from: "peer-local",
      to: "peer-remote",
      payload: { hello: "world" },
      timestamp: Date.now(),
    });
    expect(client.sendMessage).toHaveBeenCalledWith(
      "test-room",
      expect.stringContaining('"to":"peer-remote"'),
    );
    expect(receipt.status).toBe("delivered");
  });

  it("broadcasts with to=*", async () => {
    await transport.connect({
      id: "peer-local",
      protocol: "libp2p",
      addresses: [],
      capabilities: [],
    } as any);
    await transport.broadcast({
      id: "b1",
      type: "announce",
      from: "peer-local",
      to: "unused",
      payload: {},
      timestamp: Date.now(),
    });
    expect(client.sendMessage).toHaveBeenCalledWith(
      "test-room",
      expect.stringContaining('"to":"*"'),
    );
  });

  it("forwards only matching envelopes to onMessage", async () => {
    // Capture handlers registered via client.on during start().
    const handlers = new Map<string, Function>();
    (client.on as ReturnType<typeof vi.fn>).mockImplementation((event: string, fn: Function) => {
      handlers.set(event, fn);
    });

    const transport = new SocietyTransport({ client, roomId: "test-room" });
    await transport.connect({
      id: { id: "peer-local" },
      protocol: "libp2p",
      addresses: [],
      capabilities: [],
    });

    const received: Array<{ id?: string }> = [];
    transport.onMessage = (m) => received.push(m);

    const chatHandler = handlers.get("chat:message");
    expect(chatHandler).toBeDefined();

    // Addressed to us -> delivered.
    chatHandler!("test-room", makeEnvelope({ _mesh: 1, payload: { id: "x", to: "peer-local" } }));
    // Broadcast -> delivered.
    chatHandler!("test-room", makeEnvelope({ _mesh: 1, payload: { id: "y", to: "*" } }));
    // Addressed elsewhere -> ignored.
    chatHandler!("test-room", makeEnvelope({ _mesh: 1, payload: { id: "z", to: "someone-else" } }));
    // Not a mesh message -> ignored.
    chatHandler!("test-room", makeEnvelope({ hello: "raw chat" }));

    expect(received.map((m) => m.id)).toEqual(["x", "y"]);
  });
});
