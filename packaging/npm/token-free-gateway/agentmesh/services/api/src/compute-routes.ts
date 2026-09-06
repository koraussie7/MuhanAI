import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { computeTribute } from "@agentmesh/compute";

const SubmitSchema = z.object({
  taskId: z.string().min(1).max(256),
  projectId: z.string().max(256).optional(),
  networkShare: z.number().min(0).max(1).default(0.5),
  personalShare: z.number().min(0).max(1).default(0.5),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
});

const SetWeightSchema = z.object({
  projectId: z.string().min(1).max(256),
  weight: z.number().finite().min(0).max(1),
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
    await computeTribute.submit(ticket);
    return reply.code(202).send(ticket);
  });

  app.get("/api/compute/tribute/queue", async (_request, reply) => {
    const queue = computeTribute.getAll();
    return { queue, count: queue.length };
  });

  app.post("/api/compute/tribute/next", async (_request, reply) => {
    const next = await computeTribute.next();
    if (!next) {
      return reply.code(404).send({ error: "queue empty" });
    }
    return next;
  });

  app.delete("/api/compute/tribute/:taskId", async (request, reply) => {
    const { taskId } = request.params as { taskId: string };
    const removed = await computeTribute.remove(taskId);
    if (!removed) {
      return reply.code(404).send({ error: "task not found" });
    }
    return { removed: true, taskId };
  });

  app.post("/api/compute/projects/weight", async (request, reply) => {
    const parse = SetWeightSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({ error: parse.error.message });
    }
    const { projectId, weight } = parse.data;
    computeTribute.setProjectWeight(projectId, weight);
    return { set: true, projectId, weight };
  });
}
