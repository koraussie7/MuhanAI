/**
 * Cross-package contracts — implemented by 4 parallel agents.
 *
 * Agent 1 (Knowledge):   KnowledgeGraph, Evaluator
 * Agent 2 (Token Bank):  CreditLedger, Reputation
 * Agent 3 (P2P):         PeerNode, MessageRouter
 * Agent 4 (MCP):         ToolRegistry, McpServer
 */

import type {
	AIAnswer,
	AIProviderDescriptor,
	AIRelayTask,
	UserAIConnection,
} from "./ai-provider.js";
import type { ContributionEvent } from "./contribution.js";
import type { KnowledgeRecord } from "./knowledge.js";
import type { AgentResult } from "./result.js";

// =====================================================================
// Agent 1: Knowledge Engine + Evaluator
// =====================================================================

export interface Entity {
	id: string;
	name: string;
	type: string;
	embedding?: number[];
	createdAt: number;
	metadata?: Record<string, unknown>;
}

export interface Relation {
	id: string;
	sourceId: string;
	targetId: string;
	relation: string;
	temporal?: { from: number; to?: number };
	confidence: number;
}

export interface Episode {
	id: string;
	content: string;
	entityIds: string[];
	timestamp: number;
	source?: string;
}

export interface SearchOpts {
	topK?: number;
	threshold?: number;
	filters?: Record<string, unknown>;
	includeEntities?: boolean;
	includeRelations?: boolean;
}

export interface KnowledgeGraph {
	addEntity(e: Omit<Entity, "id" | "createdAt"> & { id?: string }): Promise<Entity>;
	addRelation(r: Omit<Relation, "id"> & { id?: string }): Promise<Relation>;
	addEpisode(ep: Omit<Episode, "id" | "timestamp"> & { id?: string }): Promise<Episode>;
	search(query: string, opts?: SearchOpts): Promise<KnowledgeRecord[]>;
	verify(recordId: string, verifier: string): Promise<void>;
	getEntity(id: string): Promise<Entity | undefined>;
	getRelated(entityId: string, depth?: number): Promise<Array<Entity | Relation>>;
}

export interface Evaluation {
	confidence: number;
	quality: number;
	relevant: boolean;
	reasoning?: string;
}

export interface Evaluator {
	evaluate(result: AgentResult, question: string): Promise<Evaluation>;
	evaluateMany(results: AgentResult[], question: string): Promise<Evaluation[]>;
	consensus(
		results: AgentResult[],
		threshold?: number,
	): Promise<{ agreed: boolean; answer: AgentResult | undefined }>;
}

// =====================================================================
// Agent 2: Token Bank + Reputation
// =====================================================================

export type RewardType = "answer" | "verify" | "teach" | "compute" | "mcp" | "import" | "relay";

export interface Reward {
	id: string;
	actorId: string;
	type: RewardType;
	amount: number;
	reason: string;
	timestamp: number;
	metadata?: Record<string, unknown>;
}

export interface ReputationScore {
	actorId: string;
	// Core mesh reputation
	overall: number;
	quality: number;
	reliability: number;
	contributions: number;
	updatedAt: number;
	// Human-coordinator extended fields (optional for backward compat)
	score: number;
	teach: number;
	verify: number;
	answer: number;
	local_knowledge: number;
	expert: number;
	totalReviews: number;
	averageRating: number;
	lastUpdated: number;
}

export interface CreditLedger {
	award(event: ContributionEvent): Promise<Reward>;
	balance(actorId: string): Promise<number>;
	history(actorId: string, limit?: number): Promise<Reward[]>;
	reputation(actorId: string): Promise<ReputationScore>;
	leaderboard(limit?: number): Promise<ReputationScore[]>;
}

// ── Human-in-the-Loop (consumed by @agentmesh/human) ─────────────────

export type HumanCapability = "answer" | "verify" | "teach" | "local_knowledge" | "expert";

export interface HumanSubmission {
	id: string;
	actorId: string;
	content: string;
	capability: HumanCapability;
	submittedAt: number;
}

export interface ReviewRequest {
	id: string;
	submissionId: string;
	actorId: string;
	capability: HumanCapability | (string & {});
	content: string;
	requestedAt: number;
	expiresAt: number;
}

export interface ReviewResult {
	requestId: string;
	reviewerId: string;
	rating: number;
	comment: string;
	approved: boolean;
	reviewedAt: number;
}

