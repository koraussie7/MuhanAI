// Rich UserKnowledgeObject types for Personal MCP

import type {
	AgentReference,
	CategoryContext,
	Expertise,
	KnowledgeNode,
	KnowledgePermissions,
	MemoryNode,
	Skill,
	Tool,
} from "./index";

export type {
	AgentReference,
	Expertise,
	KnowledgeNode,
	KnowledgePermissions,
	MemoryNode,
	Skill,
	Tool,
};

export interface UserProfile {
	name?: string;
	description?: string;
	languages: string[];
	timezone?: string;
	preferredJurisdiction?: string[];
	avatarUrl?: string;
}

export interface UserStats {
	contributions: number;
	citations: number;
	helpfulness: number;
	knowledgeCount: number;
	memoryCount: number;
	expertiseDomains: number;
	lastActiveAt?: Date;
}

/**
 * Core identity object for every MuhanAI user.
 *
 * User
 *  └─ UserKnowledgeObject
 *       └─ Personal MCP
 *            └─ Agent Mesh
 */
export interface UserKnowledgeObject {
	id: string;
	userId: string;
	version: number;

	profile: UserProfile;

	/** Structured knowledge nodes owned by the user */
	knowledge: KnowledgeNode[];

	/** Episodic / working memories */
	memories: MemoryNode[];

	/** Declared or inferred skills */
	skills: Skill[];

	/** Tools the user (or their agents) can invoke */
	tools: Tool[];

	/** Agents linked to this user */
	agents: AgentReference[];

	/** Aggregated expertise graph summary */
	expertise: Expertise[];

	/** Default permissions applied to new knowledge */
	permissions: KnowledgePermissions;

	stats: UserStats;

	createdAt: Date;
	updatedAt: Date;
	metadata?: Record<string, unknown>;
}

export interface CreateUserKnowledgeOptions {
	profile?: Partial<UserProfile>;
	permissions?: Partial<KnowledgePermissions>;
	metadata?: Record<string, unknown>;
}

export interface UpsertKnowledgeInput {
	title: string;
	content: string;
	categoryId: string;
	sourceType?: KnowledgeNode["sourceType"];
	visibility?: KnowledgeNode["visibility"];
	confidence?: number;
	metadata?: Record<string, unknown>;
	id?: string;
}

export interface AddMemoryInput {
	content: string;
	context?: CategoryContext;
	importance?: number;
}

export interface AddExpertiseInput {
	domain: string;
	subdomain?: string;
	jurisdiction?: string[];
	level?: number;
	evidenceCount?: number;
}
