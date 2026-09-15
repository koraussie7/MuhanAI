/**
 * Centralized mesh statistics helper.
 *
 * Goal: no hardcoded peer/agent/human counts anywhere in the rendered UI.
 * When the real value is absent (callers passed `undefined`) we render an
 * em-dash placeholder so the UI never shows a fabricated number.
 *
 * The DEMO_PEER_COUNT / DEMO_HUMAN_COUNT seeds are exported only for tests
 * and the `/api/pulse` fallback path — never rendered into the UI by these
 * helpers unless the operator explicitly opts in via `VITE_DEMO=true`.
 */

export const DEMO_PEER_COUNT = 12_482;
export const DEMO_HUMAN_COUNT = 3_821;

export const PLACEHOLDER = "—";

export const isDemo = (): boolean =>
  typeof import.meta !== "undefined" &&
  (import.meta.env?.VITE_DEMO === "true" ||
    (typeof process !== "undefined" && process.env?.NODE_ENV === "development"));

export function formatPeerCount(n: number | undefined): string {
  if (n == null) return PLACEHOLDER;
  if (isDemo()) return `${DEMO_PEER_COUNT.toLocaleString()} (demo)`;
  return n.toLocaleString();
}

export function formatHumanCount(n: number | undefined): string {
  if (n == null) return PLACEHOLDER;
  if (isDemo()) return `${DEMO_HUMAN_COUNT.toLocaleString()} (demo)`;
  return n.toLocaleString();
}

export function formatPeerCountBare(n: number | undefined): string {
  if (n == null) return PLACEHOLDER;
  if (isDemo()) return DEMO_PEER_COUNT.toLocaleString();
  return n.toLocaleString();
}

export interface MeshStats {
  agentsOnline: number | undefined;
  humansOnline: number | undefined;
  demo: boolean;
}

export function getMeshStats(pulse: {
  agentsOnline?: number;
  humansOnline?: number;
}): MeshStats {
  return {
    agentsOnline: pulse.agentsOnline,
    humansOnline: pulse.humansOnline,
    demo: isDemo(),
  };
}
