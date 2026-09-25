/**
 * Centralized mesh statistics helper.
 *
 * Rules:
 * - Never invent a peer count in the UI unless demo mode is explicit.
 * - Demo mode comes from VITE_DEMO, or from API responses with `_demo: true`.
 * - NODE_ENV === "development" alone does NOT force demo numbers in production builds.
 */

export const DEMO_PEER_COUNT = 12_482;
export const DEMO_HUMAN_COUNT = 3_821;
export const PLACEHOLDER = "—";

/** Set from any /api/* response that includes `_demo: true`. */
let apiDemoFlag = false;

export function setApiDemoFlag(demo: boolean): void {
	apiDemoFlag = demo;
}

export function isDemo(): boolean {
	const viteDemo = typeof import.meta !== "undefined" && import.meta.env?.VITE_DEMO === "true";
	return Boolean(viteDemo || apiDemoFlag);
}

/** Call after every successful pulse (or other) JSON parse. */
export function ingestApiPayload(data: { _demo?: boolean } | null | undefined): void {
	if (data && typeof data._demo === "boolean") {
		setApiDemoFlag(data._demo);
	}
}

export function resolvePeerCount(
	n: number | undefined,
	opts?: { allowDemoSeed?: boolean },
): number | undefined {
	if (typeof n === "number" && Number.isFinite(n)) return n;
	if (opts?.allowDemoSeed && isDemo()) return DEMO_PEER_COUNT;
	return undefined;
}

export function formatPeerCount(n: number | undefined): string {
	const resolved = resolvePeerCount(n, { allowDemoSeed: true });
	if (resolved == null) return PLACEHOLDER;
	if (isDemo()) return `${resolved.toLocaleString()} (demo)`;
	return resolved.toLocaleString();
}

export function formatHumanCount(n: number | undefined): string {
	if (typeof n === "number" && Number.isFinite(n)) {
		return isDemo() ? `${n.toLocaleString()} (demo)` : n.toLocaleString();
	}
	if (isDemo()) return `${DEMO_HUMAN_COUNT.toLocaleString()} (demo)`;
	return PLACEHOLDER;
}

/** Bare number for tight UI; still appends (demo) when in demo mode. */
export function formatPeerCountBare(n: number | undefined): string {
	const resolved = resolvePeerCount(n, { allowDemoSeed: true });
	if (resolved == null) return PLACEHOLDER;
	if (isDemo()) return `${resolved.toLocaleString()} (demo)`;
	return resolved.toLocaleString();
}

export interface MeshStats {
	agentsOnline: number | undefined;
	humansOnline: number | undefined;
	peers: number | undefined;
	demo: boolean;
}

export function getMeshStats(pulse: {
	agentsOnline?: number;
	humansOnline?: number;
	peers?: number;
	_demo?: boolean;
}): MeshStats {
	ingestApiPayload(pulse);
	const rawPeers = pulse.peers ?? pulse.agentsOnline;
	const peers =
		typeof rawPeers === "number" && Number.isFinite(rawPeers)
			? rawPeers
			: resolvePeerCount(rawPeers, { allowDemoSeed: true });
	return {
		agentsOnline: pulse.agentsOnline,
		humansOnline: pulse.humansOnline,
		peers,
		demo: isDemo(),
	};
}
