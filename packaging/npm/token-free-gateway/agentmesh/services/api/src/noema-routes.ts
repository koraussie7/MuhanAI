import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { NoemaService } from "./noema-service.js";

const SearchRequestSchema = z.object({
  query: z.string().min(1).max(1024),
  limit: z.number().int().positive().max(50).default(10),
  sources: z.array(z.enum(["hf", "mesh", "https"])).max(10).default(["hf", "mesh"]),
});

const DownloadRequestSchema = z.object({
  manifestId: z.string().min(1).max(256),
  destination: z.string().max(1024).optional(),
  // Bounded array of unknown sources — no per-item shape required (the
  // NoemaService decides what it accepts), but capped to prevent a hostile
  // caller from streaming an unbounded payload.
  sources: z.array(z.unknown()).max(50).optional(),
  priority: z.enum(["speed", "privacy", "balanced"]).default("balanced"),
});

const BroadcastSchema = z.object({
  manifestId: z.string().min(1).max(256),
  filePath: z
    .string()
    .min(1)
    .max(1024)
    .regex(/^[A-Za-z0-9._/-]+$/, "filePath must contain only safe path characters"),
  license: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9._-]+$/, "license must contain only safe characters"),
  private: z.boolean().optional(),
});

const VerifySchema = z.object({
  manifest: z.record(z.unknown()),
  signature: z.string().min(1).max(4096),
});

function isPathSafe(filePath: string): boolean {
  if (filePath.includes("..")) return false;
  if (filePath.startsWith("/") || filePath.startsWith("\\")) return false;
  if (filePath.includes("//")) return false;
  return true;
}

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
    const parse = BroadcastSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({ error: parse.error.message });
    }
    if (!isPathSafe(parse.data.filePath)) {
      return reply.code(400).send({
        error: "filePath must be relative, contain no '..' segments, and not start with '/'",
      });
    }

    const result = await service.broadcastModel({
      manifestId: parse.data.manifestId,
      filePath: parse.data.filePath,
      license: parse.data.license,
      private: parse.data.private,
    });
    return reply.code(201).send(result);
  });

  app.post("/api/noema/verify", async (request, reply) => {
    const parse = VerifySchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({ error: parse.error.message });
    }
    const { manifest, signature } = parse.data;
    const valid = await service.verifySignature(manifest, signature);
    return { valid };
  });
}
