import { pino } from "pino";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "./server.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.DISABLE_AUTH;
  vi.restoreAllMocks();
});

describe("Ghost integration routes", () => {
  beforeEach(() => {
    process.env.DISABLE_AUTH = "true";
  });

  it("discovers and registers a Ghost node", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          name: "local-ghost",
          capabilities: ["local_file_search"],
          privacy: { filesStayLocal: true },
        }),
        { status: 200 },
      ),
    ) as typeof fetch;
    const app = await buildApp({ enableTransport: false, logger: pino({ level: "silent" }) });
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/ghost/nodes",
        payload: { nodeId: "ghost-test", url: "http://ghost.local" },
      });
      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({
        nodeId: "ghost-test",
        card: { name: "local-ghost", privacy: { filesStayLocal: true } },
      });

      const list = await app.inject({ method: "GET", url: "/api/ghost/nodes" });
      expect(list.statusCode).toBe(200);
      expect(list.json()).toHaveLength(1);
    } finally {
      await app.close();
    }
  }, 15_000);

  it("rejects an invalid registration request", async () => {
    const app = await buildApp({ enableTransport: false, logger: pino({ level: "silent" }) });
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/ghost/nodes",
        payload: { nodeId: "", url: "not-a-url" },
      });
      expect(response.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });
});
