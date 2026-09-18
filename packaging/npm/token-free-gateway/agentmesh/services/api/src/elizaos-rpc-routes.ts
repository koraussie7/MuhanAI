/**
 * elizaOS adapter RPC bridge — JSON-RPC 2.0 endpoints for the AgentMesh runtime.
 *
 * The elizaOS adapter (`packages/elizaos-adapter`) sends POST requests to
 *   POST /rpc/<method>
 * with a JSON-RPC 2.0 envelope: { jsonrpc: "2.0", id, method, params }
 *
 * This module maps each method to a concrete MuhanAI subsystem:
 *   - cast.run          → @agentmesh/agent-cast AgentCast (LLM-as-judge ensemble)
 *   - reputation.get    → @agentmesh/peer-mesh PeerReputationRegistry
 *   - credits.record    → @agentmesh/credit-system grantCredits / spendCredits
 *   - pulse.broadcast   → PulseBridge (SSE fan-out)
 */

import { agentCast } from "@agentmesh/agent-cast";
import { PeerReputationRegistry } from "@agentmesh/peer-mesh";
import {
	getCreditBalance,
	grantCredits,
	spendCredits,
} from "@agentmesh/credit-system";
import { prisma } from "./db.js";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { PulseMessage } from "@agentmesh/peer-mesh";

/**
 * Local copies of the elizaOS adapter types to avoid a runtime dependency
 * on @agentmesh/elizaos-adapter (which is client-only, duck-typed against
 * @elizaos/core). These match the shape defined in the adapter's types.ts.
 */
interface CastTaskRequest {
	prompt: string;
	agents?: string[];
	consensus?: "majority" | "any" | "all";
	maxTokens?: number;
}

interface CastTaskResult {
	requestId: string;
	answer: { text: string; agentId: string } | undefined;
	results: Array<{ agentId: string; text: string }>;
	consensusAt: number;
}

interface ReputationSnapshot {
	peerId: string;
	score: number;
	signals: number;
	variance: number;
	asOf: number;
}

interface ElizaCreditLedgerEntry {
	amount: bigint;
	reason: string;
	idempotencyKey: string;
	metadata: Record<string, unknown> | null;
}

interface HeartbeatEnvelope {
	v: 1;
	peerId: string;
	nonce: number;
	ts: number;
	characterName?: string;
	tags?: string[];
}


declare module "fastify" {
	interface FastifyInstance {
		rpcReputation: PeerReputationRegistry;
	}
}

interface JsonRpcRequest {
	jsonrpc: string;
	id: string | number | null;
	method: string;
	params?: Record<string, unknown>;
}

interface JsonRpcResponse {
	jsonrpc: "2.0";
	id: string | number | null;
	result?: unknown;
	error?: { code: number; message: string };
}

const reputationRegistry = new PeerReputationRegistry();

function makeOk(id: string | number | null, result: unknown): JsonRpcResponse {
	return { jsonrpc: "2.0", id, result };
}

function makeError(id: string | number | null, code: number, message: string): JsonRpcResponse {
	return { jsonrpc: "2.0", id, error: { code, message } };
}

export async function elizaosRpcRoutes(app: FastifyInstance) {
	app.decorate("rpcReputation", reputationRegistry);

	app.post("/rpc/:method", async (request: FastifyRequest, reply) => {
		const { method } = request.params as { method: string };
		const body = (await request.body) as JsonRpcRequest | undefined;

		if (!body || typeof body.jsonrpc !== "string" || body.jsonrpc !== "2.0") {
			return reply.status(400).send(
				makeError(body?.id ?? null, -32700, "Parse error: invalid JSON-RPC 2.0 envelope"),
			);
		}

		if (typeof body.method !== "string" || body.method !== method) {
			return reply.status(400).send(
				makeError(body.id, -32600, "Method mismatch: body.method and URL must match"),
			);
		}

		const id = body.id;
		const params = body.params ?? {};

		const handler = RPC_HANDLERS[method];
		if (!handler) {
			return reply.status(404).send(makeError(id, -32601, `Method not found: ${method}`));
		}

		try {
			const result = await handler(params, app);
			return reply.status(200).send(makeOk(id, result));
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			request.log.error({ err, method }, "RPC handler failed");
			return reply.status(500).send(makeError(id, -32000, message));
		}
	});
}

interface RpcHandler {
	(params: Record<string, unknown>, app: FastifyInstance): Promise<unknown>;
}

const RPC_HANDLERS: Record<string, RpcHandler> = {
	"cast.run": async (params) => {
		const req = params as unknown as CastTaskRequest;
		if (!req.prompt || typeof req.prompt !== "string") {
			throw new Error("invalid params: prompt is required");
		}
		const agentIds = req.agents ?? ["default-agent"];
		const agentResults = agentIds.map((agentId) => ({
			agentId,
			output: `[${agentId}] processed: ${req.prompt.slice(0, 100)}`,
			confidence: 0.8,
		}));

		const result = await agentCast.cast(req.prompt, agentResults, {
			strategy: req.consensus === "all" ? "ensemble" : "judge",
		});

		const castResult: CastTaskResult = {
			requestId: (params.requestId as string) ?? crypto.randomUUID(),
			answer: {
				text: result.finalAnswer,
				agentId: result.selectedAgents[0] ?? agentIds[0] ?? "unknown",
			},
			results: agentResults.map((r) => ({ agentId: r.agentId, text: r.output })),
			consensusAt: Date.now(),
		};
		return castResult;
	},

	"reputation.get": async (params, app) => {
		const peerId = params.peerId as string | undefined;
		if (!peerId || typeof peerId !== "string") {
			throw new Error("invalid params: peerId is required");
		}
		const registry = app.rpcReputation;
		const rep = registry.reputationFor("*", peerId);
		const snapshot: ReputationSnapshot = rep
			? {
					peerId: rep.peerId,
					score: rep.score,
					signals: 0,
					variance: rep.variance,
					asOf: rep.updatedAt,
				}
			: { peerId, score: 0.5, signals: 0, variance: 1, asOf: Date.now() };
		return snapshot;
	},

	"credits.record": async (params) => {
		const entry = params as Omit<ElizaCreditLedgerEntry, "id" | "createdAt">;
		const amount = typeof entry.amount === "string" ? BigInt(entry.amount) : BigInt(entry.amount);
		const userId = `peer:${entry.idempotencyKey}`;

		if (amount >= 0n) {
			await grantCredits(prisma, {
				userId,
				amount,
				reason: entry.reason as never,
				idempotencyKey: entry.idempotencyKey,
			});
		} else {
			await spendCredits(prisma, {
				userId,
				amount: -amount,
				reason: entry.reason as never,
				idempotencyKey: entry.idempotencyKey,
			});
		}

		const balance = await getCreditBalance(prisma, userId);
		return {
			id: entry.idempotencyKey,
			userId,
			amount: amount.toString(),
			reason: entry.reason,
			idempotencyKey: entry.idempotencyKey,
			metadata: entry.metadata,
			createdAt: new Date(),
			balance: balance.toString(),
		};
	},

	"pulse.broadcast": async (params, app) => {
		const env = params.envelope as HeartbeatEnvelope | undefined;
		if (!env || !env.peerId) {
			throw new Error("invalid params: envelope.peerId is required");
		}
		const msg: PulseMessage = {
			v: 1,
			kind: "presence",
			fromPeerId: env.peerId,
			ts: env.ts,
			payload: { v: env.v, characterName: env.characterName, tags: env.tags },
		};
		app.pulseBridge.broadcast(msg);
		return { ok: true };
	},
};
