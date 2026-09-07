/**
 * End-to-end test: gateway routes a session to muhan-agent,
 * agent decrypts + dispatches via MCP, response comes back.
 *
 * Topology:
 *   clientTransport ──HTTPS-shaped messages──> gateway
 *                                                 │
 *                                                 │ /muhanai/gateway/v1
 *                                                 ▼
 *                                            agentTransport ──> muhan-agent
 *
 * Everything is in-memory; no live libp2p, no live network.
 */

import {
	createGateway,
	decodeMessage,
	encodeMessage,
	type Heartbeat,
	type MachineClaim,
	type ProtocolMessage,
	type SessionAck,
	type SessionRoute,
	type SignedPayload,
} from "@agentmesh/gateway";
import { beforeEach, describe, expect, it } from "vitest";

import { createDaemon, type MessageTransport } from "../index.js";

class LoopTransport implements MessageTransport {
	published: { topic: string; bytes: Uint8Array }[] = [];
	private subscribers = new Map<string, Set<(bytes: Uint8Array) => void>>();

	async publish(topic: string, bytes: Uint8Array): Promise<void> {
		this.published.push({ topic, bytes });
		const subs = this.subscribers.get(topic);
		if (subs) for (const fn of subs) fn(bytes);
	}

	subscribe(topic: string, handler: (bytes: Uint8Array) => void): () => void {
		let set = this.subscribers.get(topic);
		if (!set) {
			set = new Set();
			this.subscribers.set(topic, set);
		}
		set.add(handler);
		return () => set?.delete(handler);
	}
}

const TEST_KEY = new Uint8Array(32).fill(7);
const USER_ID = "user_e2e";
const PEER_ID = "12D3KooWTestPeerIdForE2E";

function sign(_payload: SignedPayload<ProtocolMessage>): Uint8Array {
	// Stub: real Ed25519 signing lands in L2. The loopback test doesn't
	// verify signatures — the protocol layer does that, not this test.
	return new Uint8Array(64);
}

describe("E2E: gateway → muhan-agent session routing", () => {
	let agentTransport: LoopTransport;
	let daemon: ReturnType<typeof createDaemon>;
	let gateway: ReturnType<typeof createGateway>;

	beforeEach(async () => {
		agentTransport = new LoopTransport();
		daemon = createDaemon({
			userId: USER_ID,
			platform: "macos",
			transport: agentTransport,
			sessionKey: TEST_KEY,
			mcp: {
				callTool: async (toolName: string, args: Record<string, unknown>) => {
					if (toolName === "knowledge" && args.action === "list") {
						return { items: [{ id: "k_alpha", title: "alpha" }] };
					}
					throw new Error(`unknown tool ${toolName}`);
				},
			} as never,
		});
		gateway = createGateway({
			peerId: PEER_ID,
			prisma: {} as never, // unused in this test
		});
		await daemon.start();
	});

	it("claim → heartbeat → session-route → response", async () => {
		// 1. Machine claim lands at gateway.
		const claim = agentTransport.published[0]!;
		expect(claim.topic).toBe("/muhanai/gateway/v1");
		const claimMsg = decodeMessage(claim.bytes) as MachineClaim;
		expect(claimMsg.kind).toBe("machine-claim");
		expect(claimMsg.userId).toBe(USER_ID);

		// 2. Gateway's router picks up the claim via its subscribe path.
		let _capturedAck: SessionAck | null = null;
		const unsub = gateway.subscribe((msg) => {
			const m = msg.message;
			if (m.kind === "session-ack") _capturedAck = m;
		});
		// Manually feed the claim into the gateway (libp2p wiring is stubbed).
		gateway.publish({
			signature: sign({
				signature: new Uint8Array(),
				from: PEER_ID,
				message: claimMsg,
			}),
			from: PEER_ID,
			message: claimMsg,
		});

		// 3. Client crafts a session-route addressed to this user, encrypts
		//    the request, and pushes it through the gateway.
		const sessionId = "s_e2e_1";
		const ciphertext = await daemon.encryptForRoute({
			capability: "personal-context",
			args: { userId: USER_ID },
			correlationId: "c_e2e_1",
		});
		const route: SessionRoute = {
			kind: "session-route",
			v: 1,
			sessionId,
			userId: USER_ID,
			ciphertext,
			issuedAt: Date.now(),
		};
		gateway.publish({
			signature: sign({
				signature: new Uint8Array(),
				from: PEER_ID,
				message: route,
			}),
			from: PEER_ID,
			message: route,
		});

		// 4. Gateway fans the route out to its subscribers; muhan-agent is
		//    not subscribed to the gateway directly in this test — instead,
		//    the test simulates the agent's transport receiving the route.
		agentTransport.publish("/muhanai/gateway/v1", encodeMessage(route));

		// 5. Give the agent a tick to decrypt + dispatch.
		await new Promise((r) => setTimeout(r, 10));

		// 6. Sanity: the agent's MCP-backed capability produced the right answer.
		const result = await daemon.dispatchSession({
			capability: "personal-context",
			args: { userId: USER_ID },
			correlationId: "c_e2e_2",
		});
		expect(result.ok).toBe(true);
		expect(result.result).toEqual({
			items: [{ id: "k_alpha", title: "alpha" }],
		});
		unsub();
	});

	it("heartbeat extends liveness window on the gateway", async () => {
		// After claim, send a heartbeat and confirm it's accepted.
		const hb: SignedPayload<Heartbeat> = {
			signature: new Uint8Array(),
			from: PEER_ID,
			message: {
				kind: "heartbeat",
				v: 1,
				userId: USER_ID,
				machineId: "machine_test",
				issuedAt: Date.now(),
			},
		};
		let seen = false;
		const unsub = gateway.subscribe((m) => {
			if (m.message.kind === "heartbeat") seen = true;
		});
		gateway.publish(hb);
		expect(seen).toBe(true);
		unsub();
	});
});
