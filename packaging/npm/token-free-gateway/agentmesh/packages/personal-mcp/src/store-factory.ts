/**
 * Choose in-memory or Prisma store via env.
 *
 *   PERSONAL_MCP_STORE=memory   (default)
 *   PERSONAL_MCP_STORE=prisma
 */

import type { KnowledgeStore } from "./store-types";
import { userKnowledgeStore as memoryStore } from "./user-object";

let cached: KnowledgeStore | null = null;
let cachedMode: string | null = null;

export async function getKnowledgeStore(): Promise<KnowledgeStore> {
	const mode = (process.env.PERSONAL_MCP_STORE ?? "memory").toLowerCase();

	if (cached && cachedMode === mode) return cached;

	if (mode === "prisma") {
		const { prisma } = await import("@agentmesh/database");
		const { PrismaUserKnowledgeStore } = await import("./prisma-store");
		cached = new PrismaUserKnowledgeStore(prisma);
		cachedMode = mode;
		return cached;
	}

	cached = memoryStore;
	cachedMode = mode;
	return cached;
}

export function getKnowledgeStoreMode(): string {
	return (process.env.PERSONAL_MCP_STORE ?? "memory").toLowerCase();
}

export function resetKnowledgeStoreCache(): void {
	cached = null;
	cachedMode = null;
}

export type { KnowledgeStore };
