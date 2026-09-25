/** Input for a multi-agent cast (AI Council session). */
export interface CastRequest {
	question: string;
	/** Optional explicit agent ids; when omitted the server picks defaults. */
	agentIds?: string[];
	/** Per-agent timeout (default 15_000). */
	timeoutMs?: number;
	/** Cap how many agents participate. */
	maxAgents?: number;
	/** Opaque request id (generated if missing). */
	id?: string;
	metadata?: Record<string, unknown>;
}

export type CastAgentStatus = "success" | "timeout" | "error";

/** Normalized per-agent outcome inside a cast. */
export interface CastAgentResult {
	agentId: string;
	provider?: string;
	model?: string;
	answer: string;
	confidence: number;
	latencyMs: number;
	status: CastAgentStatus;
	error?: string;
}

/**
 * Full cast session result.
 * AI consensus is a signal only — never auto-verified truth.
 */
export interface CastSessionResult {
	id: string;
	question: string;
	results: CastAgentResult[];
	consensusScore: number;
	hasConflict: boolean;
	conflictSummary?: string;
	synthesizedAnswer?: string;
	/** Always false until human / verification flow promotes knowledge. */
	verified: boolean;
	createdAt: number;
	completedAt: number;
}

export type VerificationStatus = "verified" | "rejected" | "needs_human" | "pending";

export interface VerificationResult {
	castId: string;
	status: VerificationStatus;
	verifierId?: string;
	reason?: string;
	verifiedAt?: number;
}
