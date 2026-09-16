/**
 * Resonance integration types.
 *
 * Mirrors the public surface of Helldez/Resonance — the on-device P2P agent
 * runtime that ships an Android APK. This integration brings only the
 * algorithmic patterns into muhanai:
 *
 *   - 768-dim cosine similarity ranking (Resonance uses EmbeddingGemma-300M)
 *   - Autonomy dial (off / suggest / autopilot)
 *   - Deterministic governor (daily caps, dedup window, kill-switches)
 *
 * Wire-level integration (Holepunch Hyperswarm <-> libp2p) is out of scope
 * for Option A. Embeddings are NOT computed server-side in this integration:
 * the client supplies either a pre-computed 768-dim vector or a text field
 * which we deterministically project into 768 dims via FNV-1a hashing for
 * development/testing. Production callers should ship real embeddings.
 */

export const RESONANCE_EMBEDDING_DIM = 768;

export type AutonomyLevel = "off" | "suggest" | "autopilot";

export type AutonomyAction =
	| "read"
	| "decide"
	| "execute"
	| "broadcast"
	| "settle";

export interface AutonomyDial {
	level: AutonomyLevel;
	/** Per-action overrides. If absent, level determines behaviour. */
	perAction?: Partial<Record<AutonomyAction, AutonomyLevel>>;
	/** ISO-8601 timestamp of the last level change. */
	updatedAt: string;
	/** Identifier of whoever set the level ("user", "admin:<id>", "system"). */
	updatedBy: string;
}

export interface GovernorConfig {
	/** Maximum allowed actions per UTC day. 0 disables the cap. */
	dailyActionCap: number;
	/** Action dedup window in milliseconds. Repeats within window are dropped. */
	dedupWindowMs: number;
	/** Global kill-switch. When true, every action is denied. */
	killSwitch: boolean;
	/** Per-action kill-switches (when true, that action is denied). */
	killSwitchPerAction: Partial<Record<AutonomyAction, boolean>>;
	/** Optional ISO date (YYYY-MM-DD UTC) — actions logged for this date only. */
	currentDay: string;
}

export interface GovernorState {
	config: GovernorConfig;
	/** Actions recorded within the current dedup window (capped at 1024). */
	recentActions: GovernorAction[];
	/** Action count for the current UTC day. */
	dailyCount: number;
}

export interface GovernorAction {
	id: string;
	action: AutonomyAction;
	subject: string;
	timestamp: number;
	allowed: boolean;
	reason?: string;
}

export interface RankedItem {
	id: string;
	text?: string;
	embedding?: number[];
	score?: number;
	metadata?: Record<string, unknown>;
}

export interface SearchRequest {
	query: string;
	queryEmbedding?: number[];
	corpus: RankedItem[];
	topK?: number;
	/** Minimum cosine similarity to include (default 0). */
	minScore?: number;
}

export interface RankedResult extends RankedItem {
	score: number;
	rank: number;
}

export interface SearchResponse {
	query: string;
	results: RankedResult[];
	count: number;
	embeddingSource: "client" | "deterministic";
}

export interface GovernorCheckRequest {
	action: AutonomyAction;
	subject: string;
}

export interface GovernorCheckResponse {
	allowed: boolean;
	reason: string;
	dial: AutonomyDial;
	usage: {
		dailyCount: number;
		dailyCap: number;
		recentActions: number;
		dedupWindowMs: number;
	};
}

export interface ResonanceStatus {
	enabled: boolean;
	autonomy: AutonomyDial;
	governor: GovernorState;
	embeddingDim: number;
	version: string;
}
