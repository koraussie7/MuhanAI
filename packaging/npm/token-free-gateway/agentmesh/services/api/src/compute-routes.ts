import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { computeTribute } from "@agentmesh/compute";

const SubmitSchema = z.object({
  taskId: z.string().min(1),
  projectId: z.string().optional(),
  networkShare: z.number().min(0).max(1).default(0.5),
  personalShare: z.number().min(0).max(1).default(0.5),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
});

export async function computeRoutes(app: FastifyInstance) {
  app.post("/api/compute/tribute", async (request, reply) => {
    const parse = SubmitSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({ error: parse.error.message });
    }

    const ticket = {
      ...parse.data,
      status: "queued" as const,
    };
    computeTribute.submit(ticket);
    return reply.code(202).send(ticket);
  });

  app.get("/api/compute/tribute/queue", async (_request, reply) => {
    const queue = computeTribute.getAll();
    return { queue, count: queue.length };
  });

  app.get("/api/compute/tribute/next", async (_request, reply) => {
    const next = computeTribute.next();
    if (!next) {
      return reply.code(404).send({ error: "queue empty" });
    }
    return next;
  });

  app.post("/api/compute/projects/weight", async (request, reply) => {
    const { projectId, weight } = request.body as { projectId?: string; weight?: number };
    if (!projectId || typeof weight !== "number") {
      return reply.code(400).send({ error: "projectId and weight required" });
    }
    computeTribute.setProjectWeight(projectId, weight);
    return { set: true, projectId, weight };
  });
}
