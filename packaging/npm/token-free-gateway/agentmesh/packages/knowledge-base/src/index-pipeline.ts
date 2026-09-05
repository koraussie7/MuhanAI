/**
 * Index a KnowledgeNode into chunk + embedding storage.
 * Uses pgvector when PERSONAL_MCP_STORE=prisma / DATABASE_URL is set,
 * otherwise falls back to in-memory VectorStore.
 */

import type { KnowledgeNode } from "../../shared/types";
import { chunkText } from "./chunking";
import { vectorStore } from "./retrieval";

export async function indexKnowledgeNode(node: KnowledgeNode): Promise<void> {
  const chunks = chunkText(`${node.title}\n\n${node.content}`, {
    chunkSize: 800,
    overlap: 120,
  });

  const mode = (process.env.PERSONAL_MCP_STORE ?? "memory").toLowerCase();
  const hasDb = Boolean(process.env.DATABASE_URL);

  if (mode === "prisma" && hasDb) {
    try {
      const { pgVectorStore } = await import("./pgvector-store");
      await pgVectorStore.upsertNode(
        node,
        chunks.map((c) => ({ content: c.content, index: c.index }))
      );
      return;
    } catch (err) {
      console.warn("[indexKnowledgeNode] pgvector failed, memory fallback:", err);
    }
  }

  // In-memory vector index
  await vectorStore.upsert(node);
}

export async function indexKnowledgeNodes(nodes: KnowledgeNode[]): Promise<void> {
  for (const node of nodes) {
    await indexKnowledgeNode(node);
  }
}
