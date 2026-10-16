import { agentCast } from "../../agent-cast/src";
import { agentRegistry } from "../../agent-core/src/registry";
import { listAgentRuns } from "../../agent-core/src/run-store";
import { agentMesh, DomainAgent, nexusAgentRegistry } from "../../agent-mesh/src";
import { nexusOrchestrator } from "../../agent-cast/src";
import { categoryRouter } from "../../category-engine/src/router";
import { hybridSearch } from "../../knowledge-base/src/hybrid-search";
import { personalMcpRegistry } from "../../personal-mcp/src/server";
import type { CastResult, CategoryContext } from "@agentmesh/shared-types";

export interface RouteResult {
	category: CategoryContext & { confidence?: number };
	cast: CastResult;
	knowledgeUsed: number;
	runIds?: string[];
	nexusOrchestration?: {
		orchestrationId: string;
		bucklingUsed: boolean;
		hedgeStreaming: boolean;
		ttftMs: number;
		tokenSavings: number;
	};
}

/**
 * Nexus Agent Buckling 라우팅 전략
 * 질문의 복잡도에 따라 Nexus 멀티 에이전트 바클링을 적용합니다.
 */
function shouldUseNexusBuckling(
	question: string,
	category: CategoryContext & { confidence?: number },
): boolean {
	// 복잡한 질문 (긴 질문, 다중 도메인, 높은 리스크)는 Nexus 바클링 사용
	const isComplex =
		question.length > 200 ||
		category.riskLevel === "high" ||
		category.confidence != null && category.confidence < 0.5;
	const hasNexusAgents = nexusAgentRegistry.listHealthy().length > 0;
	return isComplex && hasNexusAgents;
}

/**
 * Main question routing pipeline:
 * Question → Category → Personal MCP → Hybrid Knowledge → Domain Agents → Cast
 * Agent runs are persisted when PERSONAL_MCP_STORE=prisma.
 */
export async function routeQuestion(question: string, userId: string): Promise<RouteResult> {
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
		personalMcp: personalMcp ? { id: personalMcp.userId, userId: personalMcp.userId } : undefined,
		userId,
	});

	const cast = await agentCast.cast(question, agentResults, {
		strategy: "judge",
	});

	// Optional: surface recent run ids for this user
	const recent = await listAgentRuns({ userId, limit: agentResults.length });

	// Nexus Agent Buckling 오케스트레이션 (복잡한 질문일 때)
	let nexusOrchestration;
	if (shouldUseNexusBuckling(question, classification)) {
		const nexusAgentIds = nexusAgentRegistry
			.listHealthy()
			.map((a) => a.id);
		if (nexusAgentIds.length > 0) {
			const orchResult = await nexusOrchestrator.orchestrate(
				question,
				nexusAgentIds,
				{ strategy: "buckling", ttftThresholdMs: 800 },
			);
			nexusOrchestration = {
				orchestrationId: orchResult.orchestrationId,
				bucklingUsed: orchResult.bucklingUsed,
				hedgeStreaming: orchResult.hedgeStreaming,
				ttftMs: orchResult.ttftMs,
				tokenSavings: orchResult.tokenSavings,
			};
		}
	}

	return {
		category: classification,
		cast,
		knowledgeUsed: knowledge.length,
		runIds: recent.map((r) => r.id),
		nexusOrchestration,
	};
}
