import { describe, expect, it } from "vitest";
import { HugoMcpFactory, hugoMcpFactory, StoreAgentAdapter } from "./hugo-factory.js";

describe("HugoMcpFactory", () => {
  it("generates valid .well-known/mcp.json manifest", () => {
    const factory = new HugoMcpFactory();
    const manifest = factory.generateMcpManifest({
      name: "다낭 반미",
      category: "베트남 음식",
      description: "정통 바게트 반미",
      subdomain: "danang-banhmi",
    });

    expect(manifest.name).toBe("danang-banhmi");
    expect(manifest.tools).toHaveLength(3);
    expect(manifest.tools[0]?.name).toBe("get_menu");
    expect(manifest.tools[0]?.type).toBe("static_resource");
    expect(manifest.tools[2]?.type).toBe("p2p_action");
    expect(manifest.tools[2]?.target_skill).toBe("reservation_service");
  });

  it("spawns factory result with CID and URLs", async () => {
    const result = await hugoMcpFactory.spawn({
      name: "테스트 카페",
      category: "카페/디저트",
      description: "로스터리 핸드드립 커피",
      subdomain: "test-cafe",
    });

    expect(result.success).toBe(true);
    expect(result.subdomain).toBe("test-cafe");
    expect(result.websiteUrl).toBe("https://test-cafe.kbizhub.com");
    expect(result.mcpUrl).toBe("sse://mcp.muhanai.com/store/test-cafe");
    expect(result.cid).toContain("bafybeikbizhub");
    expect(result.cosmicStarId).toBe("star-store-test-cafe");
    expect(result.manifest.tools).toBeDefined();
  });
});

describe("StoreAgentAdapter", () => {
  it("wraps a FactorySpawnResult and exposes AgentAdapter interface", () => {
    const adapter = new StoreAgentAdapter({
      success: true,
      subdomain: "test-store",
      cid: "bafytestcid123",
      websiteUrl: "https://test-store.kbizhub.com",
      mcpUrl: "sse://mcp.muhanai.com/store/test-store",
      cosmicStarId: "star-store-test-store",
      a2uiJsonl: "",
      manifest: {
        name: "test-store",
        version: "1.0.0",
        description: "Test store",
        tools: [
          { name: "get_menu", description: "Menu", type: "static_resource" },
          { name: "request_reservation", description: "Reserve", type: "p2p_action" },
        ],
      },
      storeData: {
        store: { name: "Test Store", address: "Seoul" },
        menu: { store: "Test Store", currency: "KRW", items: [] },
      },
      createdAt: new Date().toISOString(),
    });

    expect(adapter.id).toBe("store:test-store");
    expect(adapter.type).toBe("mcp");
    expect(adapter.displayName).toBe("Test Store");
    expect(adapter.capabilities()).toEqual(["get_menu", "request_reservation"]);
    expect(adapter.getMcpUrl()).toBe("sse://mcp.muhanai.com/store/test-store");
  });

  it("health returns online with low latency", async () => {
    const adapter = new StoreAgentAdapter({
      success: true,
      subdomain: "healthy-store",
      cid: "bafytestcid",
      websiteUrl: "https://healthy-store.kbizhub.com",
      mcpUrl: "sse://mcp.muhanai.com/store/healthy-store",
      cosmicStarId: "star-store-healthy-store",
      a2uiJsonl: "",
      manifest: { name: "healthy-store", version: "1.0.0", description: "test", tools: [] },
      storeData: { store: {}, menu: {} },
      createdAt: new Date().toISOString(),
    });

    const health = await adapter.health();
    expect(health.online).toBe(true);
    expect(health.latency).toBeLessThanOrEqual(5);
  });

  it("execute returns a valid AgentResult", async () => {
    const adapter = new StoreAgentAdapter({
      success: true,
      subdomain: "exec-store",
      cid: "bafytestcid",
      websiteUrl: "https://exec-store.kbizhub.com",
      mcpUrl: "sse://mcp.muhanai.com/store/exec-store",
      cosmicStarId: "star-store-exec-store",
      a2uiJsonl: "",
      manifest: { name: "exec-store", version: "1.0.0", description: "test", tools: [] },
      storeData: { store: { name: "Exec Store" }, menu: {} },
      createdAt: new Date().toISOString(),
    });

    const result = await adapter.execute({ id: "req-1", question: "What are your hours?" });
    expect(result.agentId).toBe("store:exec-store");
    expect(result.answer).toContain("Exec Store");
    expect(result.confidence).toBe(0.9);
    expect(result.requestId).toBe("req-1");
  });
});
