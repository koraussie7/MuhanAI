import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

const VisitorEnrollSchema = z.object({
	capabilities: z.array(z.string().min(1).max(64)).max(20).optional(),
	path: z.string().min(1).max(256).optional(),
});

const VisitorHeartbeatSchema = z.object({
	token: z.string().uuid(),
	path: z.string().min(1).max(256).optional(),
});

const VisitorPulseSchema = z.object({
	token: z.string().uuid(),
	kind: z.enum(["pulse", "presence", "request", "reply"]),
	payload: z.unknown().optional(),
});

interface VisitorPeer {
	id: string;
	token: string;
	capabilities: string[];
	path: string;
	connectedAt: number;
	lastSeen: number;
}

const VISITOR_TTL_MS = 90_000;
const visitors = new Map<string, VisitorPeer>();

function pruneVisitors(now = Date.now()): void {
	for (const [id, visitor] of visitors) {
		if (now - visitor.lastSeen > VISITOR_TTL_MS) visitors.delete(id);
	}
}

export function getVisitorPeers(): Array<{
	id: string;
	name: string;
	type: "browser";
	role: "visitor";
	lastSeen: number;
	registeredAt: number;
	capabilities: string[];
	path: string;
}> {
	pruneVisitors();
	return Array.from(visitors.values()).map((visitor) => ({
		id: visitor.id,
		name: visitor.id,
		type: "browser",
		role: "visitor",
		lastSeen: visitor.lastSeen,
		registeredAt: visitor.connectedAt,
		capabilities: visitor.capabilities,
		path: visitor.path,
	}));
}

export async function visitorRoutes(app: FastifyInstance): Promise<void> {
	app.post("/api/visitors/enroll", async (request, reply) => {
		const parse = VisitorEnrollSchema.safeParse(request.body ?? {});
		if (!parse.success) {
			return reply.code(400).send({ error: "Invalid visitor enrollment payload" });
		}

		const now = Date.now();
		pruneVisitors(now);
		const token = randomUUID();
		const id = `browser-${token}`;
		const visitor: VisitorPeer = {
			id,
			token,
			capabilities: parse.data.capabilities ?? ["presence", "pulse-read"],
			path: parse.data.path ?? "/",
			connectedAt: now,
			lastSeen: now,
		};
		visitors.set(id, visitor);

		return reply.code(201).send({
			peer: {
				id: visitor.id,
				type: "browser",
				role: "visitor",
				connectedAt: new Date(now).toISOString(),
			},
			token,
			heartbeatEveryMs: 30_000,
			expiresAfterMs: VISITOR_TTL_MS,
					relay: {
			transport: process.env.VISITOR_RELAY_MULTIADDR ? "libp2p-webrtc" : "presence",
			websocket: Boolean(process.env.VISITOR_RELAY_MULTIADDR),
			multiaddr: process.env.VISITOR_RELAY_MULTIADDR ?? null,
			message: process.env.VISITOR_RELAY_MULTIADDR
			? "Browser WebRTC relay is available."
			: "Browser presence is enrolled; WebRTC relay is not configured on this deployment.",
			},
		});
	});

	app.post("/api/visitors/heartbeat", async (request, reply) => {
		const parse = VisitorHeartbeatSchema.safeParse(request.body);
		if (!parse.success) {
			return reply.code(400).send({ error: "Invalid visitor heartbeat payload" });
		}

		pruneVisitors();
		const visitor = Array.from(visitors.values()).find((item) => item.token === parse.data.token);
		if (!visitor) return reply.code(404).send({ error: "Visitor session expired" });

		visitor.lastSeen = Date.now();
		if (parse.data.path !== undefined) visitor.path = parse.data.path;
		return { ok: true, peerId: visitor.id, expiresAfterMs: VISITOR_TTL_MS };
	});

	app.post("/api/visitors/pulse", async (request, reply) => {
	const parse = VisitorPulseSchema.safeParse(request.body);
	if (!parse.success) return reply.code(400).send({ error: "Invalid visitor pulse" });
	pruneVisitors();
	const visitor = Array.from(visitors.values()).find((item) => item.token === parse.data.token);
	if (!visitor) return reply.code(404).send({ error: "Visitor session expired" });
	visitor.lastSeen = Date.now();
	return {
	ok: true,
	message: {
	v: 1,
	kind: parse.data.kind,
	fromPeerId: visitor.id,
	payload: parse.data.payload,
		ts: visitor.lastSeen,
	},
	};
	});

	app.get("/api/visitors/peers", async () => ({
	peers: getVisitorPeers(),
		ttlMs: VISITOR_TTL_MS,
	}));
}
