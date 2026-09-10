import { TransportManager } from "@agentmesh/federation";
import type { FederationNode } from "@agentmesh/knowledge-base";
import { FederationMesh, identityService, wheelProtocol } from "@agentmesh/knowledge-base";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { clientError, formatZodError } from "./error-shapes.js";

const RegisterSchema = z.object({
	id: z.string().min(1).max(256),
	type: z.string().min(1).max(128),
	content: z.string().min(1).max(65536),
	ownerId: z.string().min(1).max(256),
	shared: z.boolean().default(true),
});

const QuerySchema = z.object({
	type: z.string().min(1).max(128),
	requirement: z.string().min(1).max(4096),
});

const IngestSchema = z.object({
	content: z.string().min(1).max(65536),
	type: z.string().min(1).max(128),
	ownerId: z.string().min(1).max(256),
	sources: z.array(z.string().max(1024)).max(50).optional(),
	metadata: z.record(z.unknown()).optional(),
});

const IdentityCreateSchema = z.object({
	peerId: z.string().min(1).max(256),
});

const FederationQuerySchema = z.object({
	query: z.string().min(1).max(4096),
	embedding: z.array(z.number().finite()).max(8192).optional(),
});

const PeerSchema = z.object({
	peerId: z.string().min(1).max(256),
	address: z.string().min(1).max(512),
	publicKey: z.string().max(8192).optional(),
	capabilities: z.array(z.string().max(128)).max(50).default([]),
});

const TransportStartSchema = z.object({
	kind: z.enum(["libp2p", "http", "loopback"]).default("loopback"),
	// Multiaddr-ish strings: only allow safe characters and a reasonable length.
	listenAddr: z
		.string()
		.min(1)
		.max(256)
		.regex(/^[A-Za-z0-9./:-]+$/, "listenAddr contains invalid characters")
		.optional(),
	bootstrap: z
		.array(
			z
				.string()
				.min(1)
				.max(512)
				.regex(/^[A-Za-z0-9./:-]+$/),
		)
		.max(50)
		.default([]),
});

const SignedRecordSchema = z.object({
	id: z.string().min(1).max(512),
	content: z.string().max(65536),
	type: z.string().min(1).max(128),
	ownerId: z.string().min(1).max(256),
	peerId: z.string().min(1).max(256),
	signature: z.string().min(1).max(8192),
	publicKey: z.string().min(1).max(8192),
	timestamp: z.number().int().nonnegative(),
	vectorClock: z.record(z.string(), z.number().int().nonnegative()),
	sources: z.array(z.string().max(1024)).max(50).optional(),
	metadata: z.record(z.unknown()).optional(),
});

export const federationInstances = new Map<string, FederationMesh>();
export const transportInstances = new Map<string, TransportManager>();

function getFederation(app: FastifyInstance): {
	federation: FederationMesh;
	transport: TransportManager;
} {
	const key = app.server.address() as string;
	let federation = federationInstances.get(key);
	let transport = transportInstances.get(key);

	if (!federation || !transport) {
		transport = new TransportManager({
			peerId: `node-${key}`,
			preferred: "loopback",
		});

		federation = new FederationMesh({
			peerId: `node-${key}`,
			energyGate: { temperature: 0.2, minHits: 2, admitThreshold: 0.75 },
			provenanceRanker: { poisonFlipBudget: 0.02, minTrust: 0.3 },
		});

		federationInstances.set(key, federation);
		transportInstances.set(key, transport);
	}

	return { federation, transport };
}

