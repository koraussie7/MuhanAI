/**
 * JSON-RPC client for the MuhanAI AgentMesh runtime.
 *
 * Zero-dependency: uses only the global `fetch`. All callers receive
 * `AgentMeshRpcClient`, which is seam-friendly for tests (pass a stub
 * `fetchImpl`). Errors are normalized to `AgentMeshRpcError` so elizaOS
 * actions can surface them without leaking HTTP details.
 */
import type {
	AgentMeshRpcClient,
	AgentMeshRpcConfig,
	CastTaskRequest,
	CastTaskResult,
	CreditLedgerEntry,
	HeartbeatEnvelope,
	ReputationSnapshot,
} from "./types.js";

export class AgentMeshRpcError extends Error {
	readonly code: string;
	override readonly cause?: unknown;

	constructor(code: string, message: string, cause?: unknown) {
		super(message);
		this.code = code;
		this.cause = cause;
		this.name = "AgentMeshRpcError";
	}
}

export function createAgentMeshRpcClient(config: AgentMeshRpcConfig): AgentMeshRpcClient {
	const url = config.rpcUrl.trim();
	if (!url) {
		throw new AgentMeshRpcError("CONFIG_INVALID", "rpcUrl is required");
	}
	const fetchImpl = config.fetchImpl ?? fetch;
	const headers: Record<string, string> = { accept: "application/json" };
	if (config.token) headers.authorization = `Bearer ${config.token}`;
	const timeoutMs = config.timeoutMs ?? 5_000;

	async function call<T>(method: string, params: Record<string, unknown>): Promise<T> {
		const ctrl = new AbortController();
		const timer = setTimeout(() => ctrl.abort(), timeoutMs);
		try {
			const res = await fetchImpl(`${url.replace(/\/$/, "")}/rpc/${method}`, {
				method: "POST",
				headers: {
					...headers,
					"content-type": "application/json",
				},
				body: JSON.stringify(
					{ jsonrpc: "2.0", id: crypto.randomUUID(), method, params },
					(_key, value) => (typeof value === "bigint" ? value.toString() : value),
				),
				signal: ctrl.signal,
			});
			if (!res.ok) {
				throw new AgentMeshRpcError("RPC_HTTP_ERROR", `${method} failed: HTTP ${res.status}`);
			}
			const body = (await res.json()) as { result?: T; error?: { code: number; message: string } };
			if (body.error) {
				throw new AgentMeshRpcError("RPC_FAULT", `${method}: ${body.error.message}`);
			}
			return body.result as T;
		} catch (e) {
			if (e instanceof AgentMeshRpcError) throw e;
			if (e instanceof Error && e.name === "AbortError") {
				throw new AgentMeshRpcError("RPC_TIMEOUT", `${method} timed out after ${timeoutMs}ms`, e);
			}
			throw new AgentMeshRpcError("RPC_NETWORK", `${method} transport error`, e);
		} finally {
			clearTimeout(timer);
		}
	}

	return {
		async castTask(req: CastTaskRequest): Promise<CastTaskResult> {
			return call<CastTaskResult>("cast.run", { ...req });
		},
		async getReputation(peerId: string): Promise<ReputationSnapshot> {
			return call<ReputationSnapshot>("reputation.get", { peerId });
		},
		async recordCredit(entry): Promise<CreditLedgerEntry> {
			return call<CreditLedgerEntry>("credits.record", { ...entry });
		},
		async broadcastHeartbeat(env: HeartbeatEnvelope): Promise<void> {
			await call<{ ok: true }>("pulse.broadcast", { envelope: env });
		},
	};
}
