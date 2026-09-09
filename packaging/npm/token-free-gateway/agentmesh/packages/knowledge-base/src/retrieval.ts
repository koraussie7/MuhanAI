import type { KnowledgeNode } from "../../shared/types";
import { decayEngine } from "./decay/engine.js";
import { type EmbeddingService, embeddingService } from "./embeddings";

export interface RetrievalQuery {
	query: string;
	filter?: {
		ownerId?: string;
		categoryId?: string;
		visibility?: string[];
	};
	limit?: number;
}

export interface ScoredKnowledge {
	node: KnowledgeNode;
	score: number;
}

/**
 * In-memory vector store for development.
 * Swap with Pinecone / Weaviate / pgvector in production.
 */
export class VectorStore {
	private items: { node: KnowledgeNode; vector: number[] }[] = [];

	constructor(private embedder: EmbeddingService = embeddingService) {}

	async upsert(node: KnowledgeNode): Promise<void> {
		const { vector } = await this.embedder.embed(`${node.title}\n${node.content}`);
		const idx = this.items.findIndex((i) => i.node.id === node.id);
		if (idx >= 0) {
			this.items[idx] = { node, vector };
		} else {
			this.items.push({ node, vector });
		}
	}

	async search(query: RetrievalQuery): Promise<ScoredKnowledge[]> {
		const { vector: qVec } = await this.embedder.embed(query.query);
		const limit = query.limit ?? 8;

		let candidates = this.items;

		if (query.filter?.ownerId) {
			candidates = candidates.filter((i) => i.node.ownerId === query.filter?.ownerId);
		}
		if (query.filter?.categoryId) {
			candidates = candidates.filter((i) =>
				i.node.categoryId.startsWith(query.filter?.categoryId!),
			);
		}
		if (query.filter?.visibility) {
			candidates = candidates.filter((i) => query.filter?.visibility?.includes(i.node.visibility));
		}

		const scored = candidates.map((item) => ({
			node: item.node,
			score: this.embedder.cosineSimilarity(qVec, item.vector),
		}));

		const results = scored.sort((a, b) => b.score - a.score).slice(0, limit);

		// P1 (stellavault port): record each returned hit as an access so
		// the FSRS decay engine can refresh stability. RRF fusion in P2
		// will consume getRetrievabilityScores() built from these records.
		for (const r of results) decayEngine.recordAccess(r.node.id, "search");

		return results;
	}
}

export const vectorStore = new VectorStore();
