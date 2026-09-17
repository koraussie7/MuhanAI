import { describe, expect, it } from "vitest";
import { createGhostDiscoveryClient, createGhostRegistry, parseGhostAgentCard } from "./index.js";

describe("Ghost adapter", () => {
  it("validates and normalizes an Agent Card", () => {
    const card = parseGhostAgentCard(
      {
        name: "local-ghost",
        capabilities: ["local_file_search", "unsupported"],
        privacy: { filesStayLocal: true },
      },
      "http://ghost.local",
    );
    expect(card).toMatchObject({
      name: "local-ghost",
      url: "http://ghost.local",
      capabilities: ["local_file_search"],
      privacy: { filesStayLocal: true },
    });
  });

  it("discovers a Ghost Agent Card from the standard endpoint", async () => {
    const client = createGhostDiscoveryClient(async (input) => {
      expect(String(input)).toBe("http://ghost.local/.well-known/agent.json");
      return new Response(JSON.stringify({ name: "ghost", capabilities: [] }), { status: 200 });
    });
    await expect(client.discover("http://ghost.local")).resolves.toMatchObject({
      name: "ghost",
      url: "http://ghost.local",
    });
  });

  it("tracks heartbeats and removes stale nodes", () => {
    const registry = createGhostRegistry();
    registry.upsert({
      nodeId: "ghost-1",
      card: { name: "ghost", url: "http://ghost.local", capabilities: [] },
      lastSeenAt: 10,
    });
    registry.upsert({
      nodeId: "ghost-2",
      card: { name: "ghost-2", url: "http://ghost-2.local", capabilities: [] },
      lastSeenAt: 20,
    });
    expect(registry.removeStale(15)).toBe(1);
    expect(registry.list().map((node) => node.nodeId)).toEqual(["ghost-2"]);
  });
});
