import {
	createGhostDiscoveryClient,
	createGhostRegistry,
	type GhostNode,
} from "@agentmesh/ghost-adapter";
import type { FastifyInstance } from "fastify";

export const ghostRegistry = createGhostRegistry();
// Resolve fetch at request time so tests and hosts can provide their own transport.
const discovery = createGhostDiscoveryClient((input, init) => globalThis.fetch(input, init));

interface RegisterGhostBody {
  nodeId: string;
  url: string;
}

export async function ghostRoutes(app: FastifyInstance) {
  app.get("/api/ghost/nodes", async () => ghostRegistry.list());

  app.post<{ Body: RegisterGhostBody }>("/api/ghost/nodes", async (request, reply) => {
    const nodeId = request.body?.nodeId?.trim();
    const baseUrl = request.body?.url?.trim();
    if (!nodeId || !baseUrl) {
      return reply.code(400).send({ error: "nodeId and url are required" });
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(baseUrl);
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        throw new Error("unsupported protocol");
      }
    } catch {
      return reply.code(400).send({ error: "url must be an http or https URL" });
    }

    try {
      const card = await discovery.discover(parsedUrl.toString());
      const node: GhostNode = { nodeId, card, lastSeenAt: Date.now() };
      ghostRegistry.upsert(node);
      return reply.code(201).send(node);
    } catch (error) {
      return reply.code(502).send({
        error: "ghost_discovery_failed",
        message: error instanceof Error ? error.message : "Agent Card request failed",
      });
    }
  });
}
