/**
 * A2UI wire builder — emits declarative agent-UI JSONL for a store surface.
 *
 * Why this exists: MCP tools like `get_menu` return raw JSON today, so an agent
 * can read the price but cannot *show* it. A2UI (Agent-to-UI, v1.0) is the
 * framework-neutral wire format that lets the agent describe a UI as data
 * instead of code. The store bundle carries the tool schema; this module
 * produces the matching render payload.
 *
 * Design rules honored here (from the auri ops catalog `instructions` field):
 *   1. Emit RAW values — 150000, never "150,000" or "₫150K". The renderer
 *      formats numbers/currencies in the user's locale.
 *   2. `intent` judges, `trend` describes. They are separate axes.
 *   3. One shared intent scale: good | bad | warning | info | neutral.
 *   4. No icons, colors, or sizes on the wire — intent implies them.
 *   5. Bind values that will change via {"path": "/json/pointer"} and update
 *      them with `updateDataModel` instead of re-sending components.
 *   6. Layout containers (Row/Column/Card/List) come from the A2UI *basic*
 *      catalog, not the ops catalog — so they carry a different catalogId.
 *
 * Everything here is plain JSON. There is no Svelte, no React, and no
 * dependency on the auri package: only on the A2UI v1.0 spec.
 */

/** A2UI v1.0 wire protocol version. */
export const A2UI_VERSION = "v1.0";

/**
 * The A2UI base specification. Layout primitives live here, not in a
 * domain catalog.
 */
export const A2UI_BASIC_CATALOG = "https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json";

/**
 * The ops component catalog (Stat, Badge, DataTable, ...).
 *
 * Pointed at the auri reference deployment, but it is deliberately just a
 * string: self-host the same JSON and swap this constant to remove the
 * external dependency entirely.
 */
export const A2UI_OPS_CATALOG = "https://chaliceforauri.github.io/auri/catalogs/ops/v2.json";

/** The single shared judgment scale. `intent` judges; omit it to make no claim. */
export type Intent = "good" | "bad" | "warning" | "info" | "neutral";

/** Direction of movement. Describes, never judges — pair with Intent. */
export type Trend = "up" | "down" | "flat";

/** Reference to a value in the surface data model (RFC 6901 JSON Pointer). */
export interface DataBinding {
  path: string;
}

/** A literal or a bound value. */
export type DynamicValue = string | number | boolean | DataBinding;

export interface A2UIComponent {
  id: string;
  component: string;
  catalogId: string;
  [key: string]: unknown;
}

/** One operation in the A2UI v1.0 JSONL stream. */
export type A2UIMessage =
  | { version: string; createSurface: { surfaceId: string; catalogId: string } }
  | { version: string; updateDataModel: { surfaceId: string; path?: string; value: unknown } }
  | { version: string; updateComponents: { surfaceId: string; components: A2UIComponent[] } }
  | { version: string; beginRendering: { surfaceId: string; root: string } };

/** Minimal shape the builder needs — matches hugo-factory's menu output. */
export interface MenuItemLike {
  name: string;
  price: number;
  description?: string;
}

export interface StoreSurfaceInput {
  /** Surface id, usually `${subdomain}-menu`. */
  surfaceId: string;
  storeName: string;
  hours?: string;
  pricePerPerson?: string;
  services?: string[];
  items: MenuItemLike[];
  /** Dish names currently unavailable — rendered as a `bad` Badge. */
  soldOut?: string[];
}

/**
 * Builds the A2UI surface for a store: a stream of operations an A2UI renderer
 * consumes in order. The component tree is authored ONCE here; mutable data
 * (availability, price) reaches the renderer through data bindings, so a
 * "today's special is sold out" update never requires a new IPFS CID.
 */
