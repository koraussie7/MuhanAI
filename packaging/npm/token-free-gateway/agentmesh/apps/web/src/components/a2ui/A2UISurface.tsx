import { type ReactNode, useMemo } from "react";
import { catalog } from "./catalog.js";
import type { A2UIComponent, A2UIMessage, SurfaceState } from "./wire.js";
import { applyOps, readPointer } from "./wire.js";

/**
 * Resolves bindings nested anywhere inside a prop value.
 *
 * `resolveValue` only handles a binding at the top level, but the wire nests
 * them: a DataTable column carries `intent: { path: "/menu/statusIntent" }`
 * inside the `columns` array. Resolving shallowly left every column neutral.
 *
 * Bindings that point at a per-row field (like the status column) are *not*
 * resolved here — they have no single value at the table level — so they are
 * passed through for the component to resolve against each row.
 */
function resolveDeep(value: unknown, data: unknown, inArray = false): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => resolveDeep(v, data, true));
  }
  if (value && typeof value === "object") {
    if ("path" in (value as Record<string, unknown>)) {
      // A row-scoped binding stays bound so the row renderer can resolve it.
      if (inArray) return value;
      return readPointer(data, String((value as { path: unknown }).path));
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = resolveDeep(v, data, inArray);
    }
    return out;
  }
  return value;
}

/** Turns `children: ["a","b"]` into React nodes by walking the registry. */
function renderComponent(
  component: A2UIComponent,
  state: SurfaceState,
  onAction?: (name: string) => void,
  seen: Set<string> = new Set(),
): ReactNode {
  // Guard against a malformed tree that points at itself or forms a cycle.
  if (seen.has(component.id)) return null;
  seen.add(component.id);

  const impl = catalog[component.component];
  if (!impl) {
    // Unknown component: degrade visibly instead of blanking the surface.
    return (
      <div className="a2ui-unknown" data-component={component.component}>
        Unknown A2UI component: <code>{component.component}</code>
      </div>
    );
  }

  // Resolve props through the data model, then expand children.
  const props: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(component)) {
    if (key === "id" || key === "component" || key === "catalogId" || key === "children") continue;
    props[key] = resolveDeep(raw, state.data);
  }

  const childIds = Array.isArray(component.children) ? (component.children as string[]) : [];
  if (childIds.length) {
    // Key by child id so React can reconcile a re-rendered surface (e.g. after
    // an updateDataModel patch) instead of remounting the whole subtree.
    props.children = childIds.map((id) => {
      const child = state.components[id];
      if (!child) return null;
      return <span key={id}>{renderComponent(child, state, onAction, seen)}</span>;
    });
  }
  if (onAction) props.onAction = onAction;

  return impl(props);
}

export function A2UISurface({
  ops,
  state: prebuilt,
  onAction,
}: {
  /** Raw ops; ignored when `state` is supplied. */
  ops?: A2UIMessage[];
  /** Pre-folded surface state, e.g. after an updateDataModel-only patch. */
  state?: SurfaceState;
  onAction?: (name: string) => void;
}) {
  const state = useMemo(() => prebuilt ?? applyOps(ops ?? []), [prebuilt, ops]);

  if (!state.root) {
    return (
      <div className="a2ui-surface" data-state="loading">
        표시할 화면이 아직 준비되지 않았습니다.
      </div>
    );
  }

  const root = state.components[state.root];
  if (!root) {
    return (
      <div className="a2ui-surface" data-state="error">
        루트 컴포넌트 <code>{state.root}</code>를 찾을 수 없습니다.
      </div>
    );
  }

  return (
    <div
      className="a2ui-surface"
      data-surface-id={state.surfaceId}
      data-catalog-id={state.catalogId}
    >
      {renderComponent(root, state, onAction)}
    </div>
  );
}
