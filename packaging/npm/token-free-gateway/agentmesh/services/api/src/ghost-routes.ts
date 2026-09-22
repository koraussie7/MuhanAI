import {
	createGhostRegistry,
	createHostAllowlist,
	discoverGhostAgentCard,
	GhostFetchError,
	type GhostFetchPolicy,
	type GhostNode,
} from "@agentmesh/ghost-adapter";
import type { FastifyInstance } from "fastify";

export const ghostRegistry = createGhostRegistry();

/** Allowlist entries from `GHOST_NODE_URL_ALLOWLIST` (comma-separated). */
function configuredAllowlist() {
	const raw = process.env.GHOST_NODE_URL_ALLOWLIST;
	if (!raw) return undefined;
	return createHostAllowlist(raw.split(","));
}

function ghostFetchPolicy(): GhostFetchPolicy {
	return {
		// Resolved at call time so tests can swap globalThis.fetch.
		fetchImpl: (input, init) => globalThis.fetch(input, init),
		allowlist: configuredAllowlist(),
	};
}

/** Constant-time string compare (same pattern as the API-key check in server.ts). */
function timingSafeEqual(a: string | undefined, b: string | undefined): boolean {
	if (typeof a !== "string" || typeof b !== "string") return false;
	if (a.length !== b.length) return false;
	let result = 0;
	for (let i = 0; i < a.length; i++) {
		result |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return result === 0;
}

function firstHeader(headers: Record<string, unknown>, name: string): string | undefined {
	const value = headers[name];
	return Array.isArray(value) ? value[0] : (value as string | undefined);
}

/**
 * Registration credentials. A Ghost install gets a scoped
 * `GHOST_REGISTRATION_TOKEN` (sent as `x-ghost-token`) rather than the
 * platform-wide API key. Operators may also register with the platform
 * `x-api-key` (the global onRequest hook in server.ts already validates
 * it). With neither credential configured, only a non-production dev server
 * (DISABLE_AUTH=true) may register — the same fail-closed posture as the
 * global hook.
 */
function registrationAuthorized(headers: Record<string, unknown>): boolean {
	const ghostToken = process.env.GHOST_REGISTRATION_TOKEN;
	if (ghostToken && timingSafeEqual(firstHeader(headers, "x-ghost-token"), ghostToken)) {
		return true;
	}
	const apiKey = process.env.API_KEY;
	if (apiKey && timingSafeEqual(firstHeader(headers, "x-api-key"), apiKey)) {
		return true;
	}
	return (
		!ghostToken &&
		!apiKey &&
		process.env.DISABLE_AUTH === "true" &&
		process.env.NODE_ENV !== "production"
	);
}

/** Map a blocked/failed discovery onto the right HTTP status. */
function statusForFetchError(error: GhostFetchError): number {
	switch (error.code) {
		case "invalid_url":
		case "unsupported_scheme":
			return 400;
		case "internal_url_blocked":
		case "url_not_allowed":
			return 403;
		default:
			return 502;
	}
}

// Registry keys end up in dashboards and logs; keep them boring.
const NODE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

interface RegisterGhostBody {
	nodeId: string;
	url: string;
}

export async function ghostRoutes(app: FastifyInstance) {
	app.get("/api/ghost/nodes", async () => ghostRegistry.list());

	app.post<{ Body: RegisterGhostBody }>("/api/ghost/nodes", async (request, reply) => {
		if (!registrationAuthorized(request.headers)) {
			return reply.code(401).send({
				error: "ghost_registration_unauthorized",
				message: "provide x-ghost-token (GHOST_REGISTRATION_TOKEN) or x-api-key",
			});
		}

		const nodeId = request.body?.nodeId?.trim();
		const baseUrl = request.body?.url?.trim();
		if (!nodeId || !baseUrl) {
			return reply.code(400).send({ error: "nodeId and url are required" });
		}
		if (!NODE_ID_PATTERN.test(nodeId)) {
			return reply.code(400).send({
				error: "invalid_node_id",
				message: "nodeId must match /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/",
			});
		}

		// SSRF guard: scheme, embedded credentials, internal hosts (literal and
		// DNS-resolved, per redirect hop), optional host allowlist, response
		// size/type/timeout caps. See @agentmesh/ghost-adapter ssrf.ts.
		try {
			const card = await discoverGhostAgentCard(baseUrl, ghostFetchPolicy());
			const node: GhostNode = { nodeId, card, lastSeenAt: Date.now() };
			ghostRegistry.upsert(node);
			return reply.code(201).send(node);
		} catch (error) {
			if (error instanceof GhostFetchError) {
				return reply.code(statusForFetchError(error)).send({
					error: error.code,
					message: error.message,
				});
			}
			// parseGhostAgentCard throws plain Errors for malformed cards.
			return reply.code(502).send({
				error: "invalid_agent_card",
				message: error instanceof Error ? error.message : "Agent Card request failed",
			});
		}
	});
}
