import type { CategoryContext, MemoryNode } from "@agentmesh/shared-types";
import { getKnowledgeStore } from "./store-factory";
import type { WeKnoraMemoryFact, WeKnoraMemoryFactType } from "./weknora-memory-sync";
import { createWeKnoraMemorySync } from "./weknora-memory-sync";

export type MemoryType = "episodic" | "semantic" | "fact";

export interface PersonalMemory extends MemoryNode {
	memoryType?: MemoryType;
	source?: "user" | "weknora_extracted";
	confirmedAt?: Date;
}

export class PersonalMemoryService {
	async retrieve(
		userId: string,
		query: string,
		context?: CategoryContext,
		limit = 5,
	): Promise<MemoryNode[]> {
		const store = await getKnowledgeStore();
		const obj = await store.get(userId);
		if (!obj) return [];

		const q = query.toLowerCase();
		let memories = obj.memories.filter((m: MemoryNode) => {
			const textMatch = m.content.toLowerCase().includes(q);
			const contextMatch =
				!context ||
				!m.context ||
				m.context.domain === context.domain ||
				(context.subdomain && m.context.subdomain === context.subdomain);
			return textMatch || contextMatch;
		});

		memories = memories.sort((a: MemoryNode, b: MemoryNode) => b.importance - a.importance);
		return memories.slice(0, limit);
	}

	async add(
		userId: string,
		content: string,
		options?: { context?: CategoryContext; importance?: number; memoryType?: MemoryType; source?: "user" | "weknora_extracted" },
	): Promise<MemoryNode> {
		const store = await getKnowledgeStore();
		await store.getOrCreate(userId);
		return store.addMemory(userId, {
			content,
			context: options?.context,
			importance: options?.importance,
		});
	}

	async touch(userId: string, memoryId: string): Promise<void> {
		void userId;
		void memoryId;
	}

	async enrichWithWeKnoraFacts(userId: string): Promise<PersonalMemory[]> {
		const sync = createWeKnoraMemorySync();
		if (!sync) return [];

		try {
			const facts = await sync.listFacts(userId);
			const store = await getKnowledgeStore();
			await store.getOrCreate(userId);

			const memories: PersonalMemory[] = [];
			for (const fact of facts) {
				const memory: PersonalMemory = {
					id: fact.id,
					userId: fact.userId,
					content: fact.content,
					importance: fact.confidence,
					createdAt: new Date(fact.extractedAt),
					lastAccessedAt: fact.confirmedByUser ? new Date(fact.extractedAt) : undefined,
					memoryType: "fact",
					source: "weknora_extracted",
					confirmedAt: fact.confirmedByUser ? new Date(fact.extractedAt) : undefined,
					context: {
						domain: fact.type,
						riskLevel: fact.confidence >= 0.8 ? "low" : "medium",
					},
				};
				memories.push(memory);
			}
			return memories;
		} catch {
			return [];
		}
	}

	async searchWeKnoraMemories(userId: string, query: string, limit = 10): Promise<WeKnoraMemoryFact[]> {
		const sync = createWeKnoraMemorySync();
		if (!sync) return [];
		try {
			const result = await sync.searchMemories(userId, query, limit);
			return result.facts;
		} catch {
			return [];
		}
	}
}

export const personalMemoryService = new PersonalMemoryService();

