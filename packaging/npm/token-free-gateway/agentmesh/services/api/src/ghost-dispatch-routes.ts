/**
 * Ghost task-dispatch routes.
 *
 * Everything here sits on top of the security primitives in
 * `@agentmesh/ghost-adapter`:
 *
 * - node→server URLs are only ever fetched through the SSRF-guarded policy
 *   built by `ghostFetchPolicy` (probe verification + task dispatch);
 * - capabilities are earned by marker probes, never trusted from the
 *   self-declared Agent Card;
 * - `desktop_automation` additionally needs an operator grant (approval);
 * - every dispatch carries a fresh single-use task ID and feeds outcomes
 *   into the subject-scoped `PeerReputationRegistry` (`ghost:<capability>`).
 *
 * Auth mirrors the registration route: `x-ghost-token` for node-owned
 * endpoints (probe answers), `x-api-key` for operator endpoints
 * (challenges, dispatches, approvals, status).
 */
import {
	assertFetchableUrl,
	assertPublicHost,
	createApprovalStore,
	createCapabilityVerifier,
	createTaskLedger,
	runGhostDispatch,
	type GhostReputationSink,
} from "@agentmesh/ghost-adapter";
import type { FastifyInstance } from "fastify";
import { PeerReputationRegistry } from "@agentmesh/peer-mesh";
import { ghostFetchPolicy, ghostRegistry, registrationAuthorized } from "./ghost-routes.js";

export const ghostReputation = new PeerReputationRegistry();
export const ghostTaskLedger = createTaskLedger();
export const ghostCapabilityVerifier = createCapabilityVerifier();
export const ghostApprovals = createApprovalStore();

const reputationSink: GhostReputationSink = {
	update(subject, signal) {
		return ghostReputation.update(subject, signal);
	},
};

/** Server→node POST under the same SSRF rules as Agent Card discovery. */
async function postToNode(url: string, body: unknown): Promise<unknown> {
	const target = assertFetchableUrl(url, ghostFetchPolicy().allowlist);
	await assertPublicHost(target.hostname);
	const response = await fetch(target.toString(), {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(10_000),
	});
	if (!response.ok) {
		throw new Error(`node responded ${response.status}`);
	}
	return response.json();
}

function findNode(nodeId: string) {
	return ghostRegistry.list().find((node) => node.nodeId === nodeId);
}

export async function ghostDispatchRoutes(app: FastifyInstance) {
	// -- Node-owned endpoint (same auth as registration) ----------------------

	/** Answer a capability probe: marker must come back through the response. */
	app.post("/api/ghost/nodes/:nodeId/verify", async (request, reply) => {
		if (!registrationAuthorized(request.headers as Record<string, unknown>)) {
			return reply.code(401).send({ error: "ghost_registration_unauthorized" });
		}
		const { nodeId } = request.params as { nodeId: string };
		const { probeId, response } = (request.body ?? {}) as {
			probeId?: string;
			response?: unknown;
		};
		if (typeof probeId !== "string" || !probeId) {
			return reply.code(400).send({ error: "probeId is required" });
		}
		const result = ghostCapabilityVerifier.verifyFromResponse(probeId, response);
		const reputation = result.verified
			? ghostReputation.update(`ghost:${result.challenge?.capability ?? "unknown"}`, {
					peerId: nodeId,
					positive: true,
					timestamp: Date.now(),
				})
			: undefined;
		return reply.code(result.verified ? 200 : 403).send({
			verified: result.verified,
			reason: result.reason,
			capability: result.challenge?.capability,
			reputation,
		});
	});

	// -- Operator endpoints (x-api-key via the global hook) -------------------

	/** Issue a marker challenge for a (nodeId, capability) pair. */
	app.post("/api/ghost/nodes/:nodeId/challenge", async (request, reply) => {
		const { nodeId } = request.params as { nodeId: string };
		const { capability } = (request.body ?? {}) as { capability?: string };
		const node = findNode(nodeId);
		if (!node) return reply.code(404).send({ error: "node_not_registered" });
		if (!node.card.capabilities.includes(capability as never)) {
			return reply.code(400).send({
				error: "capability_not_claimed",
				claimed: node.card.capabilities,
			});
		}
		return ghostCapabilityVerifier.challengeFor(nodeId, capability as never);
	});

	/** Dispatch a task through all gates (claims → verification → approval → ID). */
	app.post("/api/ghost/nodes/:nodeId/tasks", async (request, reply) => {
		const { nodeId } = request.params as { nodeId: string };
		const { capability, payload } = (request.body ?? {}) as {
			capability?: string;
			payload?: unknown;
		};
		const node = findNode(nodeId);
		if (!node) return reply.code(404).send({ error: "node_not_registered" });
		if (typeof capability !== "string") {
			return reply.code(400).send({ error: "capability is required" });
		}
		const result = await runGhostDispatch(
			{
				nodeId,
				nodeUrl: node.card.url,
				capability: capability as never,
				payload,
				claimedCapabilities: node.card.capabilities,
			},
			{
				ledger: ghostTaskLedger,
				verifier: ghostCapabilityVerifier,
				approvals: ghostApprovals,
				reputation: reputationSink,
				transport: postToNode,
			},
		);
		if (result.ok) return reply.code(200).send(result);
		const stageStatus: Record<string, number> = {
			claimed: 400,
			verified: 403,
			approval: 403,
			replay: 409,
			transport: 502,
		};
		return reply.code(stageStatus[result.stage] ?? 500).send(result);
	});

	/** Operator grants a write/execute capability (currently only desktop_automation). */
	app.post("/api/ghost/approvals", async (request, reply) => {
		const { nodeId, capability, grantedBy, ttlMs } = (request.body ?? {}) as {
			nodeId?: string;
			capability?: string;
			grantedBy?: string;
			ttlMs?: number;
		};
		if (!nodeId || !capability || !grantedBy) {
			return reply.code(400).send({ error: "nodeId, capability, grantedBy are required" });
		}
		if (!findNode(nodeId)) return reply.code(404).send({ error: "node_not_registered" });
		const isWriteCap = capability === "desktop_automation";
		if (!isWriteCap) {
			return reply.code(400).send({
				error: "no_approval_needed",
				message: `capability ${capability} does not require an approval`,
			});
		}
		try {
			const approval = ghostApprovals.grant(nodeId, capability as never, { grantedBy, ttlMs });
			return reply.code(201).send(approval);
		} catch (err) {
			return reply.code(400).send({ error: (err as Error).message });
		}
	});

	/** Status for a registered node: claims vs verification vs current approvals. */
	app.get("/api/ghost/nodes/:nodeId/status", async (request, reply) => {
		const { nodeId } = request.params as { nodeId: string };
		const node = findNode(nodeId);
		if (!node) return reply.code(404).send({ error: "node_not_registered" });
		const now = Date.now();
		return reply.send({
			nodeId,
			claimedCapabilities: node.card.capabilities,
			verifiedCapabilities: ghostCapabilityVerifier.verifiedCapabilities(nodeId, now),
			approvals: ghostApprovals.list(nodeId).map((a) => ({
				capability: a.capability,
				grantedBy: a.grantedBy,
				expiresAt: a.expiresAt,
			})),
			reputation: ghostReputation.reputationFor("ghost:*", nodeId),
		});
	});
}
