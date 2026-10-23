import { computeTribute } from "@agentmesh/compute-market";
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
				online: undefined,
				available: undefined,
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

	// The web shell has always polled these two endpoints, but the server never
	// implemented them — every page load logged 404/502 noise for routes that
	// were never going to answer. The panels that read them already render
	// sensible defaults for empty data, so an explicit empty payload is the
	// honest answer until the gossip/credit layer lands.
	app.get("/api/nodes", async (_request, _reply) => {
		const key = app.server.address() as string;
		const transportPeers: TransportPeer[] = transportInstances.get(key)?.getPeers() ?? [];

		return transportPeers.map((peer) => ({
			id: peer.peerId,
			name: peer.peerId,
			address: peer.address,
			status: peer.online ? "connected" : "offline",
			latencyMs: 1,
		}));
	});

	app.get("/api/mesh/pulse", async (_request, _reply) => {
		const key = app.server.address() as string;
		const transportPeers: TransportPeer[] = transportInstances.get(key)?.getPeers() ?? [];

		return {
			peers: transportPeers.filter((p) => p.online).length,
			bytesUp: 0,
			bytesDown: 0,
			latencyMs: transportPeers.length > 0 ? 1 : 0,
			updatedAt: Date.now(),
			source: transportPeers.length > 0 ? "transport" : "unconfigured",
		};
	});
}
