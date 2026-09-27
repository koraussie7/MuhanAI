/**
 * P2P inference endpoints for the Worker.
 *
 * `GET  /api/p2p/peers`      — public peer snapshot for the dashboard
 * `POST /api/p2p/inference`  — dispatch a prompt to a peer and return the result
 *
 * Peer endpoints are supplied through the `P2P_PEERS_JSON` binding so the
 * Worker never holds routing state. The inference request is validated and
 * size-limited here; a real deployment forwards to the selected peer.
 */

import { parseXLangPeerSnapshotJson } from "./xlang-peers";

export interface P2pInferencePeerRecord {
	id: string;
	peerId: string;
	name?: string;
	protocol: "openhydra" | "xlang" | "ollama" | "libp2p";
	status: "healthy" | "degraded" | "offline";
	latencyMs: number;
	models?: string[];
	capabilities?: string[];
	lastSeen: number;
}

const PROTOCOLS = new Set(["openhydra", "xlang", "ollama", "libp2p"]);
const STATUSES = new Set(["healthy", "degraded", "offline"]);
const MAX_PROMPT_LENGTH = 8_000;
const MAX_TOKENS_CEILING = 4_096;

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function parsePeerRecord(value: unknown): P2pInferencePeerRecord | null {
	if (!value || typeof value !== "object") return null;
	const peer = value as Record<string, unknown>;
	if (typeof peer.id !== "string" || peer.id.trim() === "") return null;
	if (typeof peer.peerId !== "string" || peer.peerId.trim() === "") return null;
	if (!PROTOCOLS.has(String(peer.protocol))) return null;
	if (!STATUSES.has(String(peer.status))) return null;
	if (typeof peer.latencyMs !== "number" || !Number.isFinite(peer.latencyMs)) return null;
	if (typeof peer.lastSeen !== "number" || !Number.isFinite(peer.lastSeen)) return null;
	return {
		id: peer.id,
		peerId: peer.peerId,
		...(typeof peer.name === "string" && peer.name.trim() !== "" ? { name: peer.name } : {}),
		protocol: peer.protocol as P2pInferencePeerRecord["protocol"],
		status: peer.status as P2pInferencePeerRecord["status"],
		latencyMs: peer.latencyMs,
		...(isStringArray(peer.models) ? { models: peer.models } : {}),
		...(isStringArray(peer.capabilities) ? { capabilities: peer.capabilities } : {}),
		lastSeen: peer.lastSeen,
	};
}

function isEmptyStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/**
 * Read peers from `P2P_PEERS_JSON` and fall back to the XLang capability
 * snapshot so XLang peers appear even when the P2P binding is unset.
 */
export function collectP2pPeers(env: {
	P2P_PEERS_JSON?: string;
	XLANG_PEERS_JSON?: string;
}): P2pInferencePeerRecord[] {
	const peers = new Map<string, P2pInferencePeerRecord>();
	const now = Date.now();

	if (env.P2P_PEERS_JSON) {
		try {
			const parsed: unknown = JSON.parse(env.P2P_PEERS_JSON);
			const list = Array.isArray(parsed)
				? parsed
				: isEmptyStringArray((parsed as { peers?: unknown })?.peers)
					? []
					: Array.isArray((parsed as { peers?: unknown[] }).peers)
						? (parsed as { peers: unknown[] }).peers
						: [];
			for (const entry of list) {
				const peer = parsePeerRecord(entry);
				if (peer) peers.set(peer.id, peer);
			}
		} catch {
			// Ignore malformed configuration and fall through to XLang peers.
		}
	}

	for (const xlang of parseXLangPeerSnapshotJson(env.XLANG_PEERS_JSON)) {
		if (peers.has(xlang.peerId)) continue;
		peers.set(xlang.peerId, {
			id: xlang.peerId,
			peerId: xlang.peerId,
			name: xlang.peerId,
			protocol: "xlang",
			status: "healthy",
			latencyMs: 0,
			models: xlang.models ?? [],
			capabilities: xlang.capabilities.map((capability) => capability.name),
			lastSeen: now,
		});
	}

	return [...peers.values()];
}

function json(body: unknown, status: number, extraHeaders?: Record<string, string>): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json", ...(extraHeaders ?? {}) },
	});
}

function handlePeerList(
	request: Request,
	env: { P2P_PEERS_JSON?: string; XLANG_PEERS_JSON?: string },
): Response {
	if (request.method !== "GET" && request.method !== "HEAD") {
		return json({ error: "method-not-allowed" }, 405, { allow: "GET, HEAD" });
	}
	return json({ peers: collectP2pPeers(env), updatedAt: new Date().toISOString() }, 200, {
		"cache-control": "public, max-age=15",
	});
}

interface InferenceBody {
	peerId?: string;
	prompt: string;
	model?: string;
	maxTokens?: number;
	temperature?: number;
}

