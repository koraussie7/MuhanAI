import Fastify from "fastify";
import cors from "@fastify/cors";
import { AgentCast } from "@agentmesh/cast";
import { AgentExecutor, AgentRegistry } from "@agentmesh/agent";
import { MockAdapter } from "@agentmesh/adapters";

export function buildServer() {
  const registry = new AgentRegistry();
  registry.register(new MockAdapter());
  const cast = new AgentCast(new AgentExecutor(registry));
  const app = Fastify({ logger: true });
  void app.register(cors, { origin: true });

  app.get("/health", async () => ({ ok: true }));
  app.get("/api/agents", async () => registry.descriptors());
  app.get("/api/network", async () => ({ agents: (await registry.descriptors()).length, status: "online" }));
  app.post("/api/cast", async (request, reply) => {
    const body = request.body as { question?: unknown; agents?: unknown };
    if (typeof body.question !== "string" || !body.question.trim()) {
      return reply.code(400).send({ error: "question is required" });
    }
    if (body.agents !== undefined && (!Array.isArray(body.agents) || !body.agents.every((agent): agent is string => typeof agent === "string"))) {
      return reply.code(400).send({ error: "agents must be an array of strings" });
    }
    const agents = body.agents ?? ["mock"];
    return cast.run({ id: crypto.randomUUID(), question: body.question, agents });
  });
  app.get("/api/events", async () => ({ message: "WebSocket event transport is planned for Phase 2" }));
  return app;
}

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT ?? 3001);
  const host = process.env.HOST ?? "127.0.0.1";
  void buildServer().listen({ port, host });
}
