import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HiveBearClient } from "@agentmesh/hivebear";

const MeshStartSchema = z.object({
  port: z.number().int().positive().max(65535).default(7878),
});

const ModelRunSchema = z.object({
  modelId: z.string().min(1),
  prompt: z.string().min(1),
  stream: z.boolean().optional(),
});

export async function hivebearRoutes(app: FastifyInstance) {
  const client = new HiveBearClient();

  app.get("/api/hivebear/status", async (_request, reply) => {
    const status = await client.status();
    if (!status) {
      return reply.code(503).send({ error: "HiveBear unavailable" });
    }
    return status;
  });

  app.post("/api/hivebear/mesh/start", async (request, reply) => {
    const parse = MeshStartSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({ error: parse.error.message });
    }

    const ok = await client.startMesh(parse.data.port);
    if (!ok) {
      return reply.code(500).send({ error: "Failed to start mesh" });
    }
    return { started: true, port: parse.data.port };
  });

  app.get("/api/hivebear/models", async (_request, reply) => {
    const models = await client.searchModels("local");
    return { models };
  });

  app.post("/api/hivebear/run", async (request, reply) => {
    const parse = ModelRunSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({ error: parse.error.message });
    }

    const { modelId, prompt, stream } = parse.data;
    try {
      const result = await client.runModel(modelId, prompt, { stream });
      return { output: result };
    } catch (e) {
      return reply.code(500).send({ error: (e as Error).message });
    }
  });
}