function parseInferenceBody(value: unknown): InferenceBody | null {
	if (!value || typeof value !== "object") return null;
	const body = value as Record<string, unknown>;
	if (typeof body.prompt !== "string" || body.prompt.trim().length === 0) return null;
	if (body.prompt.length > MAX_PROMPT_LENGTH) return null;
	const parsed: InferenceBody = { prompt: body.prompt };
	if (typeof body.peerId === "string" && body.peerId.trim() !== "") parsed.peerId = body.peerId;
	if (typeof body.model === "string" && body.model.trim() !== "") parsed.model = body.model;
	if (typeof body.temperature === "number" && Number.isFinite(body.temperature)) {
		parsed.temperature = body.temperature;
	}
	if (
		typeof body.maxTokens === "number" &&
		Number.isFinite(body.maxTokens) &&
		body.maxTokens > 0 &&
		body.maxTokens <= MAX_TOKENS_CEILING
	) {
		parsed.maxTokens = body.maxTokens;
	}
	return parsed;
}

async function handleInference(
	request: Request,
	env: { P2P_PEERS_JSON?: string; XLANG_PEERS_JSON?: string; P2P_INFERENCE_ORIGIN?: string },
): Promise<Response> {
	if (request.method !== "POST") {
		return json({ error: "method-not-allowed" }, 405, { allow: "POST" });
	}

	let payload: unknown;
	try {
		payload = await request.json();
	} catch {
		return json({ error: "invalid-json" }, 400);
	}

	const body = parseInferenceBody(payload);
	if (!body) {
		return json(
			{
				error: "invalid-request",
				message: `prompt is required and must be at most ${MAX_PROMPT_LENGTH} characters`,
			},
			400,
		);
	}

	const peers = collectP2pPeers(env);
	if (peers.length === 0) {
		return json(
			{
				error: "no-peers",
				message: "No P2P inference peer is registered. Set P2P_PEERS_JSON on the Worker.",
			},
			503,
		);
	}

	const target = body.peerId ? peers.find((peer) => peer.id === body.peerId) : undefined;
	if (body.peerId && !target) {
		return json({ error: "unknown-peer", peerId: body.peerId }, 404);
	}
	const selected = target ?? peers.find((peer) => peer.status === "healthy") ?? peers[0];
	if (!selected) {
		return json({ error: "no-peers" }, 503);
	}

	if (!env.P2P_INFERENCE_ORIGIN) {
		return json(
			{
				error: "dispatch-not-configured",
				message: "Set P2P_INFERENCE_ORIGIN to the mesh gateway that forwards prompts to peers.",
				peerId: selected.peerId,
			},
			503,
		);
	}

	const started = Date.now();
	try {
		const upstream = await fetch(new URL("/v1/chat/completions", env.P2P_INFERENCE_ORIGIN), {
			method: "POST",
			headers: { "content-type": "application/json", Accept: "application/json" },
			body: JSON.stringify({
				model: body.model ?? selected.models[0] ?? "local",
				messages: [{ role: "user", content: body.prompt }],
				...(body.maxTokens ? { max_tokens: body.maxTokens } : {}),
				...(body.temperature === undefined ? {} : { temperature: body.temperature }),
			}),
			signal: AbortSignal.timeout(30_000),
		});

		if (!upstream.ok) {
			return json({ error: "peer-failed", peerId: selected.peerId, status: upstream.status }, 502);
		}

		const data = (await upstream.json().catch(() => null)) as {
			choices?: Array<{ message?: { content?: string } }>;
			text?: string;
			model?: string;
		} | null;
		const text = data?.choices?.[0]?.message?.content ?? data?.text ?? "";
		if (typeof text !== "string" || text.trim() === "") {
			return json({ error: "empty-response", peerId: selected.peerId }, 502);
		}

		return json(
			{
				peerId: selected.peerId,
				provider: `p2p-${selected.protocol}`,
				model: data?.model ?? body.model ?? selected.models[0] ?? "local",
				tier: selected.protocol === "xlang" ? "workflow-peer" : "p2p",
				text,
				latencyMs: Date.now() - started,
			},
			200,
		);
	} catch (error) {
		return json(
			{
				error: "dispatch-failed",
				peerId: selected.peerId,
				message: error instanceof Error ? error.message : "dispatch failed",
			},
			502,
		);
	}
}

export function handleP2pInferenceRequest(
	request: Request,
	env: {
		P2P_PEERS_JSON?: string;
		XLANG_PEERS_JSON?: string;
		P2P_INFERENCE_ORIGIN?: string;
	},
): Promise<Response> | Response {
	const url = new URL(request.url);
	if (url.pathname === "/api/p2p/peers") return handlePeerList(request, env);
	if (url.pathname === "/api/p2p/inference") return handleInference(request, env);
	return new Response(null, { status: 404 });
}
