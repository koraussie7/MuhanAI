import { KnowledgeNode, Visibility } from "../../shared/types";
import { getKnowledgeStore } from "./store-factory";

export interface KnowledgeQuery {
  query: string;
  userId: string;
  categoryId?: string;
  visibility?: Visibility[];
  limit?: number;
}

export class PersonalKnowledgeService {
  async search(params: KnowledgeQuery): Promise<KnowledgeNode[]> {
    const store = await getKnowledgeStore();
    const obj = await store.get(params.userId);
    if (!obj) return [];

    const q = params.query.toLowerCase();
    let results = obj.knowledge.filter((k) => {
      const matchesText =
        k.title.toLowerCase().includes(q) || k.content.toLowerCase().includes(q);
      const matchesCategory =
        !params.categoryId ||
        k.categoryId === params.categoryId ||
        k.categoryId.startsWith(params.categoryId + ".");
      const matchesVisibility =
        !params.visibility || params.visibility.includes(k.visibility);
      return matchesText && matchesCategory && matchesVisibility;
    });

    results = results.sort((a, b) => {
      const scoreA = a.confidence * 0.7 + a.updatedAt.getTime() / 1e13;
      const scoreB = b.confidence * 0.7 + b.updatedAt.getTime() / 1e13;
      return scoreB - scoreA;
    });

    return results.slice(0, params.limit ?? 10);
  }

  async getById(userId: string, knowledgeId: string): Promise<KnowledgeNode | null> {
    const store = await getKnowledgeStore();
    const list = await store.listKnowledge(userId);
    return list.find((k) => k.id === knowledgeId) ?? null;
  }

  async upsert(userId: string, node: KnowledgeNode): Promise<KnowledgeNode> {
    const store = await getKnowledgeStore();
    await store.getOrCreate(userId);
    return store.upsertKnowledge(userId, {
      id: node.id,
      title: node.title,
      content: node.content,
      categoryId: node.categoryId,
      sourceType: node.sourceType,
      visibility: node.visibility,
      confidence: node.confidence,
      metadata: node.metadata,
    });
  }
}

export const personalKnowledgeService = new PersonalKnowledgeService();
