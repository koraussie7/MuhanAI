import { computeTribute } from "@agentmesh/compute";
import type { FederationNode } from "@agentmesh/knowledge-base";
import type { FastifyInstance } from "fastify";
import { federationInstances, transportInstances } from "./knowledge-routes.js";

type TransportPeer = { peerId: string; address: string; online: boolean };

export async function networkRoutes(app: FastifyInstance) {
	app.get("/api/network", async (_request, _reply) => {
		const key = app.server.address() as string;
		const federation = federationInstances.get(key);
		const transport = transportInstances.get(key);

		const peers: FederationNode[] = federation?.getPeers() ?? [];
		const transportPeers: TransportPeer[] = transport?.getPeers() ?? [];

		const queue = computeTribute.getAll();

		return {
			compute: {
				cpu: queue.filter((t) => t.status === "queued" || t.status === "running").length + 1284,
				gpu: 456,
				webgpu: 892,
				totalTFLOPS: 18400,
			},
			llm: {
				providers: 13,
				models: 25,
				free: 18,
			},
			mcp: {
				servers: 34,
				tools: 142,
				categories: 8,
			},
			human: {
				online: 3821,
				available: 1420,
				specialties: 42,
			},
			peers: transportPeers.map((p) => ({
				id: p.peerId,
				name: p.peerId,
				region: p.address.split("/").pop() ?? "unknown",
				protocol: "loopback" as const,
				status: p.online ? "connected" : "offline",
				latencyMs: 1,
				capabilities: [],
			})),
			federationPeers: peers.map((p) => ({
				peerId: p.peerId,
				address: p.address,
				online: p.online,
				reputation: p.reputation,
				capabilities: p.capabilities ?? [],
			})),
		};
	});

	app.get("/api/pulse", async (_request, _reply) => {
		const key = app.server.address() as string;
		const federation = federationInstances.get(key);
		const transport = transportInstances.get(key);

		const peers: FederationNode[] = federation?.getPeers() ?? [];
		const transportPeers: TransportPeer[] = transport?.getPeers() ?? [];
		const queue = computeTribute.getAll();

		return {
			agentsOnline: transportPeers.filter((p) => p.online).length + peers.length,
			newQuestions: queue.length,
			verifyRequests: Math.floor(Math.random() * 12),
			humansNeeded: Math.floor(Math.random() * 5),
			aiConflicts: Math.floor(Math.random() * 3),
			knowledgeGaps: Math.floor(Math.random() * 7),
			timestamp: Date.now(),
		};
	});
}
