import { AgentTracer, type AgentTracerOptions } from "@agentmesh/core";
import type { CastResult, CategoryContext } from "@agentmesh/shared-types";
import { agentCast } from "../../agent-cast/src";
import { agentRegistry } from "../../agent-core/src/registry";
import { listAgentRuns } from "../../agent-core/src/run-store";
import { agentMesh, DomainAgent } from "../../agent-mesh/src";
import { categoryRouter } from "../../category-engine/src/router";
import { hybridSearch } from "../../knowledge-base/src/hybrid-search";
import { personalMcpRegistry } from "../../personal-mcp/src/server";

export interface RouteResult {
	category: CategoryContext & { confidence?: number };
	cast: CastResult;
	knowledgeUsed: number;
	runIds?: string[];
}

export interface RouteQuestionOptions {
	userId: string;
	question: string;
	sessionId?: string;
	tracerOptions?: AgentTracerOptions;
}

/**
 * Main question routing pipeline:
 * Question → Category → Personal MCP → Hybrid Knowledge → Domain Agents → Cast
 * Agent runs are persisted when PERSONAL_MCP_STORE=prisma.
 */
export async function routeQuestion(
	question: string,
	userId: string,
	options?: { sessionId?: string; tracerOptions?: AgentTracerOptions },
): Promise<RouteResult> {
	const tracer = new AgentTracer({
		sessionId: options?.sessionId,
		...options?.tracerOptions,
	});

	const rootSpanId = tracer.startSpan("route-question", {
		questionLength: question.length,
		userId,
	});

	try {
		// Classification
		const classifySpanId = tracer.startSpan("category-classify", {
			questionLength: question.length,
		});
		const classification = await categoryRouter.classify(question);
		tracer.endSpan(classifySpanId, {
			output: { domain: classification.domain, subdomain: classification.subdomain },
		});

		// Personal MCP
		const mcpSpanId = tracer.startSpan("personal-mcp", { userId });
		const personalMcp = await personalMcpRegistry.get(userId);
		tracer.endSpan(mcpSpanId, { output: personalMcp ? "found" : "none" });

		// Agent Registry
		const registrySpanId = tracer.startSpan("agent-registry", {
			domain: classification.domain,
			subdomain: classification.subdomain,
		});
		const agentDefs = agentRegistry.find({
			domain: classification.domain,
			subdomain: classification.subdomain,
			jurisdiction: classification.jurisdiction,
		});
		tracer.endSpan(registrySpanId, {
			output: { agentCount: agentDefs.length },
			attributes: { agentIds: agentDefs.map((d) => d.id).join(",") },
		});

		const agents = agentDefs.map((def) => new DomainAgent(def));

		// Hybrid retrieval (keyword + vector)
		const searchSpanId = tracer.startSpan("hybrid-search", {
			userId,
			categoryId: classification.subdomain
				? `${classification.domain}.${classification.subdomain}`
				: classification.domain,
		});
		const hits = await hybridSearch({
			userId,
			query: question,
			limit: 8,
			categoryId: classification.subdomain
				? `${classification.domain}.${classification.subdomain}`
				: classification.domain,
		});
		tracer.endSpan(searchSpanId, { output: { hits: hits.length } });

		// If category-filtered search is too narrow, broaden
		let knowledge = hits.map((h) => h.node);
		if (knowledge.length < 2) {
			const broadSpanId = tracer.startSpan("hybrid-search-broad", { userId });
			const broad = await hybridSearch({ userId, query: question, limit: 8 });
			const map = new Map(knowledge.map((k) => [k.id, k]));
			for (const h of broad) map.set(h.node.id, h.node);
			knowledge = Array.from(map.values());
			tracer.endSpan(broadSpanId, { output: { totalKnowledge: knowledge.length } });
		}

		// Agent Mesh Execution
		const meshSpanId = tracer.startSpan("agent-mesh-execute", {
			agentCount: agents.length,
			knowledgeCount: knowledge.length,
		});
		const agentResults = await agentMesh.execute({
			question,
			context: classification,
			agents,
			knowledge,
			personalMcp: personalMcp ? { id: personalMcp.userId, userId: personalMcp.userId } : undefined,
			userId,
		});
		tracer.endSpan(meshSpanId, {
			output: { resultCount: agentResults.length },
			attributes: { agentIds: agentResults.map((r) => r.agentId).join(",") },
		});

		// Cast
		const castSpanId = tracer.startSpan("agent-cast", {
			questionLength: question.length,
			agentResultCount: agentResults.length,
		});
		const cast = await agentCast.cast(question, agentResults, {
			strategy: "judge",
			sessionId: tracer.getSessionId(),
		});
		tracer.endSpan(castSpanId, {
			output: { finalAnswerLength: cast.finalAnswer.length, consensusScore: cast.consensusScore },
		});

		// Optional: surface recent run ids for this user
		const recent = await listAgentRuns({ userId, limit: agentResults.length });

		tracer.endSpan(rootSpanId, {
			output: { category: classification.domain, finalAnswerLength: cast.finalAnswer.length },
		});
		await tracer.flush();

		return {
			category: classification,
			cast,
			knowledgeUsed: knowledge.length,
			runIds: recent.map((r) => r.id),
		};
	} catch (error) {
		tracer.endSpan(rootSpanId, {
			error: error instanceof Error ? error.message : String(error),
		});
		await tracer.flush();
		throw error;
	}
}
