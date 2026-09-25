import { identityService } from "@agentmesh/knowledge-base";
import type { FastifyInstance } from "fastify";
import { getVisitorPeers } from "./visitor-routes.js";

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

	app.get("/api/nodes", async (_request, _reply) => {
	const identities = identityService.getAll();
	const agentNodes = identities.map((identity) => ({
	id: identity.peerId,
	name: identity.peerId,
		type: "agent",
	role: "node",
		hostname: identity.peerId,
	lastSeen: Date.now(),
	registeredAt: Date.now(),
	}));
	return [...agentNodes, ...getVisitorPeers()];
	});
}
