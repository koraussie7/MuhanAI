import type { FastifyInstance } from "fastify";
import { identityService } from "@agentmesh/knowledge-base";

export async function agentsRoutes(app: FastifyInstance) {
  app.get("/api/agents", async (_request, _reply) => {
    const identities = identityService.getAll();
    return identities.map((identity) => ({
      id: identity.peerId,
      name: identity.peerId,
      type: "agent",
      online: true,
      capabilities: ["inference", "verification"],
      reputation: 95,
      success: 97,
      did: `did:muhan:agent:${identity.peerId}`,
      publicKey: identity.publicKey,
      fingerprint: identity.fingerprint,
    }));
  });
}
