import { CategoryContext, CastResult } from "../../shared/types";
import { categoryRouter } from "../../category-engine/src/router";
import { personalMcpRegistry } from "../../personal-mcp/src/server";
import { agentRegistry } from "../../agent-core/src/registry";
import { DomainAgent, agentMesh } from "../../agent-mesh/src";
import { agentCast } from "../../agent-cast/src";
import { hybridSearch } from "../../knowledge-base/src/hybrid-search";
import { listAgentRuns } from "../../agent-core/src/run-store";

export interface RouteResult {
  category: CategoryContext & { confidence?: number };
  cast: CastResult;
  knowledgeUsed: number;
  runIds?: string[];
}

/**
 * Main question routing pipeline:
 * Question → Category → Personal MCP → Hybrid Knowledge → Domain Agents → Cast
 * Agent runs are persisted when PERSONAL_MCP_STORE=prisma.
 */
export async function routeQuestion(
  question: string,
  userId: string
): Promise<RouteResult> {
  const classification = await categoryRouter.classify(question);

  const personalMcp = await personalMcpRegistry.get(userId);

  const agentDefs = agentRegistry.find({
    domain: classification.domain,
    subdomain: classification.subdomain,
    jurisdiction: classification.jurisdiction,
  });

  const agents = agentDefs.map((def) => new DomainAgent(def));

  // Hybrid retrieval (keyword + vector)
  const hits = await hybridSearch({
    userId,
    query: question,
    limit: 8,
    categoryId: classification.subdomain
      ? `${classification.domain}.${classification.subdomain}`
      : classification.domain,
  });

  // If category-filtered search is too narrow, broaden
  let knowledge = hits.map((h) => h.node);
  if (knowledge.length < 2) {
    const broad = await hybridSearch({ userId, query: question, limit: 8 });
    const map = new Map(knowledge.map((k) => [k.id, k]));
    for (const h of broad) map.set(h.node.id, h.node);
    knowledge = Array.from(map.values());
  }

  const agentResults = await agentMesh.execute({
    question,
    context: classification,
    agents,
    knowledge,
    personalMcp,
    userId,
  });

  const cast = await agentCast.cast(question, agentResults, {
    strategy: "judge",
  });

  // Optional: surface recent run ids for this user
  const recent = await listAgentRuns({ userId, limit: agentResults.length });

  return {
    category: classification,
    cast,
    knowledgeUsed: knowledge.length,
    runIds: recent.map((r) => r.id),
  };
}
