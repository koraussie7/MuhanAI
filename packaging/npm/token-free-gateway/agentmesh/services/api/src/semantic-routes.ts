import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { SemanticVotingClient, VOTE_TO_ROUTE } from "@agentmesh/semantic-vote";
import { clientError, formatZodError } from "./error-shapes.js";

const VoteRequestSchema = z.object({
  topicId: z.string().min(1).max(256),
  text: z.string().min(1).max(8192),
});

const TopTopicsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(50).default(10),
});

const ClassifySchema = z.object({
  text: z.string().min(1).max(8192),
});

export async function semanticRoutes(app: FastifyInstance) {
  const client = new SemanticVotingClient();

  app.post("/api/semantic/vote", async (request, reply) => {
    const parse = VoteRequestSchema.safeParse(request.body);
    if (!parse.success) {
      return clientError(reply, 400, formatZodError(parse.error), request.id);
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
      return clientError(reply, 400, formatZodError(parse.error), request.id);
    }

    const topics = client.getTopTopics(parse.data.limit);
    return { topics };
  });

  app.post("/api/semantic/classify", async (request, reply) => {
    const parse = ClassifySchema.safeParse(request.body);
    if (!parse.success) {
      return clientError(reply, 400, formatZodError(parse.error), request.id);
    }

    const { primary, weights } = client.classify(parse.data.text);
    const route = VOTE_TO_ROUTE[primary] ?? "ai";

    return {
      primary,
      weights,
      route,
    };
  });
}
