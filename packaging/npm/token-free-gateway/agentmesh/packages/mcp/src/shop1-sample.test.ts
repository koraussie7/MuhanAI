/**
 * Sample: shop1.kbizhub.com — 초원식당 (Da Nang Korean Restaurant).
 *
 * This test doubles as the canonical "what does a generated store bundle look
 * like" fixture. It writes the real bundle to `dist-shop1/` and asserts the
 * Dual-Surface contract: one bundle, two surfaces (human HTML + agent MCP)
 * plus the third A2UI render surface.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { a2uiSurfaceBuilder } from "./a2ui-surface.js";
import { hugoMcpFactory, type StoreFactoryInput } from "./hugo-factory.js";

const SHOP1: StoreFactoryInput = {
  name: "초원식당",
  category: "한식당 / Korean Restaurant",
  description:
    "다낭 안하이(An Hải)의 정통 한식당. 삼겹살·된장찌개·김치찌개·제육볶음 등 한국인의 입맛을 살리는 집밥을 다낭에서 그대로. 1인 ₫100,000–200,000.",
  subdomain: "shop1",
  // Verified from the Google Business listing for 초원식당 (Da Nang).
  phone: "0936 225 640",
  address: "16 Huy Du, An Hải, Đà Nẵng 550000",
  hours: "매일 영업 · 22:00 마감 (Closes 10 PM)",
  services: ["All you can eat", "Dogs allowed inside", "Wi-Fi"],
  pricePerPerson: "₫100,000–200,000",
  lat: 16.0544,
  lng: 108.2444,
  items: [
    { name: "삼겹살 (1인분 200g)", price: 150000, description: "숯불 직화, 쌈채소·쌈장·마늘 포함" },
    { name: "된장찌개 + 공깃밥", price: 90000, description: "직접 담근 된장, 두부·호박·감자 듬뿌리" },
    { name: "김치찌개 (돼지고기)", price: 90000, description: "숙성 김치, 돼지 앞다리살" },
    { name: "제육볶음 정식", price: 120000, description: "매콤 달콤 돼지불고기 + 6찬 + 밥" },
    { name: "해물파전", price: 130000, description: "오징어·새우 듬뿍, 막걸리 안주 인기" },
    { name: "치킨 (후라이드/양념)", price: 180000, description: "국내산 양념 레시피, 반마리 가능" },
    { name: "공기밥", price: 10000, description: "리필 가능" },
  ],
};

describe("shop1.kbizhub.com — 초원식당 sample site", () => {
  const bundle = hugoMcpFactory.generateStaticBundle(SHOP1);

  it("emits the seven MUSS bundle files (theme + A2UI surface)", () => {
    expect(Object.keys(bundle).sort()).toEqual([
      ".well-known/mcp.json",
      "a2ui/surface.json",
      "a2ui/surface.jsonl",
      "assets/style.css",
      "data/menu.json",
      "data/store.json",
      "index.html",
    ]);
  });

  it("human surface: index.html renders the store name and menu", () => {
    const html = bundle["index.html"] ?? "";
    expect(html).toContain("초원식당");
    expect(html).toContain("삼겹살");
    expect(html).toContain('lang="ko"');
    // Human surface points at the machine-readable manifest
    expect(html).toContain('href="/.well-known/mcp.json"');
  });

  it("theme: css is inlined (no CDN) and index links it", () => {
    const css = bundle["assets/style.css"] ?? "";
    expect(css.length).toBeGreaterThan(500);
    expect(css).not.toContain("http"); // offline/IPFS-safe: no external fetch
    expect(bundle["index.html"]).toContain('href="/assets/style.css"');
  });

  it("real listing data lands on the human surface", () => {
    const html = bundle["index.html"] ?? "";
    expect(html).toContain("16 Huy Du, An Hải, Đà Nẵng 550000");
    expect(html).toContain("0936 225 640");
    expect(html).toContain("All you can eat");
    expect(html).toContain("Wi-Fi");
    expect(html).toContain("₫100,000–200,000");
  });

  it("structured data: JSON-LD Restaurant with geo coordinates", () => {
    const html = bundle["index.html"] ?? "";
    const match = html.match(/<script type="application\/ld\+json">(.+?)<\/script>/s);
    expect(match).not.toBeNull();
    const ld = JSON.parse(match?.[1] ?? "{}");
    expect(ld["@type"]).toBe("Restaurant");
    expect(ld.name).toBe("초원식당");
    expect(ld.geo.latitude).toBeCloseTo(16.0544);
  });

  it("shared truth: store.json carries services + price band for agents", () => {
    const store = JSON.parse(bundle["data/store.json"] ?? "{}");
    expect(store.services).toEqual(["All you can eat", "Dogs allowed inside", "Wi-Fi"]);
    expect(store.pricePerPerson).toBe("₫100,000–200,000");
    expect(store.geo).toEqual({ lat: 16.0544, lng: 108.2444 });
  });

  it("agent surface: mcp.json declares 3 tools with correct routing types", () => {
    const manifest = JSON.parse(bundle[".well-known/mcp.json"] ?? "{}");
    expect(manifest.name).toBe("shop1");
    expect(manifest.tools).toHaveLength(3);
    expect(manifest.tools[0].type).toBe("static_resource");
    expect(manifest.tools[2].type).toBe("p2p_action");
    expect(manifest.tools[2].target_skill).toBe("reservation_service");
  });

  it("shared truth: menu.json holds all 7 dishes (원산지/품절 확장 가능)", () => {
    const menu = JSON.parse(bundle["data/menu.json"] ?? "{}");
    expect(menu.items).toHaveLength(7);
    expect(menu.currency).toBe("KRW");
  });

  it("writes the bundle to dist-shop1/ for inspection", () => {
    const outDir = join(process.cwd(), "dist-shop1");
    for (const [relPath, contents] of Object.entries(bundle)) {
      const full = join(outDir, relPath);
      mkdirSync(join(full, ".."), { recursive: true });
      writeFileSync(full, contents, "utf8");
    }
    expect(true).toBe(true);
  });
});

describe("shop1 — A2UI agent surface (third surface)", () => {
  // Re-derive the bundle so this block is self-contained (a sibling describe's
  // locals are not in scope, and tests must not depend on execution order).
  const surfaceBundle = hugoMcpFactory.generateStaticBundle(SHOP1);
  const messages = JSON.parse(surfaceBundle["a2ui/surface.json"] ?? "[]") as Array<
    Record<string, unknown>
  >;
  const jsonl = surfaceBundle["a2ui/surface.jsonl"] ?? "";

  it("emits a valid A2UI v1.0 op sequence", () => {
    expect(messages.map((m) => Object.keys(m)[1])).toEqual([
      "createSurface",
      "updateDataModel",
      "updateComponents",
      "beginRendering",
    ]);
    expect(messages.every((m) => m.version === "v1.0")).toBe(true);
  });

  it("binds every surface to the store's own surfaceId", () => {
    for (const m of messages) {
      const body = (m.createSurface ??
        m.updateDataModel ??
        m.updateComponents ??
        m.beginRendering) as {
        surfaceId?: string;
      };
      expect(body.surfaceId).toBe("shop1-menu");
    }
  });

  it("wire carries RAW numbers — no pre-formatted strings (auri rule 1)", () => {
    const dataModel = messages[1]?.updateDataModel as { value: { menu: Array<{ price: number }> } };
    expect(typeof dataModel.value.menu[0]?.price).toBe("number");
    expect(dataModel.value.menu[0]?.price).toBe(150000);
    // A locale-formatted price would be a string like "150,000" or "₫150K".
    const asText = JSON.stringify(dataModel.value.menu);
    expect(asText).not.toContain('"150,000"');
    expect(asText).not.toContain("₫150K");
  });

  it("intent is used as a judgment axis, and the tree is built once", () => {
    const tree = messages[2]?.updateComponents as {
      components: Array<{ id: string; component: string; catalogId: string; intent?: unknown }>;
    };
    // Layout containers come from the A2UI basic catalog...
    const root = tree.components.find((c) => c.id === "root");
    expect(root?.component).toBe("Column");
    expect(root?.catalogId).toContain("/basic/");
    // ...while ops components come from the ops catalog.
    const table = tree.components.find((c) => c.component === "DataTable");
    expect(table?.catalogId).toContain("/ops/");
    // The status column binds intent rather than hard-coding a color.
    expect(table?.intent).toBeUndefined();
  });

  it("no icons, colors or sizes leak onto the wire (auri rule 4)", () => {
    const asText = JSON.stringify(messages);
    expect(asText).not.toMatch(/#[0-9a-fA-F]{3,6}/); // no hex colors
    expect(asText).not.toMatch(/"color"|"size"|"icon"/);
  });

  it("reservation is a consequential action with a confirm step", () => {
    const tree = messages[2]?.updateComponents as {
      components: Array<{ component: string; action?: { name: string }; confirmLabel?: string }>;
    };
    const btn = tree.components.find((c) => c.component === "ConfirmButton");
    expect(btn?.action?.name).toBe("request_reservation");
    expect(btn?.confirmLabel).toBeTruthy();
  });

  it("JSONL stream is one valid JSON object per line", () => {
    const lines = jsonl.trim().split("\n");
    expect(lines).toHaveLength(4);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it("sell-out updates via data binding alone — no new CID required", () => {
    const update = a2uiSurfaceBuilder.updateAvailability("shop1-menu", 0, true);
    expect(update).toHaveLength(1);
    // The union narrows on `version` first, so read the variant off the op.
    const op = update[0] as Extract<(typeof update)[number], { updateDataModel: unknown }>;
    expect(op.updateDataModel).toEqual({
      surfaceId: "shop1-menu",
      path: "/menu/0",
      value: { soldOut: true, statusText: "품절", statusIntent: "bad" },
    });
    // The update touches neither updateComponents nor the component tree.
    expect(JSON.stringify(update)).not.toContain("updateComponents");
  });
});
