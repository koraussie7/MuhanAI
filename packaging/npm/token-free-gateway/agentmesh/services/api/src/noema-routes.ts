import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { NoemaService } from "./noema-service.js";

const SearchRequestSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().positive().max(50).default(10),
  sources: z.array(z.enum(["hf", "mesh", "https"])).default(["hf", "mesh"]),
});

const DownloadRequestSchema = z.object({
  manifestId: z.string().min(1),
  destination: z.string().optional(),
  sources: z.array(z.any()).optional(),
  priority: z.enum(["speed", "privacy", "balanced"]).default("balanced"),
});

export async function noemaRoutes(app: FastifyInstance) {
  const service = new NoemaService();

  app.post("/api/noema/search", async (request, reply) => {
    const parse = SearchRequestSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({ error: parse.error.message });
    }

    const { query, limit, sources } = parse.data;
    const results = await service.searchManifests({ query, limit, sources });
    return results;
  });

  app.post("/api/noema/download", async (request, reply) => {
    const parse = DownloadRequestSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({ error: parse.error.message });
    }

    const status = await service.startDownload(parse.data);
    return reply.code(202).send(status);
  });

  app.get("/api/noema/status/:manifestId", async (request, reply) => {
    const { manifestId } = request.params as { manifestId: string };
    const status = await service.getDownloadStatus(manifestId);
    if (!status) {
      return reply.code(404).send({ error: "manifest not found" });
    }
    return status;
  });

  app.post("/api/noema/broadcast", async (request, reply) => {
    const body = request.body as {
      manifestId?: string;
      filePath?: string;
      license?: string;
      private?: boolean;
    };

    if (!body?.manifestId || !body?.filePath || !body?.license) {
      return reply.code(400).send({ error: "manifestId, filePath, license required" });
    }

    const result = await service.broadcastModel({
      manifestId: body.manifestId,
      filePath: body.filePath,
      license: body.license,
      private: body.private,
    });
    return reply.code(201).send(result);
  });

  app.post("/api/noema/verify", async (request, reply) => {
    const { manifest, signature } = request.body as {
      manifest: Record<string, unknown>;
      signature: string;
    };
    const valid = await service.verifySignature(manifest, signature);
    return { valid };
  });
}
