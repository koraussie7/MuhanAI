// Core shared types for MuhanAI

export type Visibility = "private" | "shared" | "public";

export type RiskLevel = "low" | "medium" | "high";

export type SourceType =
  | "document"
  | "conversation"
  | "web"
  | "experience"
  | "expert";

export interface CategoryContext {
  domain: string;
  subdomain?: string;
  jurisdiction?: string[];
  task?: string;
  riskLevel?: RiskLevel;
}

export interface KnowledgePermissions {
  readableBy: string[];
  usableByAgents: boolean;
  commercialUse: boolean;
}

export interface KnowledgeNode {
  id: string;
  ownerId: string;
  categoryId: string;
  title: string;
  content: string;
  sourceType: SourceType;
  visibility: Visibility;
  permissions: KnowledgePermissions;
  confidence: number;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, unknown>;
}

export interface MemoryNode {
  id: string;
  userId: string;
  content: string;
  context?: CategoryContext;
  importance: number;
  createdAt: Date;
  lastAccessedAt?: Date;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  category?: string;
  proficiency: number; // 0-1
}

export interface Tool {
  id: string;
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

export interface AgentReference {
  id: string;
  name: string;
  domain: string;
  version?: string;
}

export interface Expertise {
  id: string;
  domain: string;
  subdomain?: string;
  jurisdiction?: string[];
  level: number; // 0-1
  evidenceCount: number;
}

// Rich user knowledge types (Personal MCP)
export type {
  UserProfile,
  UserStats,
  UserKnowledgeObject,
  CreateUserKnowledgeOptions,
  UpsertKnowledgeInput,
  AddMemoryInput,
  AddExpertiseInput,
} from "./user-knowledge";

// Re-export runtime-friendly aliases for older imports
export type { UserProfile as UserProfileV1 } from "./user-knowledge";

// Shared logger — see ./logger.ts for usage. server.ts integration is Agent A's.
export { getLogger, setLogger, childLogger } from "./logger.js";
export type { Logger, SharedLoggerOptions, LoggerOptions } from "./logger.js";

export interface UserActivity {
  id: string;
  userId: string;
  content: string;
  type: "question" | "answer" | "document" | "feedback" | "conversation";
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface AgentRunResult {
  agentId: string;
  output: string;
  confidence: number;
  sources?: string[];
  latencyMs?: number;
}

export interface CastResult {
  finalAnswer: string;
  agentResults: AgentRunResult[];
  consensusScore: number;
  selectedAgents: string[];
}

export interface SignedRecord {
  id: string;
  content: string;
  type: string;
  ownerId: string;
  peerId: string;
  signature: string;
  publicKey: string;
  timestamp: number;
  vectorClock: Record<string, number>;
  sources?: string[];
  metadata?: Record<string, unknown>;
}

export interface FederationNode {
  peerId: string;
  address: string;
  publicKey?: string;
  lastSeen: number;
  capabilities: string[];
  reputation: number;
  online: boolean;
}

export interface FederationSyncResult {
  pulled: number;
  pushed: number;
  peers: FederationNode[];
}
