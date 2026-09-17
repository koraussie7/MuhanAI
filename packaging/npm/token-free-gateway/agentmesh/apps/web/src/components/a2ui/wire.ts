/**
 * A2UI v1.0 renderer for the MuhanAI web app (React 19).
 *
 * The factory emits a framework-neutral A2UI surface (`a2ui/surface.jsonl`);
 * this is the React half of the contract. It consumes the same four ops —
 * createSurface / updateDataModel / updateComponents / beginRendering — and
 * renders the ops catalog (DataTable, KeyValue, Callout, ConfirmButton, ...).
 *
 * Deliberately NOT shared with the Svelte renderer in the auri reference
 * deployment: the wire format is the contract, not the component code. This
 * file depends only on the spec.
 */

/** RFC 6901 JSON Pointer read against the surface data model. */
export type DataBinding = { path: string };
export type DynamicValue = string | number | boolean | DataBinding;

export interface A2UIComponent {
  id: string;
  component: string;
  catalogId: string;
  [prop: string]: unknown;
}

export interface DataTableColumn {
  key: string;
  label: string;
  format?: "currency" | "number" | "text";
  currency?: string;
  intent?: DynamicValue;
}

export type A2UIMessage =
  | { version: string; createSurface: { surfaceId: string; catalogId: string } }
  | { version: string; updateDataModel: { surfaceId: string; path?: string; value: unknown } }
  | { version: string; updateComponents: { surfaceId: string; components: A2UIComponent[] } }
  | { version: string; beginRendering: { surfaceId: string; root: string } };

/** Accumulated render state for one surface. */
export interface SurfaceState {
  surfaceId: string;
  catalogId: string;
  data: Record<string, unknown>;
  components: Record<string, A2UIComponent>;
  root: string | null;
}

/** Type guard helpers — the op union has no discriminant besides its key. */
export function isCreateSurface(
  m: A2UIMessage,
): m is Extract<A2UIMessage, { createSurface: unknown }> {
  return "createSurface" in m;
}
export function isUpdateDataModel(
  m: A2UIMessage,
): m is Extract<A2UIMessage, { updateDataModel: unknown }> {
  return "updateDataModel" in m;
}
export function isUpdateComponents(
  m: A2UIMessage,
): m is Extract<A2UIMessage, { updateComponents: unknown }> {
  return "updateComponents" in m;
}
export function isBeginRendering(
  m: A2UIMessage,
): m is Extract<A2UIMessage, { beginRendering: unknown }> {
  return "beginRendering" in m;
}

/**
 * Applies A2UI ops in order and returns the resulting surface state.
 *
 * Folds rather than mutating so a replayed stream is deterministic — the same
 * ops always produce the same tree, which is what makes the surface cacheable
 * alongside its IPFS CID.
 */
export function applyOps(ops: A2UIMessage[], seed?: Partial<SurfaceState>): SurfaceState {
  const state: SurfaceState = {
    surfaceId: seed?.surfaceId ?? "",
    catalogId: seed?.catalogId ?? "",
    data: seed?.data ? structuredClone(seed.data) : {},
    components: seed?.components ? structuredClone(seed.components) : {},
    root: seed?.root ?? null,
  };

  for (const op of ops) {
    if (isCreateSurface(op)) {
      state.surfaceId = op.createSurface.surfaceId;
      state.catalogId = op.createSurface.catalogId;
      continue;
    }
    if (isUpdateDataModel(op)) {
      // A path narrows the write to one subtree; no path replaces the model.
      if (op.updateDataModel.path) {
        writePointer(state.data, op.updateDataModel.path, op.updateDataModel.value);
      } else {
        state.data = structuredClone(op.updateDataModel.value) as Record<string, unknown>;
      }
      continue;
    }
    if (isUpdateComponents(op)) {
      for (const c of op.updateComponents.components) {
        state.components[c.id] = c;
      }
      continue;
    }
    if (isBeginRendering(op)) {
      state.root = op.beginRendering.root;
    }
  }

  return state;
}

/** Parses a JSONL stream into ops, tolerating blank lines. */
export function parseJsonl(jsonl: string): A2UIMessage[] {
  return jsonl
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as A2UIMessage);
}

/**
 * Reads an RFC 6901 pointer, e.g. `/menu/0/statusIntent`.
 * Returns undefined for any missing segment rather than throwing, so a partial
 * data model degrades to `undefined` instead of crashing the render.
 */
export function readPointer(data: unknown, pointer: string): unknown {
  if (!pointer || pointer === "/") return data;
  const segments = pointer
    .split("/")
    .slice(1)
    .map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
  let cursor: unknown = data;
  for (const segment of segments) {
    if (cursor === null || cursor === undefined) return undefined;
    if (Array.isArray(cursor)) {
      const idx = Number(segment);
      cursor = Number.isInteger(idx) ? cursor[idx] : undefined;
    } else if (typeof cursor === "object") {
      cursor = (cursor as Record<string, unknown>)[segment];
    } else {
      return undefined;
    }
  }
  return cursor;
}

/** Writes an RFC 6901 pointer, creating intermediate objects as needed. */
function writePointer(data: Record<string, unknown>, pointer: string, value: unknown): void {
  const segments = pointer
    .split("/")
    .slice(1)
    .map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
  if (segments.length === 0) return;

  let cursor: Record<string, unknown> = data;
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    if (segment === undefined) return;
    const next = cursor[segment];
    if (typeof next !== "object" || next === null) {
      cursor[segment] = {};
    }
    cursor = cursor[segment] as Record<string, unknown>;
  }
  const last = segments[segments.length - 1];
  if (last !== undefined) cursor[last] = value;
}

/**
 * Resolves a wire value: bindings are read from the data model, literals pass
 * through. This is the single place the "raw value on the wire, formatted at
 * the renderer" rule is honored.
 *
 * `rowScoped` applies when the caller has already narrowed to the array item
 * the binding points at (e.g. a table cell resolving `/menu/statusIntent`
 * against the row itself). In that case only the binding's final segment is
 * meaningful — reading the full path would always miss.
 */
export function resolveValue(
  value: DynamicValue | undefined,
  data: unknown,
  rowScoped = false,
): unknown {
  if (value && typeof value === "object" && "path" in value) {
    if (rowScoped) {
      const segments = value.path.split("/").filter(Boolean);
      const last = segments[segments.length - 1];
      if (last === undefined) return undefined;
      return readPointer(data, `/${last}`);
    }
    return readPointer(data, value.path);
  }
  return value;
}
