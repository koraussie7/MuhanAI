import type { CategoryContext, MemoryNode } from "../../shared/types";
import { getKnowledgeStore } from "./store-factory";

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
		let memories = obj.memories.filter((m) => {
			const textMatch = m.content.toLowerCase().includes(q);
			const contextMatch =
				!context ||
				!m.context ||
				m.context.domain === context.domain ||
				(context.subdomain && m.context.subdomain === context.subdomain);
			return textMatch || contextMatch;
		});

		memories = memories.sort((a, b) => b.importance - a.importance);
		return memories.slice(0, limit);
	}

	async add(
		userId: string,
		content: string,
		options?: { context?: CategoryContext; importance?: number },
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
}

export const personalMemoryService = new PersonalMemoryService();
