import { randomUUID, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

const VisitorEnrollSchema = z.object({
	capabilities: z.array(z.string().min(1).max(64)).max(20).optional(),
	path: z.string().min(1).max(256).optional(),
	publicKey: z.string().optional(),
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
	publicKey?: string;
}

const VISITOR_TTL_MS = 90_000;
const VISITOR_MAX_SIZE = 10_000;
const visitors = new Map<string, VisitorPeer>();
const visitorTokens = new Map<string, string>(); // token -> id, for O(1) lookup

function pruneVisitors(now = Date.now()): void {
	for (const [id, visitor] of visitors) {
		if (now - visitor.lastSeen > VISITOR_TTL_MS) {
			visitors.delete(id);
			visitorTokens.delete(visitor.token);
		}
	}
}

function findVisitorByToken(token: string): VisitorPeer | undefined {
	const id = visitorTokens.get(token);
	if (!id) return undefined;
	const visitor = visitors.get(id);
	if (!visitor) {
		visitorTokens.delete(token);
		return undefined;
	}
	return visitor;
}

function isTokenMatch(a: string, b: string): boolean {
	const ab = Buffer.from(a);
	const bb = Buffer.from(b);
	if (ab.length !== bb.length) return false;
	return timingSafeEqual(ab, bb);
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
	publicKey?: string;
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
		publicKey: visitor.publicKey,
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
			publicKey: parse.data.publicKey,
		};
		visitors.set(id, visitor);
		visitorTokens.set(token, id);

		if (visitors.size > VISITOR_MAX_SIZE) {
			for (const [oldId, oldVisitor] of Array.from(visitors.entries()).reverse()) {
				if (visitors.size <= VISITOR_MAX_SIZE) break;
				visitors.delete(oldId);
				visitorTokens.delete(oldVisitor.token);
			}
		}

		return reply.code(201).send({
			peer: {
				id: visitor.id,
				type: "browser",
				role: "visitor",
				connectedAt: new Date(now).toISOString(),
				publicKey: visitor.publicKey,
			},
			token,
			heartbeatEveryMs: 30_000,
			expiresAfterMs: VISITOR_TTL_MS,
			relay: {
				transport: process.env.VISITOR_RELAY_MULTIADDR ? "libp2p-webrtc" : "presence",
				websocket: Boolean(process.env.VISITOR_RELAY_MULTIADDR),
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

		const candidate = Array.from(visitors.values()).find((item) =>
			isTokenMatch(item.token, parse.data.token),
		);
		if (!candidate) return reply.code(404).send({ error: "Visitor session expired" });

		candidate.lastSeen = Date.now();
		if (parse.data.path !== undefined) candidate.path = parse.data.path;
		return { ok: true, peerId: candidate.id, expiresAfterMs: VISITOR_TTL_MS };
	});

	app.post("/api/visitors/pulse", async (request, reply) => {
		const parse = VisitorPulseSchema.safeParse(request.body);
		if (!parse.success) return reply.code(400).send({ error: "Invalid visitor pulse" });
		const candidate = findVisitorByToken(parse.data.token);
		if (!candidate) return reply.code(404).send({ error: "Visitor session expired" });
		candidate.lastSeen = Date.now();
		return {
			ok: true,
			message: {
				v: 1,
				kind: parse.data.kind,
				fromPeerId: candidate.id,
				payload: parse.data.payload,
				ts: candidate.lastSeen,
			},
		};
	});

	app.get("/api/visitors/peers", async () => ({
		peers: getVisitorPeers(),
		ttlMs: VISITOR_TTL_MS,
	}));
}
