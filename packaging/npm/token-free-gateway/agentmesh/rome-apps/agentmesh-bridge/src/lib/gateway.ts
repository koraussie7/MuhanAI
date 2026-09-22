/**
 * AgentMesh gateway client — pure functions with injected fetch so the bridge
 * logic can be tested outside a Rome runtime (see tests/rome-bridge-gateway.test.ts).
 *
 * Gateway defaults to the local agentmesh API (services/api listens on 3001);
 * override with the AGENTMESH_GATEWAY_URL env var.
 */

export interface RouteResponse {
	category: unknown;
	cast: unknown;
	knowledgeUsed?: unknown;
	runIds?: unknown;
	credits?: unknown;
}

export interface GatewayFetchResult<T> {
	ok: boolean;
	status: number;
	data: T | null;
	error: string | null;
}

/** Default gateway base URL (services/api dev port). */
export const DEFAULT_GATEWAY_URL = "http://127.0.0.1:3001";

export function resolveGatewayUrl(env?: Record<string, string | undefined>): string {
	const raw = env?.AGENTMESH_GATEWAY_URL?.trim();
	if (!raw) return DEFAULT_GATEWAY_URL;
	return raw.replace(/\/+$/, "");
}

function buildHeaders(env?: Record<string, string | undefined>): Record<string, string> {
	const headers: Record<string, string> = { "content-type": "application/json" };
	const token = env?.AGENTMESH_BRIDGE_TOKEN?.trim();
	if (token) headers.authorization = `Bearer ${token}`;
	return headers;
}

/** POST /api/route — runs the full multi-agent routing pipeline. */
export async function routeQuestion(
	input: { userId: string; question: string },
	deps?: { fetchImpl?: typeof fetch; env?: Record<string, string | undefined> },
): Promise<GatewayFetchResult<RouteResponse>> {
	const base = resolveGatewayUrl(deps?.env);
	const doFetch = deps?.fetchImpl ?? fetch;
	try {
		const res = await doFetch(`${base}/api/route`, {
			method: "POST",
			headers: buildHeaders(deps?.env),
			body: JSON.stringify({ userId: input.userId, question: input.question }),
		});
		const payload = (await res.json().catch(() => null)) as RouteResponse | null;
		if (!res.ok) {
			const message = (payload as { error?: string } | null)?.error ?? `gateway HTTP ${res.status}`;
			return { ok: false, status: res.status, data: null, error: message };
		}
		return { ok: true, status: res.status, data: payload, error: null };
	} catch (err) {
		return {
			ok: false,
			status: 0,
			data: null,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

/** GET /health — gateway liveness probe. */
export async function gatewayHealth(deps?: {
	fetchImpl?: typeof fetch;
	env?: Record<string, string | undefined>;
}): Promise<GatewayFetchResult<unknown>> {
	const base = resolveGatewayUrl(deps?.env);
	const doFetch = deps?.fetchImpl ?? fetch;
	try {
		const res = await doFetch(`${base}/health`, { headers: buildHeaders(deps?.env) });
		const payload = (await res.json().catch(() => null)) as unknown;
		return {
			ok: res.ok,
			status: res.status,
			data: payload,
			error: res.ok ? null : `HTTP ${res.status}`,
		};
	} catch (err) {
		return {
			ok: false,
			status: 0,
			data: null,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}
