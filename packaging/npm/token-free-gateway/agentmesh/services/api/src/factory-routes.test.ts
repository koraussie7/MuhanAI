import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import { registerFactoryRoutes, createFactoryDescriptor } from "./factory-routes.js";
import { AgentRegistry } from "@agentmesh/agent";
import { MockAdapter } from "@agentmesh/adapters";
import { MockIpfsAdapter, MockDnsLinkAdapter } from "@agentmesh/ipfs";

async function buildApp(opts: { ipfs?: boolean; dnslink?: boolean } = {}) {
  const registry = new AgentRegistry();
  registry.register(new MockAdapter());
  const app = Fastify({ logger: false });
  const factoryOpts: { registry: AgentRegistry; ipfs?: any; dnslink?: any } = { registry };
  if (opts.ipfs) factoryOpts.ipfs = new MockIpfsAdapter();
  if (opts.dnslink) factoryOpts.dnslink = new MockDnsLinkAdapter();
  await registerFactoryRoutes(app, factoryOpts);
  return { app, registry, ipfs: factoryOpts.ipfs, dnslink: factoryOpts.dnslink };
}

describe("factory-routes", () => {
  it("registers initial demo store in the topology", async () => {
    const { registry } = await buildApp();
    const topology = await registry.topology();
    const storeNode = topology.agents.find((a) => a.id === "store:danang-banhmi");
    expect(storeNode).toBeDefined();
    expect(storeNode?.type).toBe("mcp");
    expect(storeNode?.name).toBe("다낭 반미 하우스");
  });

  it("GET /api/factory/sites returns all spawned stores", async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: "GET", path: "/api/factory/sites" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(body.sites[0].subdomain).toBe("danang-banhmi");
  });

  it("POST /api/factory/spawn creates a new store and registers it as an agent", async () => {
    const { app, registry } = await buildApp();
    const res = await app.inject({
      method: "POST",
      path: "/api/factory/spawn",
      payload: {
        name: "서울 불고기집",
        category: "한국 음식점",
        description: "녹위즙 불고기 전문",
        subdomain: "seoul-bulgogi",
      },
    });
    expect(res.statusCode).toBe(200);
    const spawned = JSON.parse(res.body);
    expect(spawned.success).toBe(true);
    expect(spawned.subdomain).toBe("seoul-bulgogi");

    const adapter = registry.get("store:seoul-bulgogi");
    expect(adapter).toBeDefined();
    expect(adapter?.type).toBe("mcp");
  });

  it("POST /api/factory/spawn validates required fields", async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: "POST",
      path: "/api/factory/spawn",
      payload: { name: "" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("GET /api/factory/sites/:subdomain/site serves the storefront without DNSLink", async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: "GET",
      path: "/api/factory/sites/shop1/site/",
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.body).toContain("초원식당");
  });

  it("GET /api/factory/sites/:subdomain returns 404 for unknown store", async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: "GET",
      path: "/api/factory/sites/nonexistent-store",
    });
    expect(res.statusCode).toBe(404);
  });

  it("GET /api/factory/mcp/:subdomain returns MCP manifest", async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: "GET",
      path: "/api/factory/mcp/danang-banhmi",
    });
    expect(res.statusCode).toBe(200);
    const manifest = JSON.parse(res.body);
    expect(manifest.name).toBe("danang-banhmi");
    expect(manifest.tools.length).toBe(3);
  });

  it("GET /api/factory/topology includes store nodes with cosmic star IDs", async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: "GET", path: "/api/factory/topology" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const storeNode = body.agents.find((a: { id: string }) => a.id === "store:danang-banhmi");
    expect(storeNode).toBeDefined();
    expect(storeNode.cosmicStarId).toBe("star-store-danang-banhmi");
    expect(storeNode.websiteUrl).toBe(
      "https://muhanai.com/api/factory/sites/danang-banhmi/site/",
    );
  });

  it("POST /api/factory/spawn sanitizes subdomain", async () => {
    const { app, registry } = await buildApp();
    const res = await app.inject({
      method: "POST",
      path: "/api/factory/spawn",
      payload: {
        name: "Test Store",
        category: "Test",
        description: "Test desc",
        subdomain: "TEST_STORE@2024!",
      },
    });
    expect(res.statusCode).toBe(200);
    const spawned = JSON.parse(res.body);
    expect(spawned.subdomain).toBe("teststore2024");
    expect(registry.has("store:teststore2024")).toBe(true);
  });

  it("POST /api/factory/spawn pins CID to IPFS and updates DNSLink when adapters provided", async () => {
    const previousGateway = process.env.IPFS_GATEWAY_URL;
    process.env.IPFS_GATEWAY_URL = "https://ipfs.example.test";
    const { app, ipfs, dnslink } = await buildApp({ ipfs: true, dnslink: true });

    try {
    const res = await app.inject({
      method: "POST",
      path: "/api/factory/spawn",
      payload: {
        name: "IPFS Store",
        category: "Test",
        description: "Test",
        subdomain: "ipfs-store",
      },
    });
    expect(res.statusCode).toBe(200);
    const spawned = JSON.parse(res.body);

    const pinStatus = await ipfs!.status(spawned.cid);
    expect(pinStatus.status).toBe("pinned");

    const dnsRecord = await dnslink!.getDnsLink("ipfs-store");
    expect(dnsRecord).not.toBeNull();
    expect(dnsRecord?.cid).toBe(spawned.cid);
    expect(spawned.websiteUrl).toBe(`https://ipfs.example.test/ipfs/${spawned.cid}`);
    } finally {
      if (previousGateway === undefined) delete process.env.IPFS_GATEWAY_URL;
      else process.env.IPFS_GATEWAY_URL = previousGateway;
    }
  });

  it("POST /api/factory/sites/:subdomain/rollback updates DNSLink to previous CID", async () => {
    const { app, dnslink } = await buildApp({ dnslink: true });
    await dnslink!.updateDnsLink("danang-banhmi", "bafy-new-cid");

    const res = await app.inject({
      method: "POST",
      path: "/api/factory/sites/danang-banhmi/rollback",
      payload: { previousCid: "bafy-old-cid" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.rolledBackToCid).toBe("bafy-old-cid");

    const dnsRecord = await dnslink!.getDnsLink("danang-banhmi");
    expect(dnsRecord?.cid).toBe("bafy-old-cid");
  });

  it("POST /api/factory/sites/:subdomain/rollback returns 404 for unknown store", async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: "POST",
      path: "/api/factory/sites/unknown-store/rollback",
      payload: { previousCid: "bafy-old-cid" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("POST /api/factory/sites/:subdomain/rollback returns 400 when previousCid missing", async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: "POST",
      path: "/api/factory/sites/danang-banhmi/rollback",
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("createFactoryDescriptor", () => {
  it("creates AgentDescriptor from FactorySpawnResult", () => {
    const result = {
      success: true,
      subdomain: "my-store",
      cid: "bafytest",
      websiteUrl: "https://my-store.kbizhub.com",
      mcpUrl: "sse://mcp.muhanai.com/store/my-store",
      cosmicStarId: "star-store-my-store",
      a2uiJsonl: "",
      manifest: {
        name: "my-store",
        version: "1.0.0",
        description: "test",
        tools: [{ name: "get_menu", description: "Menu", type: "static_resource" as const }],
      },
      storeData: {
        store: { name: "My Store" },
        menu: {},
      },
      createdAt: new Date().toISOString(),
    };
    const desc = createFactoryDescriptor(result);
    expect(desc.id).toBe("store:my-store");
    expect(desc.type).toBe("mcp");
    expect(desc.name).toBe("My Store");
    expect(desc.capabilities).toEqual(["get_menu"]);
    expect(desc.health?.online).toBe(true);
  });
});
