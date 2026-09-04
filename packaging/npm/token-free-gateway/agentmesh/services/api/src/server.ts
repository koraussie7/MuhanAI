import Fastify from "fastify";
import cors from "@fastify/cors";
import { AgentCast } from "@agentmesh/cast";
import { AgentExecutor, AgentRegistry } from "@agentmesh/agent";
import { MockAdapter, OpenAICompatibleAdapter } from "@agentmesh/adapters";
import {
  pulse,
  listHelpNeeded,
  createHelpNeeded,
  answerHelpNeeded,
  listVerify,
  voteVerify,
  trending,
  listWanted,
  shareWanted,
  listVersus,
  submitTeach,
  addReward,
  rewardTable,
  rewardsFor,
  unsolved,
  listKnowledge,
  knowledgeKinds,
  knowledgeGraph,
  listHumanAgents,
  humanAgentCategories,
  listMcpServers,
  listModels,
  contributions,
  reputation,
  listProjects,
  listTasks,
  listWorkflows,
  networkStats,
  search,
  type VerifyVote,
} from "./feeds.js";

export async function buildServer() {
  const registry = new AgentRegistry();
  registry.register(new MockAdapter());

  // Connect to token-free-gateway (OpenAI-compatible)
  const gatewayUrl = process.env.GATEWAY_URL ?? "http://localhost:8080";
  const config: import("@agentmesh/adapters").OpenAICompatibleConfig = { baseUrl: gatewayUrl };
  if (process.env.GATEWAY_API_KEY) config.apiKey = process.env.GATEWAY_API_KEY;
  if (process.env.GATEWAY_MODEL) config.model = process.env.GATEWAY_MODEL;
  registry.register(new OpenAICompatibleAdapter("gateway", config));

  const cast = new AgentCast(new AgentExecutor(registry));
  const app = Fastify({ logger: true });
  void app.register(cors, { origin: true });

  // Keep the registry health snapshot fresh: /api/pulse and /api/network/stats
  // read from it instead of static demo numbers (Phase 3-A #1).
  await registry.refreshHealth();
  const healthTimer = setInterval(() => {
    void registry.refreshHealth();
  }, 30_000);
  healthTimer.unref();

  app.get("/health", async () => ({ ok: true }));
  app.get("/api/agents", async () => registry.descriptors());
  app.get("/api/network", async () => {
    const stats = await registry.stats();
    return { agents: stats.online, total: stats.total, byType: stats.byType, status: "online" };
  });
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

  // ---- Network Pulse (spec: CLAUDE.md Part 1, priority #1) ----
  app.get("/api/pulse", async () => {
    const stats = await registry.stats();
    return pulse({ agentsOnline: stats.online });
  });

  // ---- Help Needed / AI Needs Human (priority #2) ----
  app.get("/api/help-needed", async () => listHelpNeeded());
  app.post("/api/help-needed", async (request, reply) => {
    const body = request.body as { question?: unknown; aiConfidence?: unknown; reward?: unknown };
    if (typeof body.question !== "string" || !body.question.trim()) {
      return reply.code(400).send({ error: "question is required" });
    }
    const item = createHelpNeeded({
      question: body.question,
      ...(typeof body.aiConfidence === "number" ? { aiConfidence: body.aiConfidence } : {}),
      ...(typeof body.reward === "number" ? { reward: body.reward } : {}),
    });
    return reply.code(201).send(item);
  });
  app.post("/api/help-needed/:id/answer", async (request, reply) => {
    const { id } = request.params as { id: string };
    const item = answerHelpNeeded(id);
    if (!item) return reply.code(404).send({ error: "not found" });
    return item;
  });

  // ---- Verify Me (priority #3) ----
  app.get("/api/verify", async () => listVerify());
  app.post("/api/verify/:id/vote", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { vote?: unknown };
    if (body.vote !== "correct" && body.vote !== "wrong" && body.vote !== "unsure") {
      return reply.code(400).send({ error: "vote must be correct | wrong | unsure" });
    }
    const item = voteVerify(id, body.vote as VerifyVote);
    if (!item) return reply.code(404).send({ error: "not found" });
    const reward = addReward("anonymous", "Verification", 80);
    return { item, reward };
  });

  // ---- Priority #4-#9 ----
  app.get("/api/trending", async () => trending());
  app.get("/api/human-wanted", async () => listWanted());
  app.post("/api/human-wanted/:id/share", async (request, reply) => {
    const { id } = request.params as { id: string };
    const item = shareWanted(id);
    if (!item) return reply.code(404).send({ error: "not found" });
    return { item, reward: addReward("anonymous", "Experience shared", 60) };
  });
  app.get("/api/ai-vs-human", async () => listVersus());
  app.post("/api/teach", async (request, reply) => {
    const body = request.body as { actorId?: unknown; content?: unknown };
    if (typeof body.content !== "string" || !body.content.trim()) {
      return reply.code(400).send({ error: "content is required" });
    }
    const actorId = typeof body.actorId === "string" && body.actorId ? body.actorId : "anonymous";
    const submission = submitTeach(actorId, body.content);
    return reply.code(201).send({ submission, reward: addReward(actorId, "Teach AI", 250) });
  });
  app.get("/api/rewards/table", async () => rewardTable());
  app.get("/api/rewards/:actorId", async (request) => {
    const { actorId } = request.params as { actorId: string };
    return rewardsFor(actorId);
  });
  app.get("/api/unsolved", async () => unsolved());

  // ---- Priority #5-#10: Part 5 screens (spec: CLAUDE.md Part 5) ----
  app.get("/api/knowledge", async (request) => {
    const { kind } = request.query as { kind?: string };
    return listKnowledge(kind);
  });
  app.get("/api/knowledge/kinds", async () => knowledgeKinds());
  app.get("/api/knowledge-graph", async () => knowledgeGraph());
  app.get("/api/human-agents", async (request) => {
    const { category } = request.query as { category?: string };
    return listHumanAgents(category);
  });
  app.get("/api/human-agents/categories", async () => humanAgentCategories());
  app.get("/api/mcp", async () => listMcpServers());
  app.get("/api/models", async () => listModels());
  app.get("/api/contributions", async () => contributions());
  app.get("/api/reputation", async () => reputation());
  app.get("/api/projects", async () => listProjects());
  app.get("/api/tasks", async () => listTasks());
  app.get("/api/workflows", async () => listWorkflows());
  app.get("/api/network/stats", async () => {
    const base = networkStats();
    const stats = await registry.stats();
    return {
      ...base,
      // Real registry snapshot overrides the demo agent count and adds the
      // type breakdown (llm/human/mcp/compute/search) for the mesh console.
      agentsOnline: stats.online,
      registry: {
        total: stats.total,
        online: stats.online,
        byType: stats.byType,
        onlineByType: stats.onlineByType,
        avgLatencyMs: stats.avgLatencyMs,
        checkedAt: stats.checkedAt,
      },
    };
  });
  app.get("/api/search", async (request) => {
    const { q } = request.query as { q?: string };
    return search(typeof q === "string" ? q : undefined);
  });
  return app;
}

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT ?? 3001);
  const host = process.env.HOST ?? "127.0.0.1";
  void buildServer().then((app) => app.listen({ port, host }));
}
