import { AgentTracer, type AgentTracerOptions } from "@agentmesh/core";
import { llmRouter } from "@agentmesh/llm-router";
import type { AgentRunResult, CastResult } from "@agentmesh/shared-types";

/**
 * Agent Cast: synthesizes multiple agent outputs into a final answer.
 * Can use voting, weighted confidence, or an LLM judge.
 */
export class AgentCast {
	private readonly tracerOptions?: AgentTracerOptions;

	constructor(tracerOptions?: AgentTracerOptions) {
		this.tracerOptions = tracerOptions;
	}

	async cast(
		question: string,
		agentResults: AgentRunResult[],
		options?: { strategy?: "best" | "ensemble" | "judge"; sessionId?: string },
	): Promise<CastResult> {
		const tracer = new AgentTracer({
			sessionId: options?.sessionId,
			...this.tracerOptions,
		});

		const rootSpanId = tracer.startSpan("agent-cast", {
			questionLength: question.length,
			agentCount: agentResults.length,
			strategy: options?.strategy ?? "judge",
		});

		const strategy = options?.strategy ?? "judge";

		if (agentResults.length === 0) {
			tracer.endSpan(rootSpanId, {
				output: "No agents produced a result.",
				consensusScore: 0,
			});
			await tracer.flush();

			return {
				finalAnswer: "No agents produced a result.",
				agentResults: [],
				consensusScore: 0,
				selectedAgents: [],
			};
		}

		if (agentResults.length === 1 || strategy === "best") {
			const best = [...agentResults].sort((a, b) => b.confidence - a.confidence)[0];
			if (!best) {
				throw new Error("No agent result available for selection");
			}
			tracer.endSpan(rootSpanId, {
				output: best.output,
				consensusScore: best.confidence,
				selectedAgents: [best.agentId],
			});
			await tracer.flush();

			return {
				finalAnswer: best.output,
				agentResults,
				consensusScore: best.confidence,
				selectedAgents: [best.agentId],
			};
		}

		// LLM-as-judge ensemble
		const candidates = agentResults
			.map(
				(r, i) =>
					`### Candidate ${i + 1} (agent: ${r.agentId}, confidence: ${r.confidence})\n${r.output}`,
			)
			.join("\n\n");

		const judgePrompt = `You are a careful judge. Given the user question and multiple agent answers, produce the best final answer.
Merge complementary points, resolve conflicts conservatively, and stay accurate.

Question:
${question}

Candidates:
${candidates}

Write the final answer only.`;

		const judgeSpanId = tracer.startSpan("llm-judge", {
			model: "router",
			promptLength: judgePrompt.length,
		});

		const judged = await llmRouter.generate({
			prompt: judgePrompt,
			temperature: 0.2,
		});

		tracer.endSpan(judgeSpanId, {
			output: judged.text,
			model: "router",
		});

		const avgConfidence = agentResults.reduce((s, r) => s + r.confidence, 0) / agentResults.length;

		tracer.endSpan(rootSpanId, {
			output: judged.text,
			consensusScore: avgConfidence,
			selectedAgents: agentResults.map((r) => r.agentId),
		});

		await tracer.flush();

		return {
			finalAnswer: judged.text,
			agentResults,
			consensusScore: avgConfidence,
			selectedAgents: agentResults.map((r) => r.agentId),
		};
	}
}

export { HierarchicalAgentCast, hierarchicalAgentCast } from "./hierarchy.js";
export const agentCast = new AgentCast();
export * from "./bft/index.js";
