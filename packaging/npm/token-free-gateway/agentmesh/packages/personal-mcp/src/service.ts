/**
 * High-level Personal MCP service facade.
 * Fully store-agnostic: uses getKnowledgeStore() (memory | prisma).
 */

import type {
	AddExpertiseInput,
	AddMemoryInput,
	CreateUserKnowledgeOptions,
	Expertise,
	KnowledgeNode,
	MemoryNode,
	UpsertKnowledgeInput,
	UserKnowledgeObject,
} from "../../shared/types/user-knowledge";
import { createPersonalMCP, type PersonalMCP, personalMcpRegistry } from "./server";
import { getKnowledgeStore, getKnowledgeStoreMode } from "./store-factory";
import type { KnowledgeStore } from "./store-types";
import { createUserKnowledgeObject } from "./user-object";

export interface CreatePersonalMcpResult {
	userId: string;
	uko: UserKnowledgeObject;
	mcp: PersonalMCP;
	created: boolean;
	storeMode: string;
}

/**
 * Create (or load) UserKnowledgeObject + Personal MCP for a user.
 */
export async function createPersonalMcpForUser(
	userId: string,
	options?: CreateUserKnowledgeOptions,
): Promise<CreatePersonalMcpResult> {
	const store = await getKnowledgeStore();
	const existed = await store.exists(userId);
	const uko = await store.getOrCreate(userId, options);
	const mcp = await personalMcpRegistry.get(userId, {
		name: options?.profile?.name,
		languages: options?.profile?.languages,
	});

	return {
		userId,
		uko,
		mcp,
		created: !existed,
		storeMode: getKnowledgeStoreMode(),
	};
}

export async function getPersonalMcp(userId: string): Promise<PersonalMCP> {
	return personalMcpRegistry.get(userId);
}

export async function getUserKnowledgeObject(userId: string): Promise<UserKnowledgeObject | null> {
	const store = await getKnowledgeStore();
	return store.get(userId);
}

export async function addUserKnowledge(
	userId: string,
	input: UpsertKnowledgeInput,
): Promise<KnowledgeNode> {
	await createPersonalMcpForUser(userId);
	const store = await getKnowledgeStore();
	const node = await store.upsertKnowledge(userId, input);

	// Best-effort: index into vector store (pgvector or memory)
	try {
		const { indexKnowledgeNode } = await import("../../knowledge-base/src/index-pipeline");
		await indexKnowledgeNode(node);
	} catch {
		// indexing is optional during early bootstrap
	}

	return node;
}

export async function addUserMemory(userId: string, input: AddMemoryInput): Promise<MemoryNode> {
	await createPersonalMcpForUser(userId);
	const store = await getKnowledgeStore();
	return store.addMemory(userId, input);
}

export async function boostUserExpertise(
	userId: string,
	input: AddExpertiseInput,
): Promise<Expertise> {
	await createPersonalMcpForUser(userId);
	const store = await getKnowledgeStore();
	return store.addOrBoostExpertise(userId, input);
}

export async function buildPersonalContext(userId: string, query?: string): Promise<string> {
	const mcp = await personalMcpRegistry.get(userId);
	return mcp.prompts.personalContext.render(query ? { query } : undefined);
}

export async function searchUserKnowledge(
	userId: string,
	query: string,
	options?: { limit?: number; categoryId?: string },
) {
	const { hybridSearch } = await import("../../knowledge-base/src/hybrid-search");
	return hybridSearch({
		userId,
		query,
		limit: options?.limit ?? 8,
		categoryId: options?.categoryId,
	});
}

export async function getStore(): Promise<KnowledgeStore> {
	return getKnowledgeStore();
}

export {
	createPersonalMCP,
	createUserKnowledgeObject,
	getKnowledgeStore,
	getKnowledgeStoreMode,
	personalMcpRegistry,
};
