/**
 * Browser client for P2P inference telemetry and dispatch.
 *
 * The dashboard must never talk to an inference peer directly: peer
 * endpoints are discovered through the Worker, and dispatch stays behind the
 * same Worker so credentials and peer selection stay server-side. This client
 * only reads `/api/p2p/peers` and posts to `/api/p2p/inference`.
 */

export type P2pPeerProtocol = "openhydra" | "xlang" | "ollama" | "libp2p";

export type P2pPeerStatus = "healthy" | "degraded" | "offline";

export interface P2pInferencePeer {
	id: string;
	peerId: string;
	name: string;
	protocol: P2pPeerProtocol;
	status: P2pPeerStatus;
	latencyMs: number;
	models: string[];
	capabilities: string[];
	lastSeen: number;
}

export interface P2pPeerSnapshot {
	peers: P2pInferencePeer[];
	updatedAt?: string;
}

export interface P2pInferenceRequest {
	peerId?: string;
	prompt: string;
	model?: string;
	maxTokens?: number;
	temperature?: number;
}

export interface P2pInferenceResult {
	peerId: string;
	provider: string;
	model: string;
	tier: string;
	text: string;
	latencyMs: number;
	tokens?: number;
}

const PROTOCOLS: readonly P2pPeerProtocol[] = ["openhydra", "xlang", "ollama", "libp2p"];
const STATUSES: readonly P2pPeerStatus[] = ["healthy", "degraded", "offline"];

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

/** Drop malformed peer records instead of rendering unchecked data. */
export function parseP2pPeerSnapshot(value: unknown): P2pPeerSnapshot {
	const list = Array.isArray(value)
		? value
		: value && typeof value === "object" && Array.isArray((value as { peers?: unknown }).peers)
			? (value as { peers: unknown[] }).peers
			: null;
	if (!list) throw new Error("P2P peer response must contain a peers array");

	const peers: P2pInferencePeer[] = [];
	for (const entry of list) {
		if (!entry || typeof entry !== "object") continue;
		const peer = entry as Record<string, unknown>;
		if (!isNonEmptyString(peer.id) || !isNonEmptyString(peer.peerId)) continue;
		if (!PROTOCOLS.includes(peer.protocol as P2pPeerProtocol)) continue;
		if (!STATUSES.includes(peer.status as P2pPeerStatus)) continue;
		if (typeof peer.latencyMs !== "number" || !Number.isFinite(peer.latencyMs)) continue;
		if (typeof peer.lastSeen !== "number" || !Number.isFinite(peer.lastSeen)) continue;
		peers.push({
			id: peer.id,
			peerId: peer.peerId,
			name: isNonEmptyString(peer.name) ? peer.name : peer.peerId,
			protocol: peer.protocol as P2pPeerProtocol,
			status: peer.status as P2pPeerStatus,
			latencyMs: peer.latencyMs,
			models: isStringArray(peer.models) ? peer.models : [],
			capabilities: isStringArray(peer.capabilities) ? peer.capabilities : [],
			lastSeen: peer.lastSeen,
		});
	}

	const updatedAt =
		value &&
		typeof value === "object" &&
		typeof (value as { updatedAt?: unknown }).updatedAt === "string"
			? (value as { updatedAt: string }).updatedAt
			: undefined;

	return { peers, ...(updatedAt ? { updatedAt } : {}) };
}

export function parseP2pInferenceResult(value: unknown): P2pInferenceResult {
	if (!value || typeof value !== "object")
		throw new Error("P2P inference response is not an object");
	const result = value as Record<string, unknown>;
	if (!isNonEmptyString(result.peerId)) throw new Error("P2P inference response is missing peerId");
	if (typeof result.text !== "string") throw new Error("P2P inference response is missing text");
	return {
		peerId: result.peerId,
		provider: isNonEmptyString(result.provider) ? result.provider : "p2p",
		model: isNonEmptyString(result.model) ? result.model : "unknown",
		tier: isNonEmptyString(result.tier) ? result.tier : "p2p",
		text: result.text,
		latencyMs: typeof result.latencyMs === "number" ? result.latencyMs : 0,
		...(typeof result.tokens === "number" ? { tokens: result.tokens } : {}),
	};
}

async function readJson(response: Response): Promise<unknown> {
	try {
		return await response.json();
	} catch {
		throw new Error(`P2P request returned non-JSON (HTTP ${response.status})`);
	}
}

export async function fetchP2pPeers(
	fetcher: typeof fetch = fetch,
	signal?: AbortSignal,
): Promise<P2pPeerSnapshot> {
	const response = await fetcher("/api/p2p/peers", {
		headers: { Accept: "application/json" },
		...(signal ? { signal } : {}),
	});
	if (!response.ok) throw new Error(`P2P peer list failed with HTTP ${response.status}`);
	return parseP2pPeerSnapshot(await readJson(response));
}

export async function runP2pInference(
	request: P2pInferenceRequest,
	fetcher: typeof fetch = fetch,
	signal?: AbortSignal,
): Promise<P2pInferenceResult> {
	if (!request.prompt.trim()) throw new Error("P2P inference requires a prompt");
	const response = await fetcher("/api/p2p/inference", {
		method: "POST",
		headers: { "content-type": "application/json", Accept: "application/json" },
		body: JSON.stringify(request),
		...(signal ? { signal } : {}),
	});
	if (!response.ok) throw new Error(`P2P inference failed with HTTP ${response.status}`);
	return parseP2pInferenceResult(await readJson(response));
}
