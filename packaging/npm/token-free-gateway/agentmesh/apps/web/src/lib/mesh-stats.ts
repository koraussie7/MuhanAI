/**
 * Centralized mesh statistics helper.
 *
 * Goal: no hardcoded peer/agent/human counts in UI components or README.
 * When running in demo mode (VITE_DEMO=true), the helper renders the demo
 * seed value with a "(demo)" badge so it is never mistaken for live data.
 * In production, real numbers come from the /api/pulse endpoint.
 */

export const DEMO_PEER_COUNT = 12_482;
export const DEMO_HUMAN_COUNT = 3_821;

export const isDemo = (): boolean =>
  typeof import.meta !== "undefined" &&
  (import.meta.env?.VITE_DEMO === "true" ||
    (typeof process !== "undefined" && process.env?.NODE_ENV === "development"));

export function formatPeerCount(n: number | undefined): string {
  if (n == null || isDemo()) {
    return `${DEMO_PEER_COUNT.toLocaleString()} (demo)`;
  }
  return n.toLocaleString();
}

export function formatHumanCount(n: number | undefined): string {
  if (n == null || isDemo()) {
    return `${DEMO_HUMAN_COUNT.toLocaleString()} (demo)`;
  }
  return n.toLocaleString();
}

export function formatPeerCountBare(n: number | undefined): string {
  if (n == null || isDemo()) {
    return DEMO_PEER_COUNT.toLocaleString();
  }
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
