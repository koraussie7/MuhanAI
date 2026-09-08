import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { hierarchicalAgentCast } from "@agentmesh/agent-cast";
import type { AgentRunResult } from "@agentmesh/shared/types/index.js";
import { clientError, formatZodError } from "./error-shapes.js";

const AskSchema = z.object({
	question: z.string().min(1).max(4096),
	consensus_threshold: z.number().min(0).max(1).optional(),
});

export async function quorumRoutes(app: FastifyInstance) {
	app.post("/api/quorum/ask", async (request, reply) => {
		const parse = AskSchema.safeParse(request.body);
		if (!parse.success) {
			return clientError(reply, 400, formatZodError(parse.error), request.id);
		}

		const { question } = parse.data;

		try {
			const dummyResult: AgentRunResult = {
				agentId: "user-query",
				output: "",
				confidence: 1,
				latencyMs: 0,
			};

			const result = await hierarchicalAgentCast.cast(question, [dummyResult]);

			return {
				question,
				consensusScore: result.consensusScore,
				finalAnswer: result.finalAnswer,
				selectedAgents: result.selectedAgents,
				agentResults: result.agentResults.map((r) => ({
					agentId: r.agentId,
					output: r.output,
					confidence: r.confidence,
					latencyMs: r.latencyMs,
				})),
			};
		} catch (err) {
			request.log.error({ err }, "quorum cast failed");
			return reply.code(502).send({
				error: "Quorum service failed",
				requestId: request.id,
			});
		}
	});
}
