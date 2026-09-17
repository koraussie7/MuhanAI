/**
 * Internal shared types for the elizaOS adapter.
 *
 * Kept dependency-free so this package can be vendored into an elizaOS
 * project without pulling in MuhanAI packages. Everything here is also
 * re-exported from `index.ts` for downstream consumers.
 */

export interface AgentMeshRpcConfig {
	/** HTTP(S) endpoint of the MuhanAI runtime / gossip bridge. Required. */
	rpcUrl: string;
	/** Local peerId (64-char hex). Optional — will be derived when omitted. */
	peerId?: string;
	/** Bearer token presented to the MuhanAI RPC. */
	token?: string;
	/** Fetch implementation override (mainly for tests). */
	fetchImpl?: typeof fetch;
	/** Request timeout in ms (default 5_000). */
	timeoutMs?: number;
}

export interface CastTaskRequest {
	prompt: string;
	agents?: string[];
	consensus?: "majority" | "any" | "all";
	maxTokens?: number;
}

export interface CastTaskResult {
	requestId: string;
	answer: { text: string; agentId: string } | undefined;
	results: Array<{ agentId: string; text: string }>;
	consensusAt: number;
}

export interface ReputationSnapshot {
	peerId: string;
	score: number;
	signals: number;
	variance: number;
	asOf: number;
}

export interface CreditLedgerEntry {
	id: string;
	amount: bigint;
	reason: string;
	idempotencyKey: string;
	metadata: Record<string, unknown> | null;
	createdAt: Date;
}

export interface HeartbeatEnvelope {
	v: 1;
	peerId: string;
	nonce: number;
	ts: number;
	characterName?: string;
	tags?: string[];
}

export interface AgentMeshRpcClient {
	castTask(req: CastTaskRequest): Promise<CastTaskResult>;
	getReputation(peerId: string): Promise<ReputationSnapshot>;
	recordCredit(entry: Omit<CreditLedgerEntry, "id" | "createdAt">): Promise<CreditLedgerEntry>;
	broadcastHeartbeat(env: HeartbeatEnvelope): Promise<void>;
}
