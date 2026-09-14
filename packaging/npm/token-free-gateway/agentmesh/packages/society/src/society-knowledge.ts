/**
 * SocietyKnowledge — bridges agentmesh KnowledgeRecord (core/types/knowledge.ts)
 * with society-protocol's CRDT KnowledgePool.
 *
 * Mapping:
 *   KnowledgeRecord.claim      <-> KnowledgeCard.content
 *   KnowledgeRecord.confidence <-> KnowledgeCard.confidence
 *   KnowledgeRecord.verifiedBy <-> KnowledgeCard.verifiedBy (DIDs)
 *   KnowledgeRecord.evidence   <-> KnowledgeCard.tags
 *
 * The space is created lazily on first use via `ensureSpace()`.
 */

import type { SocietyClient } from "society-protocol";
import type { KnowledgeRecord } from "@agentmesh/core";

export interface SocietyKnowledgeOptions {
  client: SocietyClient;
  /** Knowledge space name (created if it does not exist). */
  spaceName: string;
  /** Fixed space id; if given, `spaceName` is ignored. */
  spaceId?: string;
}

export class SocietyKnowledge {
  private readonly client: SocietyClient;
  private readonly spaceName: string;
  private spaceId: string | null = null;
  private fixedSpaceId: string | undefined;

  constructor(options: SocietyKnowledgeOptions) {
    this.client = options.client;
    this.spaceName = options.spaceName;
    this.fixedSpaceId = options.spaceId;
  }

  /** Idempotently resolve (or create) the knowledge space id. */
  async ensureSpace(): Promise<string> {
    if (this.fixedSpaceId) {
      this.spaceId = this.fixedSpaceId;
      return this.fixedSpaceId;
    }
    if (this.spaceId) return this.spaceId;

    const space = await this.client.createKnowledgeSpace(
      this.spaceName,
      "AgentMesh synchronized knowledge pool",
      "team",
    );
    // createKnowledgeCard returns any; extract id defensively.
    const id = typeof space === "object" && space && "id" in space
      ? String((space as { id: unknown }).id)
      : String(space);
    this.spaceId = id;
    return this.spaceId;
  }

  /** Insert or update a record as a knowledge card. */
  async upsert(record: KnowledgeRecord): Promise<void> {
    const spaceId = await this.ensureSpace();
    await this.client.createKnowledgeCard(
      spaceId,
      "claim",
      record.claim.slice(0, 80),
      record.claim,
      {
        tags: record.evidence.map((e) => e.source),
        confidence: record.confidence,
      },
    );
  }

  /** Find cards matching a tag or free-text substring. */
  async query(filter: { tag?: string; text?: string }): Promise<KnowledgeRecord[]> {
    const spaceId = await this.ensureSpace();
    const cards = this.client.queryKnowledgeCards({
      spaceId,
      ...(filter.tag ? { tags: [filter.tag] } : {}),
    }) as Array<{
      id: string;
      content: string;
      confidence: number;
      tags?: string[];
      verifiedBy?: string[];
      createdAt: number;
    }>;

    let result = cards;
    if (filter.text) {
      const lower = filter.text.toLowerCase();
      result = cards.filter(
        (c) =>
          c.content.toLowerCase().includes(lower) ||
          c.content.toLowerCase().includes(lower),
      );
    }
    return result.map(toKnowledgeRecord);
  }

  /**
   * Return graph nodes (cards) + edges (semantic links) for visualization.
   * Directly consumable by the AgentMesh web Knowledge/Graph pages.
   */
  async graph(spaceId?: string): Promise<{
    nodes: Array<{ id: string; label: string; confidence: number }>;
    edges: Array<{ source: string; target: string; type: string }>;
  }> {
    const id = spaceId ?? (await this.ensureSpace());
    const g = this.client.getKnowledgeGraph(id) as {
      nodes: Array<{ id: string; title?: string; name?: string; confidence?: number }>;
      edges: Array<{ source: string; target: string; type?: string; relation?: string }>;
    };
    return {
      nodes: g.nodes.map((n) => ({
        id: n.id,
        label: n.title ?? n.name ?? n.id,
        confidence: n.confidence ?? 0,
      })),
      edges: g.edges.map((e) => ({
        source: e.source,
        target: e.target,
        type: e.type ?? e.relation ?? "relates-to",
      })),
    };
  }
}

/** Map a society knowledge card back to an agentmesh KnowledgeRecord. */
function toKnowledgeRecord(card: {
  id: string;
  content: string;
  confidence: number;
  tags?: string[];
  verifiedBy?: string[];
  createdAt?: number;
}): KnowledgeRecord {
  return {
    id: card.id,
    claim: card.content,
    evidence: (card.tags ?? []).map((source) => ({ source })),
    confidence: card.confidence,
    provenance: [],
    verifiedBy: card.verifiedBy ?? [],
    createdAt: card.createdAt ?? Date.now(),
  };
}
