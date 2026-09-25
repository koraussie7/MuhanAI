/** Descriptor for an AI provider available in the AI Bridge layer. */
export interface AIProviderDescriptor {
	id: string;
	displayName: string;
	type: "api" | "browser" | "local" | "gateway";
	status: "online" | "offline" | "disconnected" | "ready" | "available" | "requires-extension";
	capabilities: string[];
	connected: boolean;
	free?: boolean;
	local?: boolean;
	mode?: "api" | "browser" | "local" | "import" | "gateway";
	model?: string;
}

/** User-owned connection to an external AI service (metadata only; no secrets). */
export interface UserAIConnection {
	id: string;
	provider: string;
	displayName: string;
	mode: "api" | "browser" | "local" | "import";
	status: "connected" | "disconnected" | "available" | "requires-extension";
	capabilities: string[];
	createdAt: number;
	updatedAt: number;
	/** Optional non-secret metadata (e.g. baseUrl label, model preference). */
	metadata?: Record<string, unknown>;
}

/**
 * Unified answer object from any AI source (API, browser bridge, local, human).
 * External AI answers are never auto-promoted to verified Knowledge.
 */
export interface AIAnswer {
	id: string;
	question: string;
	answer: string;
	provider: string;
	model?: string;
	source: "api" | "browser" | "local" | "human";
	confidence?: number;
	latencyMs?: number;
	importedAt: number;
	verified: boolean;
	metadata?: Record<string, unknown>;
}

/** Pending relay task for AI-to-AI handoff (browser bridge consumes these). */
export interface AIRelayTask {
	id: string;
	question: string;
	from: string;
	to: string;
	status: "pending" | "delivered" | "completed" | "failed";
	sourceAnswerId?: string;
	createdAt: number;
	updatedAt: number;
}