export async function knowledgeRoutes(app: FastifyInstance) {
	const { federation, transport } = getFederation(app);

	app.post("/api/knowledge/wheel/register", async (request, reply) => {
		const parse = RegisterSchema.safeParse(request.body);
		if (!parse.success) {
			return clientError(reply, 400, formatZodError(parse.error), request.id);
		}

		const { id, type, content, ownerId, shared } = parse.data;
		wheelProtocol.register({
			id,
			type,
			content,
			ownerId,
			shared,
			timestamp: Date.now(),
		});

		return reply.code(201).send({ registered: true, id });
	});

	app.post("/api/knowledge/wheel/query", async (request, reply) => {
		const parse = QuerySchema.safeParse(request.body);
		if (!parse.success) {
			return clientError(reply, 400, formatZodError(parse.error), request.id);
		}

		const result = wheelProtocol.query(parse.data.type, parse.data.requirement);
		return result;
	});

	app.get("/api/knowledge/wheel/shared", async (_request, _reply) => {
		const shared = wheelProtocol.listShared();
		return { components: shared };
	});

	app.post("/api/knowledge/wheel/share/:id", async (request, _reply) => {
		const { id } = request.params as { id: string };
		wheelProtocol.markShared(id);
		return { shared: true, id };
	});

	app.post("/api/knowledge/folklore/ingest", async (request, reply) => {
		const parse = IngestSchema.safeParse(request.body);
		if (!parse.success) {
			return clientError(reply, 400, formatZodError(parse.error), request.id);
		}

		const { content, type, ownerId, sources, metadata } = parse.data;
		const peerId = `node-${app.server.address()}`;

		try {
			let identity = identityService.getIdentity(peerId);
			if (!identity) {
				identity = await identityService.createIdentity(peerId);
			}

			const record = await identityService.signRecord(peerId, {
				id: `${peerId}:${Date.now()}:${Math.random().toString(36).slice(2, 9)}`,
				content,
				type,
				ownerId,
				sources,
				metadata,
			});

			federation.ingest(record);
			return reply.code(201).send({
				ingested: true,
				id: record.id,
				publicKey: record.publicKey,
				signature: record.signature,
			});
		} catch (e) {
			request.log.error({ err: e, route: "folklore/ingest" }, "folklore ingest failed");
			return clientError(reply, 500, "Ingest failed", request.id);
		}
	});

	app.post("/api/knowledge/folklore/identity", async (request, reply) => {
		const parse = IdentityCreateSchema.safeParse(request.body);
		if (!parse.success) {
			return clientError(reply, 400, formatZodError(parse.error), request.id);
		}

		const identity = await identityService.createIdentity(parse.data.peerId);
		return reply.code(201).send({
			peerId: identity.peerId,
			publicKey: identity.publicKey,
			fingerprint: identity.fingerprint,
		});
	});

	app.get("/api/knowledge/folklore/identity/:peerId", async (request, reply) => {
		const { peerId } = request.params as { peerId: string };
		const identity = identityService.getIdentity(peerId);
		if (!identity) {
			return reply.code(404).send({ error: "identity not found" });
		}
		return {
			peerId: identity.peerId,
			publicKey: identity.publicKey,
			fingerprint: identity.fingerprint,
		};
	});

	app.post("/api/knowledge/folklore/verify", async (request, reply) => {
		const body = request.body as { record?: unknown };
		const parse = SignedRecordSchema.safeParse(body?.record);
		if (!parse.success) {
			return clientError(reply, 400, formatZodError(parse.error), request.id);
		}
		const valid = await identityService.verifyRecord(parse.data);
		return { valid, peerId: parse.data.peerId };
	});

	app.post("/api/knowledge/folklore/query", async (request, reply) => {
		const parse = FederationQuerySchema.safeParse(request.body);
		if (!parse.success) {
			return clientError(reply, 400, formatZodError(parse.error), request.id);
		}

		const embedding = parse.data.embedding ?? new Array(384).fill(0);
		const results = await federation.query(embedding, parse.data.query);

		return {
			query: parse.data.query,
			results: results.slice(0, 20),
			count: results.length,
		};
	});

	app.get("/api/knowledge/folklore/peers", async (_request, _reply) => {
		const peers = federation.getPeers();
		return { peers, count: peers.length };
	});

	app.post("/api/knowledge/folklore/peers", async (request, reply) => {
		const parse = PeerSchema.safeParse(request.body);
		if (!parse.success) {
			return clientError(reply, 400, formatZodError(parse.error), request.id);
		}

		const peer: FederationNode = {
			...parse.data,
			lastSeen: Date.now(),
			reputation: 0,
			online: true,
		};

		federation.addPeer(peer);
		return reply.code(201).send({ added: true, peer });
	});

	app.delete("/api/knowledge/folklore/peers/:peerId", async (request, _reply) => {
		const { peerId } = request.params as { peerId: string };
		federation.removePeer(peerId);
		return { removed: true, peerId };
	});

	app.post("/api/knowledge/folklore/sync", async (_request, _reply) => {
		const result = await federation.sync();
		return result;
	});

	app.post("/api/knowledge/folklore/transport/start", async (request, reply) => {
		const parse = TransportStartSchema.safeParse(request.body);
		if (!parse.success) {
			return clientError(reply, 400, formatZodError(parse.error), request.id);
		}

		const { kind, listenAddr, bootstrap } = parse.data;

		if (kind === "libp2p") {
			try {
				await transport.stop();
				const newTransport = new TransportManager({
					peerId: `node-${app.server.address()}`,
					preferred: "libp2p",
					listenAddr: listenAddr ?? "/ip4/127.0.0.1/tcp/4001",
					bootstrap,
				});
				await newTransport.start();
				transportInstances.set(app.server.address() as string, newTransport);
				return { started: true, kind: "libp2p" };
			} catch (e) {
				request.log.error({ err: e, route: "folklore/transport/start" }, "transport start failed");
				return clientError(reply, 500, "Transport start failed", request.id);
			}
		}

		return { started: true, kind };
	});
}