export interface HumanReviewer {
	register(
		actorId: string,
		capabilities: HumanCapability[],
		specialties?: string[],
		language?: string[],
	): Promise<void>;
	updateAvailability(actorId: string, available: boolean): Promise<void>;
	submitReview(
		actorId: string,
		requestId: string,
		result: Pick<ReviewResult, "rating" | "comment" | "approved">,
	): Promise<void>;
	getReputation(actorId: string): Promise<ReputationScore>;
	submitDispute(actorId: string, reviewId: string, reason: string): Promise<string>;
}

export interface Dispute {
	id: string;
	reviewId: string;
	actorId: string;
	reason: string;
	status: "open" | "resolved" | "rejected";
	createdAt: number;
}

// ── Token Bank (consumed by @agentmesh/token-bank) ───────────────────

export interface TokenBalance {
	actorId: string;
	available: number;
	staked: number;
	pendingRewards: number;
	lifetimeEarned: number;
	lifetimeSpent: number;
}

export type RewardPolicy = Record<string, number>;

export type RoutingPolicy = "free-first" | "local-first" | "balanced" | "fastest" | "best-quality";

export interface TokenUsage {
	provider: string;
	model: string;
	promptTokens: number;
	completionTokens: number;
	cost: number;
	timestamp: number;
}

export interface RouteResult {
	provider: string;
	model: string;
	reason: string;
}

export interface TokenRouter {
	route(question: string, policy: RoutingPolicy): Promise<RouteResult>;
	track(usage: TokenUsage): Promise<void>;
	usage(actorId?: string): Promise<TokenUsage[]>;
}

// =====================================================================
// Agent 3: P2P Network
// =====================================================================

export interface PeerInfo {
	id: string;
	address: string;
	capabilities: string[];
	lastSeen: number;
	latency?: number;
}

export interface P2PMessage {
	id: string;
	source: string;
	target: string;
	payload: Uint8Array;
	ttl: number;
	timestamp: number;
}

export interface NetworkTopology {
	nodes: PeerInfo[];
	edges: Array<{ from: string; to: string; latency: number }>;
}

export interface PeerNode {
	readonly id: string;
	start(): Promise<void>;
	stop(): Promise<void>;
	send(target: string, payload: Uint8Array): Promise<void>;
	broadcast(payload: Uint8Array): Promise<void>;
	onMessage(handler: (from: string, payload: Uint8Array) => void): void;
	getPeers(): Promise<PeerInfo[]>;
	getTopology(): Promise<NetworkTopology>;
}

export interface MessageRouter {
	route(msg: P2PMessage): Promise<void>;
	registerHandler(msgType: string, handler: (msg: P2PMessage) => Promise<void>): void;
}

// =====================================================================
// Agent 4: MCP + Extension
// =====================================================================

export interface McpTool {
	name: string;
	description?: string;
	inputSchema: Record<string, unknown>;
	provider?: string;
}

export interface ToolRegistry {
	register(tool: McpTool): Promise<void>;
	unregister(toolName: string): Promise<void>;
	execute(toolName: string, input: Record<string, unknown>): Promise<unknown>;
	list(): Promise<McpTool[]>;
	discover(): Promise<McpTool[]>;
}

export interface McpServerConfig {
	name: string;
	version: string;
	transport?: "stdio" | "sse";
	tools: McpTool[];
}

export interface ToolDiscovery {
	scan(): Promise<McpTool[]>;
	scanProvider(providerId: string): Promise<McpTool[]>;
	scanMcpServer(serverUrl: string): Promise<McpTool[]>;
}

// =====================================================================
// Shared: AI Bridge (used by Agent 1 + Agent 4)
// =====================================================================

export interface AIBridge {
	providers(): Promise<AIProviderDescriptor[]>;
	connections(): Promise<UserAIConnection[]>;
	connect(providerId: string): Promise<UserAIConnection>;
	disconnect(connectionId: string): Promise<void>;
	ask(providerId: string, question: string): Promise<AIAnswer>;
	importAnswer(input: Omit<AIAnswer, "id" | "importedAt" | "verified">): Promise<AIAnswer>;
	listAnswers(): Promise<AIAnswer[]>;
	toKnowledge(answerId: string): Promise<KnowledgeRecord>;
	createRelay(
		input: Omit<AIRelayTask, "id" | "createdAt" | "updatedAt" | "status">,
	): Promise<AIRelayTask>;
	listRelays(): Promise<AIRelayTask[]>;
}
