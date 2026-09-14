/**
 * Society Protocol routes for the AgentMesh API.
 *
 * Exposes the society P2P network (identity, peers, reputation, knowledge,
 * collaboration chains) over HTTP so the web dashboard and external clients
 * can drive a live society node.
 *
 * The society client is optional: if SOCIETY_ENABLED is not set, the routes
 * return 503 with a clear message. This keeps the API server runnable in
 * environments without native modules (e.g. CI, Cloudflare).
 */

import type { FastifyInstance } from "fastify";
import type { SocietyClient } from "@agentmesh/society";

export interface SocietyRouteOptions {
  /** Pre-built society client. If omitted, routes return 503. */
  client: SocietyClient | null;
  room: string;
  knowledgeSpace: string;
}

export async function registerSocietyRoutes(
  app: FastifyInstance,
  opts: SocietyRouteOptions,
): Promise<void> {
  const { client, room, knowledgeSpace } = opts;

  app.get("/api/society/status", async () => {
    if (!client) return { enabled: false };
    const identity = client.getIdentity();
    const peers = await client.getPeers(room);
    const rep = await client.getReputation();
    return {
      enabled: true,
      did: identity.did,
      displayName: identity.name,
      peerId: client.getPeerId(),
      room,
      peersOnline: peers.filter((p) => p.status === "online").length,
      reputation: rep.overall,
    };
  });

  app.get("/api/society/peers", async () => {
    if (!client) return { enabled: false, peers: [] };
    return { enabled: true, room, peers: await client.getPeers(room) };
  });

  app.post("/api/society/summon", async (request, reply) => {
    if (!client) return reply.code(503).send({ error: "society not enabled" });
    const body = request.body as { goal?: string; priority?: string };
    if (!body.goal) return reply.code(400).send({ error: "goal is required" });
    const chain = await client.summon({
      goal: body.goal,
      roomId: room,
      priority: (body.priority ?? "normal") as "low" | "normal" | "high" | "critical",
    });
    return reply.code(201).send({ chain });
  });

  app.get("/api/society/knowledge", async (request) => {
    if (!client) return { enabled: false, cards: [] };
    const q = request.query as { tag?: string };
    const cards = await client.queryKnowledgeCards(
      q.tag ? { tags: [q.tag] } : {},
    );
    return { enabled: true, space: knowledgeSpace, cards };
  });

  app.post("/api/society/knowledge", async (request, reply) => {
    if (!client) return reply.code(503).send({ error: "society not enabled" });
    const body = request.body as { title?: string; content?: string; tags?: string[] };
    if (!body.content) return reply.code(400).send({ error: "content is required" });
    // Ensure space exists, then add card.
    const space = await client.createKnowledgeSpace(knowledgeSpace, "AgentMesh API knowledge", "team");
    const spaceId = typeof space === "object" && space && "id" in space
      ? String((space as { id: unknown }).id)
      : String(space);
    const card = await client.createKnowledgeCard(
      spaceId,
      "claim",
      body.title ?? body.content.slice(0, 80),
      body.content,
      { tags: body.tags ?? [] },
    );
    return reply.code(201).send({ card });
  });

  app.get("/api/society/knowledge-graph", async () => {
    if (!client) return { enabled: false, nodes: [], edges: [] };
    const space = await client.createKnowledgeSpace(knowledgeSpace, "AgentMesh API knowledge", "team");
    const spaceId = typeof space === "object" && space && "id" in space
      ? String((space as { id: unknown }).id)
      : String(space);
    const g = client.getKnowledgeGraph(spaceId);
    return { enabled: true, space: knowledgeSpace, graph: g };
  });
}
