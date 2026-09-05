import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { SemanticVotingClient, VOTE_TO_ROUTE } from "@agentmesh/semantic-vote";

const VoteRequestSchema = z.object({
  topicId: z.string().min(1),
  text: z.string().min(1),
});

const TopTopicsQuerySchema = z.object({
  limit: z.number().int().positive().max(50).default(10),
});

export async function semanticRoutes(app: FastifyInstance) {
  const client = new SemanticVotingClient();

  app.post("/api/semantic/vote", async (request, reply) => {
    const parse = VoteRequestSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({ error: parse.error.message });
    }

    const { topicId, text } = parse.data;
    const primary = await client.vote(topicId, text);
    const route = VOTE_TO_ROUTE[primary] ?? "ai";

    return {
      topicId,
      primary,
      route,
      timestamp: Date.now(),
    };
  });

  app.get("/api/semantic/topics", async (request, reply) => {
    const parse = TopTopicsQuerySchema.safeParse(request.query);
    if (!parse.success) {
      return reply.code(400).send({ error: parse.error.message });
    }

    const topics = client.getTopTopics(parse.data.limit);
    return { topics };
  });

  app.post("/api/semantic/classify", async (request, reply) => {
    const { text } = request.body as { text?: string };
    if (typeof text !== "string" || !text.trim()) {
      return reply.code(400).send({ error: "text is required" });
    }

    const { primary, weights } = client.classify(text);
    const route = VOTE_TO_ROUTE[primary] ?? "ai";

    return {
      primary,
      weights,
      route,
    };
  });
}