export class A2UISurfaceBuilder {
  /**
   * The component tree + data model for a store menu.
   * Returns ops in emission order: createSurface → updateDataModel →
   * updateComponents → beginRendering.
   */
  buildStoreMenuSurface(input: StoreSurfaceInput): A2UIMessage[] {
    const soldOut = new Set(input.soldOut ?? []);

    // ---- data model (path-bound; this is the part that updates live) ----
    const dataModel: Record<string, unknown> = {
      store: {
        name: input.storeName,
        ...(input.hours ? { hours: input.hours } : {}),
        ...(input.pricePerPerson ? { pricePerPerson: input.pricePerPerson } : {}),
      },
      menu: (input.items ?? []).map((item) => ({
        name: item.name,
        // Rule 1: raw number. The renderer applies the locale + currency.
        price: item.price,
        ...(item.description ? { description: item.description } : {}),
        soldOut: soldOut.has(item.name),
        statusText: soldOut.has(item.name) ? "품절" : "판매중",
        statusIntent: soldOut.has(item.name) ? ("bad" as Intent) : ("good" as Intent),
      })),
      availability: {
        soldOutCount: (input.items ?? []).filter((i) => soldOut.has(i.name)).length,
        totalCount: (input.items ?? []).length,
      },
    };

    // ---- component tree ----
    const children: string[] = ["header_col"];

    // Availability summary — only when something is actually sold out, so a
    // healthy store does not get a redundant banner.
    if (
      dataModel.availability &&
      (dataModel.availability as { soldOutCount: number }).soldOutCount > 0
    ) {
      children.push("soldout_callout");
    }
    children.push("facts", "menu_table", "reserve_btn");

    const components: A2UIComponent[] = [
      {
        id: "root",
        component: "Column",
        catalogId: A2UI_BASIC_CATALOG,
        children,
      },
      {
        id: "header_col",
        component: "Column",
        catalogId: A2UI_BASIC_CATALOG,
        children: ["store_title", "store_hours"],
      },
      {
        id: "store_title",
        component: "Text",
        catalogId: A2UI_BASIC_CATALOG,
        // Bound, not literal: renaming the store must not need a new tree.
        text: { path: "/store/name" },
      },
    ];

    if (input.hours) {
      components.push({
        id: "store_hours",
        component: "Text",
        catalogId: A2UI_BASIC_CATALOG,
        text: { path: "/store/hours" },
      });
    }

    if ((dataModel.availability as { soldOutCount: number }).soldOutCount > 0) {
      components.push({
        id: "soldout_callout",
        component: "Callout",
        catalogId: A2UI_OPS_CATALOG,
        title: "품절 안내",
        text: "일부 메뉴가 품절입니다. 주문 전에 확인해 주세요.",
        intent: "warning",
      });
    }

    const factItems: Array<{ key: string; value: DynamicValue }> = [];
    if (input.hours) factItems.push({ key: "영업시간", value: { path: "/store/hours" } });
    if (input.pricePerPerson) {
      factItems.push({ key: "1인 가격", value: { path: "/store/pricePerPerson" } });
    }
    if (input.services?.length) {
      factItems.push({ key: "편의시설", value: input.services.join(" · ") });
    }
    if (factItems.length) {
      components.push({
        id: "facts",
        component: "KeyValue",
        catalogId: A2UI_OPS_CATALOG,
        label: input.storeName,
        items: factItems,
      });
    }

    components.push(
      {
        id: "menu_table",
        component: "DataTable",
        catalogId: A2UI_OPS_CATALOG,
        label: "메뉴",
        items: { path: "/menu" },
        columns: [
          { key: "name", label: "메뉴" },
          { key: "price", label: "가격", format: "currency", currency: "VND" },
          {
            key: "statusText",
            label: "상태",
            // `intent` comes from the bound row field, so a dish going sold out changes
            // colour without new markup.
            intent: { path: "/menu/statusIntent" },
          },
        ],
      },
      {
        id: "reserve_btn",
        component: "ConfirmButton",
        catalogId: A2UI_OPS_CATALOG,
        label: "예약하기",
        confirmLabel: "예약을 요청할까요?",
        // Consequential action → built-in confirm step, then P2P hop to the owner.
        intent: "good",
        action: { name: "request_reservation" },
      },
    );

    return [
      {
        version: A2UI_VERSION,
        createSurface: { surfaceId: input.surfaceId, catalogId: A2UI_OPS_CATALOG },
      },
      {
        version: A2UI_VERSION,
        updateDataModel: { surfaceId: input.surfaceId, value: dataModel },
      },
      {
        version: A2UI_VERSION,
        updateComponents: { surfaceId: input.surfaceId, components },
      },
      {
        version: A2UI_VERSION,
        beginRendering: { surfaceId: input.surfaceId, root: "root" },
      },
    ];
  }

  /**
   * A follow-up op that flips a dish's availability WITHOUT re-sending the
   * component tree — the reason a store can stay on one IPFS CID while its
   * sell-out status changes through the day.
   */
  updateAvailability(surfaceId: string, itemIndex: number, soldOut: boolean): A2UIMessage[] {
    return [
      {
        version: A2UI_VERSION,
        updateDataModel: {
          surfaceId,
          path: `/menu/${itemIndex}`,
          value: {
            soldOut,
            statusText: soldOut ? "품절" : "판매중",
            statusIntent: soldOut ? ("bad" as Intent) : ("good" as Intent),
          },
        },
      },
    ];
  }

  /** Serializes ops to the JSONL stream an A2UI renderer consumes. */
  toJsonl(messages: A2UIMessage[]): string {
    return messages.map((m) => JSON.stringify(m)).join("\n");
  }
}

export const a2uiSurfaceBuilder = new A2UISurfaceBuilder();
