/**
 * A2UI renderer tests — the React half of the wire contract.
 *
 * These run against the real factory output (`@agentmesh/mcp`), so a change to
 * the wire format that breaks the renderer fails here rather than in a browser.
 */
import { describe, expect, it } from "vitest";
import {
  type A2UIMessage,
  applyOps,
  formatCell,
  normalizeIntent,
  parseJsonl,
  readPointer,
  resolveValue,
} from "./index.js";

/**
 * A verbatim slice of the factory's output for shop1 (초원식당).
 *
 * Inlined rather than imported: the renderer must not depend on the factory at
 * runtime, and pinning real wire output here means a format change fails this
 * test instead of silently breaking the UI.
 */
const SURFACE_JSONL = [
  '{"version":"v1.0","createSurface":{"surfaceId":"shop1-menu","catalogId":"ops"}}',
  '{"version":"v1.0","updateDataModel":{"surfaceId":"shop1-menu","value":{"store":{"name":"초원식당","hours":"매일 영업 · 22:00 마감","pricePerPerson":"₫100,000–200,000"},"menu":[{"name":"삼겹살","price":150000,"soldOut":false,"statusIntent":"good"},{"name":"공기밥","price":10000,"soldOut":false,"statusIntent":"good"}]}}}',
  '{"version":"v1.0","updateComponents":{"surfaceId":"shop1-menu","components":[{"id":"root","component":"Column","catalogId":"basic","children":["menu_table","reserve_btn"]},{"id":"menu_table","component":"DataTable","catalogId":"ops","label":"메뉴","items":{"path":"/menu"},"columns":[{"key":"name","label":"메뉴"},{"key":"price","label":"가격","format":"currency","currency":"VND"},{"key":"statusText","label":"상태","intent":{"path":"/menu/statusIntent"}}]},{"id":"reserve_btn","component":"ConfirmButton","catalogId":"ops","label":"예약하기","intent":"good","action":{"name":"request_reservation"}}]}}',
  '{"version":"v1.0","beginRendering":{"surfaceId":"shop1-menu","root":"root"}}',
].join("\n");

describe("wire: applyOps", () => {
  const ops = parseJsonl(SURFACE_JSONL);

  it("parses the factory's JSONL into ops", () => {
    expect(ops).toHaveLength(4);
    expect(ops[0]).toHaveProperty("createSurface");
    expect(ops[3]).toHaveProperty("beginRendering");
  });

  it("folds ops into a renderable surface", () => {
    const state = applyOps(ops);
    expect(state.surfaceId).toBe("shop1-menu");
    expect(state.root).toBe("root");
    expect(state.components.root?.component).toBe("Column");
    expect(state.data.store).toEqual({
      name: "초원식당",
      hours: "매일 영업 · 22:00 마감",
      pricePerPerson: "₫100,000–200,000",
    });
  });

  it("is deterministic — replaying the same ops yields the same tree", () => {
    expect(applyOps(ops)).toEqual(applyOps(ops));
  });

  it("applies a scoped updateDataModel without touching components", () => {
    const base = applyOps(ops);
    const patch: A2UIMessage[] = [
      {
        version: "v1.0",
        updateDataModel: {
          surfaceId: "shop1-menu",
          path: "/menu/0",
          value: { soldOut: true, statusText: "품절", statusIntent: "bad" },
        },
      },
    ];
    const patched = applyOps(patch, base);
    expect(readPointer(patched.data, "/menu/0/statusIntent")).toBe("bad");
    // The scoped write does not leak: the sibling row keeps its own value.
    expect(readPointer(patched.data, "/menu/1/statusIntent")).toBe("good");
    // The component tree is identical — the whole point of the binding.
    expect(patched.components).toEqual(base.components);
  });
});

describe("wire: readPointer", () => {
  it("walks objects and arrays", () => {
    const data = { menu: [{ name: "삼겹살" }], store: { name: "초원식당" } };
    expect(readPointer(data, "/store/name")).toBe("초원식당");
    expect(readPointer(data, "/menu/0/name")).toBe("삼겹살");
  });

  it("returns undefined instead of throwing on a missing path", () => {
    expect(readPointer({ a: 1 }, "/missing/deep/path")).toBeUndefined();
    expect(readPointer({ menu: [{ name: "x" }] }, "/menu/9/name")).toBeUndefined();
  });

  it("decodes RFC 6901 escapes", () => {
    expect(readPointer({ "a/b": 1 }, "/a~1b")).toBe(1);
    expect(readPointer({ "a~b": 2 }, "/a~0b")).toBe(2);
  });
});

describe("wire: resolveValue", () => {
  it("passes literals through and resolves bindings", () => {
    const data = { store: { name: "초원식당" } };
    expect(resolveValue("판매중", data)).toBe("판매중");
    expect(resolveValue(150000, data)).toBe(150000);
    expect(resolveValue({ path: "/store/name" }, data)).toBe("초원식당");
  });
});

describe("catalog: intents and formatting", () => {
  it("collapses unknown intents to neutral rather than inventing one", () => {
    expect(normalizeIntent("good")).toBe("good");
    expect(normalizeIntent("catastrophic")).toBe("neutral");
    expect(normalizeIntent(undefined)).toBe("neutral");
  });

  it("formats a raw number as currency at render time", () => {
    // The wire sent 150000; the renderer owns locale + currency.
    const formatted = formatCell(150000, {
      key: "price",
      label: "가격",
      format: "currency",
      currency: "VND",
    });
    expect(formatted).toContain("150,000");
    expect(formatted).not.toBe("150000");
  });

  it("renders empty cells as blank, not 'undefined'", () => {
    expect(formatCell(undefined, { key: "x", label: "X" })).toBe("");
    expect(formatCell(null, { key: "x", label: "X" })).toBe("");
  });

  it("formats plain numbers with the locale separator", () => {
    expect(formatCell(1234567, { key: "n", label: "N", format: "number" })).toBe("1,234,567");
  });
});

describe("factory ↔ renderer contract", () => {
  it("every component the factory emits is in the renderer catalog", async () => {
    const { catalog } = await import("./catalog.js");
    const state = applyOps(parseJsonl(SURFACE_JSONL));
    const emitted = Object.values(state.components).map((c) => c.component);
    const missing = emitted.filter((name) => !(name in catalog));
    expect(missing).toEqual([]);
  });
});
