/**
 * pgvector-backed retrieval using Prisma $executeRaw / $queryRaw.
 *
 * Requires:
 *   - PostgreSQL with pgvector
 *   - KnowledgeChunk.embedding column (vector(1536))
 *   - PERSONAL_MCP_STORE=prisma (or any setup with DATABASE_URL)
 */

import type { KnowledgeNode } from "@agentmesh/shared-types";
import { type EmbeddingService, embeddingService } from "./embeddings";
import type { RetrievalQuery, ScoredKnowledge } from "./retrieval";

export class PgVectorStore {
	constructor(private embedder: EmbeddingService = embeddingService) {}

	private async prisma() {
		const { prisma } = await import("@agentmesh/database");
		return prisma;
	}

	/**
	 * Replace chunks for a knowledge node and write embeddings.
	 */
	async upsertNode(
		node: KnowledgeNode,
		chunks: { content: string; index: number }[],
	): Promise<void> {
		const db = await this.prisma();

		// Remove old chunks
		await db.knowledgeChunk.deleteMany({ where: { knowledgeId: node.id } });

		if (chunks.length === 0) return;

		const embeddings = await this.embedder.embedBatch(chunks.map((c) => c.content));

		for (let i = 0; i < chunks.length; i++) {
			const chunk = chunks[i]!;
			const emb = embeddings[i]!;
			const vectorLiteral = this.embedder.toPgVector(emb.vector);

			// Insert row then set embedding via raw SQL (Unsupported vector type)
			const created = await db.knowledgeChunk.create({
				data: {
					knowledgeId: node.id,
					content: chunk.content,
					chunkIndex: chunk.index,
				},
			});

			await db.$executeRawUnsafe(
				`UPDATE "KnowledgeChunk" SET embedding = $1::vector WHERE id = $2`,
				vectorLiteral,
				created.id,
			);
		}
	}

	async search(query: RetrievalQuery): Promise<ScoredKnowledge[]> {
		const db = await this.prisma();
		const limit = query.limit ?? 8;
		const { vector } = await this.embedder.embed(query.query);
		const vectorLiteral = this.embedder.toPgVector(vector);

		// Cosine distance: 1 - (embedding <=> query) in pgvector with cosine ops.
		// Use parameterized placeholders to prevent SQL injection.
		const params: unknown[] = [vectorLiteral, limit];
		let ownerFilter = "";
		if (query.filter?.ownerId) {
			params.push(query.filter.ownerId);
			ownerFilter = `AND kn."ownerId" = $${params.length}`;
		}
		let categoryFilter = "";
		if (query.filter?.categoryId) {
			params.push(`${query.filter.categoryId}%`);
			categoryFilter = `AND kn."categoryId" LIKE $${params.length}`;
		}
		let visibilityFilter = "";
		if (query.filter?.visibility?.length) {
			params.push(query.filter.visibility);
			visibilityFilter = `AND kn.visibility = ANY($${params.length}::text[])`;
		}

		type Row = {
			knowledge_id: string;
			title: string;
			content: string;
			owner_id: string;
			category_id: string | null;
			source_type: string;
			visibility: string;
			confidence: number;
			metadata: unknown;
			created_at: Date;
			updated_at: Date;
			score: number;
		};

		const rows = await db.$queryRawUnsafe<Row[]>(
			`
      SELECT
        kn.id AS knowledge_id,
        kn.title,
        kn.content,
        kn."ownerId" AS owner_id,
        kn."categoryId" AS category_id,
        kn."sourceType" AS source_type,
        kn.visibility,
        kn.confidence,
        kn.metadata,
        kn."createdAt" AS created_at,
        kn."updatedAt" AS updated_at,
        (1 - (kc.embedding <=> $1::vector)) AS score
      FROM "KnowledgeChunk" kc
      INNER JOIN "KnowledgeNode" kn ON kn.id = kc."knowledgeId"
      WHERE kc.embedding IS NOT NULL
        ${ownerFilter}
        ${categoryFilter}
        ${visibilityFilter}
      ORDER BY kc.embedding <=> $1::vector
      LIMIT $2
      `,
			...params,
		);

		// Dedupe by knowledge id (multiple chunks may match)
		const seen = new Map<string, ScoredKnowledge>();
		for (const r of rows) {
			const existing = seen.get(r.knowledge_id);
			if (existing && existing.score >= Number(r.score)) continue;

			const node: KnowledgeNode = {
				id: r.knowledge_id,
				ownerId: r.owner_id,
				categoryId: r.category_id ?? "general",
				title: r.title,
				content: r.content,
				sourceType: r.source_type as KnowledgeNode["sourceType"],
				visibility: r.visibility as KnowledgeNode["visibility"],
				permissions: {
					readableBy: [r.owner_id],
					usableByAgents: true,
					commercialUse: false,
				},
				confidence: r.confidence,
				createdAt: r.created_at,
				updatedAt: r.updated_at,
				metadata: (r.metadata as Record<string, unknown>) ?? undefined,
			};

			seen.set(r.knowledge_id, { node, score: Number(r.score) });
		}

		return Array.from(seen.values())
			.sort((a, b) => b.score - a.score)
			.slice(0, limit);
	}
}

export const pgVectorStore = new PgVectorStore();
