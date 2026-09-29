import type { AgentExecutor } from "@agentmesh/agent";
import type { AgentRequest, AgentResult } from "@agentmesh/core";
import { AgentTracer, type AgentTracerOptions } from "@agentmesh/core";
import { consensus } from "./consensus.js";
import { fanOut } from "./fanout.js";

export interface CastRequest extends AgentRequest {
	agents?: string[];
}
export interface CastResult {
	request: AgentRequest;
	results: AgentResult[];
	answer: AgentResult | undefined;
}

export class AgentCast {
	constructor(
		private readonly executor: AgentExecutor,
		private readonly tracerOptions?: AgentTracerOptions,
	) {}

	async run(
		request: CastRequest,
		options?: { sessionId?: string; tracerOptions?: AgentTracerOptions },
	): Promise<CastResult> {
		const tracer = new AgentTracer({
			sessionId: options?.sessionId,
			...this.tracerOptions,
			...options?.tracerOptions,
		});

		const rootSpanId = tracer.startSpan("cast-run", {
			agentCount: request.agents?.length ?? 0,
			questionLength: request.question?.length ?? 0,
		});

		try {
			const fanoutSpanId = tracer.startSpan("cast-fanout", {
				agentCount: request.agents?.length ?? 0,
			});
			const results = await fanOut(this.executor, request.agents ?? [], request);
			tracer.endSpan(fanoutSpanId, {
				output: { resultCount: results.length },
				attributes: { agentIds: results.map((r) => r.agentId).join(",") },
			});

			const consensusSpanId = tracer.startSpan("cast-consensus", {
				resultCount: results.length,
			});
			const answer = consensus(results);
			tracer.endSpan(consensusSpanId, {
				output: { selectedAgent: answer?.agentId, confidence: answer?.confidence },
			});

			tracer.endSpan(rootSpanId, {
				output: { finalAgent: answer?.agentId, resultCount: results.length },
			});
			await tracer.flush();

			return { request, results, answer };
		} catch (error) {
			tracer.endSpan(rootSpanId, {
				error: error instanceof Error ? error.message : String(error),
			});
			await tracer.flush();
			throw error;
		}
	}
}
