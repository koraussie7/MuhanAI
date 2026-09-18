/**
 * SSR render test — proves the A2UI tree walks and renders, without a DOM.
 *
 * `renderToStaticMarkup` exercises the same `renderComponent` path the browser
 * uses, so a broken tree walk, a missing catalog entry, or a bad value binding
 * fails here. This is the durable regression net; the browser harness is only
 * a visual check.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { A2UISurface } from "./A2UISurface.js";
import { applyOps, parseJsonl } from "./wire.js";

const JSONL = [
  '{"version":"v1.0","createSurface":{"surfaceId":"shop1-menu","catalogId":"ops"}}',
  '{"version":"v1.0","updateDataModel":{"surfaceId":"shop1-menu","value":{"store":{"name":"초원식당","hours":"매일 영업 · 22:00 마감","pricePerPerson":"₫100,000–200,000"},"menu":[{"name":"삼겹살","price":150000,"soldOut":false,"statusText":"판매중","statusIntent":"good"},{"name":"김치찌개 (돼지고기)","price":90000,"soldOut":true,"statusText":"품절","statusIntent":"bad"}]}}}',
  '{"version":"v1.0","updateComponents":{"surfaceId":"shop1-menu","components":[{"id":"root","component":"Column","catalogId":"basic","children":["header_col","soldout_callout","facts","menu_table","reserve_btn"]},{"id":"header_col","component":"Column","catalogId":"basic","children":["store_title","store_hours"]},{"id":"store_title","component":"Text","catalogId":"basic","text":{"path":"/store/name"}},{"id":"store_hours","component":"Text","catalogId":"basic","text":{"path":"/store/hours"}},{"id":"soldout_callout","component":"Callout","catalogId":"ops","title":"품절 안내","text":"일부 메뉴가 품절입니다. 주문 전에 확인해 주세요.","intent":"warning"},{"id":"facts","component":"KeyValue","catalogId":"ops","label":"초원식당","items":[{"key":"영업시간","value":{"path":"/store/hours"}},{"key":"1인 가격","value":{"path":"/store/pricePerPerson"}}]},{"id":"menu_table","component":"DataTable","catalogId":"ops","label":"메뉴","items":{"path":"/menu"},"columns":[{"key":"name","label":"메뉴"},{"key":"price","label":"가격","format":"currency","currency":"VND"},{"key":"statusText","label":"상태","intent":{"path":"/menu/statusIntent"}}]},{"id":"reserve_btn","component":"ConfirmButton","catalogId":"ops","label":"예약하기","confirmLabel":"예약을 요청할까요?","intent":"good","action":{"name":"request_reservation"}}]}}',
  '{"version":"v1.0","beginRendering":{"surfaceId":"shop1-menu","root":"root"}}',
].join("\n");

const ops = parseJsonl(JSONL);

describe("A2UISurface — SSR render", () => {
  const html = renderToStaticMarkup(<A2UISurface ops={ops} />);

  it("renders the surface with its identity attributes", () => {
    expect(html).toContain('data-surface-id="shop1-menu"');
  });

  it("walks children and renders bound text from the data model", () => {
    expect(html).toContain("초원식당");
  });

  it("renders every menu row", () => {
    const rows = html.match(/<tr>/g) ?? [];
    // 1 header row + 2 body rows
    expect(rows).toHaveLength(3);
  });

  it("formats the raw wire number as VND currency at render time", () => {
    expect(html).toContain("150,000");
    expect(html).not.toContain(">150000<");
  });

  it("maps bound intent to a data attribute, not a hard-coded color", () => {
    expect(html).toContain('data-intent="bad"');
    expect(html).toContain('data-intent="good"');
    expect(html).not.toMatch(/#[0-9a-fA-F]{6}/);
  });

  it("renders the consequential action as a button", () => {
    expect(html).toContain("예약하기");
    expect(html).toContain("<button");
  });

  it("degrades visibly for an unknown component instead of blanking", () => {
    const tree = applyOps([
      ...ops,
      {
        version: "v1.0",
        updateComponents: {
          surfaceId: "shop1-menu",
          components: [{ id: "root", component: "Hologram", catalogId: "ops" }],
        },
      },
    ]);
    const out = renderToStaticMarkup(<A2UISurface state={tree} />);
    expect(out).toContain("a2ui-unknown");
    expect(out).toContain("Hologram");
  });

  it("shows a loading state when rendering has not begun", () => {
    const partial = applyOps(ops.slice(0, 2));
    const out = renderToStaticMarkup(<A2UISurface state={partial} />);
    expect(out).toContain('data-state="loading"');
  });

  it("does not recurse forever on a cyclic tree", () => {
    const cyclic = applyOps([
      {
        version: "v1.0",
        createSurface: { surfaceId: "s", catalogId: "ops" },
      },
      {
        version: "v1.0",
        updateComponents: {
          surfaceId: "s",
          components: [
            { id: "root", component: "Column", catalogId: "basic", children: ["a"] },
            { id: "a", component: "Column", catalogId: "basic", children: ["root"] },
          ],
        },
      },
      { version: "v1.0", beginRendering: { surfaceId: "s", root: "root" } },
    ]);
    // Should terminate and render, not blow the stack.
    expect(() => renderToStaticMarkup(<A2UISurface state={cyclic} />)).not.toThrow();
  });
});
