import type { XLangPeerInfo } from "@agentmesh/ai-engine";

export interface XLangRegistrySnapshot {
	peers: XLangPeerInfo[];
	updatedAt?: string;
}

export interface XLangRegistryClientOptions {
	endpoint?: string;
	fetcher?: typeof fetch;
	signal?: AbortSignal;
}

function isPeerInfo(value: unknown): value is XLangPeerInfo {
	if (!value || typeof value !== "object") return false;
	const peer = value as Record<string, unknown>;
	if (typeof peer.peerId !== "string" || typeof peer.endpoint !== "string") return false;
	try {
		const protocol = new URL(peer.endpoint).protocol;
		if (!["http:", "https:", "ws:", "wss:"].includes(protocol)) return false;
	} catch {
		return false;
	}
	if (peer.runtime !== "xlang" || typeof peer.supportsStreaming !== "boolean") return false;
	return (
		Array.isArray(peer.capabilities) &&
		peer.capabilities.every((capability) => {
			if (!capability || typeof capability !== "object") return false;
			return typeof (capability as { name?: unknown }).name === "string";
		})
	);
}

export function parseXLangRegistrySnapshot(value: unknown): XLangRegistrySnapshot {
	const rawPeers = Array.isArray(value)
		? value
		: value && typeof value === "object" && Array.isArray((value as { peers?: unknown }).peers)
			? (value as { peers: unknown[] }).peers
			: null;
	if (!rawPeers) throw new Error("XLang registry response must contain a peers array");
	const peers = rawPeers.filter(isPeerInfo);
	if (peers.length !== rawPeers.length)
		throw new Error("XLang registry response contains invalid peers");
	return {
		peers,
		...(value &&
		typeof value === "object" &&
		typeof (value as { updatedAt?: unknown }).updatedAt === "string"
			? { updatedAt: (value as { updatedAt: string }).updatedAt }
			: {}),
	};
}

export async function fetchXLangRegistrySnapshot(
	options: XLangRegistryClientOptions = {},
): Promise<XLangRegistrySnapshot> {
	const endpoint =
		options.endpoint ?? import.meta.env.VITE_XLANG_REGISTRY_URL ?? "/api/xlang/peers";
	const response = await (options.fetcher ?? fetch)(endpoint, {
		headers: { Accept: "application/json" },
		signal: options.signal,
	});
	if (!response.ok) throw new Error(`XLang registry returned HTTP ${response.status}`);
	return parseXLangRegistrySnapshot(await response.json());
}
