/**
 * XLang peer snapshot source for the Worker.
 *
 * The authoritative `XLangRegistry` lives in `packages/llm-router` and is
 * populated by the AgentMesh node process from Gossipsub capability
 * announcements. A Cloudflare Worker cannot import that package directly
 * (it pulls Node-only libp2p and OpenAI SDK dependencies into the bundle),
 * so this module mirrors only the public, browser-safe projection of the
 * registry and serves it to the dashboard.
 *
 * Privacy: the snapshot never contains peer private keys, tokens, or
 * libp2p private multiaddrs. Only the fields required to reach a peer are
 * exported.
 */

export interface XLangPeerSnapshot {
	peerId: string;
	endpoint: string;
	runtime: "xlang";
	capabilities: Array<{ name: string; kind: "model" | "tool" | "device" | "workflow" }>;
	models?: string[];
	supportsStreaming: boolean;
}

const ALLOWED_SCHEMES = new Set(["http:", "https:", "ws:", "wss:"]);
const ALLOWED_KINDS = new Set(["model", "tool", "device", "workflow"]);

function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

export function toXLangPeerSnapshot(value: unknown): XLangPeerSnapshot | null {
	if (!value || typeof value !== "object") return null;
	const candidate = value as Record<string, unknown>;
	if (candidate.runtime !== "xlang") return null;
	if (!isNonEmptyString(candidate.peerId) || !isNonEmptyString(candidate.endpoint)) return null;
	try {
		if (!ALLOWED_SCHEMES.has(new URL(candidate.endpoint).protocol)) return null;
	} catch {
		return null;
	}
	if (typeof candidate.supportsStreaming !== "boolean") return null;
	if (!Array.isArray(candidate.capabilities)) return null;
	const capabilities: XLangPeerSnapshot["capabilities"] = [];
	for (const entry of candidate.capabilities) {
		if (!entry || typeof entry !== "object") return null;
		const capability = entry as Record<string, unknown>;
		if (!isNonEmptyString(capability.name) || !ALLOWED_KINDS.has(String(capability.kind))) {
			return null;
		}
		capabilities.push({
			name: capability.name,
			kind: capability.kind as XLangPeerSnapshot["capabilities"][number]["kind"],
		});
	}
	if (capabilities.length === 0) return null;
	return {
		peerId: candidate.peerId,
		endpoint: candidate.endpoint,
		runtime: "xlang",
		capabilities,
		...(Array.isArray(candidate.models) && candidate.models.every(isNonEmptyString)
			? { models: candidate.models as string[] }
			: {}),
		supportsStreaming: candidate.supportsStreaming,
	};
}

export function parseXLangPeerSnapshotJson(raw: string | undefined): XLangPeerSnapshot[] {
	if (!raw) return [];
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return [];
	}
	const list = Array.isArray(parsed)
		? parsed
		: parsed && typeof parsed === "object" && Array.isArray((parsed as { peers?: unknown }).peers)
			? (parsed as { peers: unknown[] }).peers
			: [];
	const peers = new Map<string, XLangPeerSnapshot>();
	for (const entry of list) {
		const peer = toXLangPeerSnapshot(entry);
		if (peer) peers.set(peer.peerId, peer);
	}
	return [...peers.values()];
}

export function handleXLangPeersRequest(
	request: Request,
	env: { XLANG_PEERS_JSON?: string },
): Response {
	const url = new URL(request.url);
	if (url.pathname !== "/api/xlang/peers") return new Response(null, { status: 404 });
	if (request.method !== "GET" && request.method !== "HEAD") {
		return new Response(JSON.stringify({ error: "method-not-allowed" }), {
			status: 405,
			headers: { "content-type": "application/json", allow: "GET, HEAD" },
		});
	}
	const peers = parseXLangPeerSnapshotJson(env.XLANG_PEERS_JSON);
	return new Response(JSON.stringify({ peers, updatedAt: new Date().toISOString() }), {
		status: 200,
		headers: {
			"content-type": "application/json",
			"cache-control": "public, max-age=30",
		},
	});
}
