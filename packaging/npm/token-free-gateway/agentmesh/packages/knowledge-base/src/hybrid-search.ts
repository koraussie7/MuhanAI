/**
 * Hybrid search: keyword (personal knowledge) + vector (pgvector or memory).
 */

import type { KnowledgeNode } from "../../shared/types";
import { personalKnowledgeService } from "../../personal-mcp/src/knowledge";
import { vectorStore, type ScoredKnowledge } from "./retrieval";

export interface HybridSearchParams {
  userId: string;
  query: string;
  limit?: number;
  categoryId?: string;
}

export interface HybridSearchHit {
  node: KnowledgeNode;
  score: number;
  source: "keyword" | "vector" | "both";
}

export async function hybridSearch(
  params: HybridSearchParams
): Promise<HybridSearchHit[]> {
  const limit = params.limit ?? 8;

  const keywordHits = await personalKnowledgeService.search({
    userId: params.userId,
    query: params.query,
    categoryId: params.categoryId,
    limit,
  });

  let vectorHits: ScoredKnowledge[] = [];
  const mode = (process.env.PERSONAL_MCP_STORE ?? "memory").toLowerCase();

  if (mode === "prisma" && process.env.DATABASE_URL) {
    try {
      const { pgVectorStore } = await import("./pgvector-store");
      vectorHits = await pgVectorStore.search({
        query: params.query,
        filter: {
          ownerId: params.userId,
          categoryId: params.categoryId,
        },
        limit,
      });
    } catch {
      vectorHits = await vectorStore.search({
        query: params.query,
        filter: { ownerId: params.userId, categoryId: params.categoryId },
        limit,
      });
    }
  } else {
    vectorHits = await vectorStore.search({
      query: params.query,
      filter: { ownerId: params.userId, categoryId: params.categoryId },
      limit,
    });
  }

  const merged = new Map<string, HybridSearchHit>();

  for (const n of keywordHits) {
    merged.set(n.id, {
      node: n,
      score: 0.55 * n.confidence + 0.2,
      source: "keyword",
    });
  }

  for (const v of vectorHits) {
    const existing = merged.get(v.node.id);
    if (existing) {
      existing.score = existing.score * 0.5 + v.score * 0.5 + 0.15;
      existing.source = "both";
    } else {
      merged.set(v.node.id, {
        node: v.node,
        score: v.score,
        source: "vector",
      });
    }
  }

  return Array.from(merged.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
