import { AgentRegistry } from "@agentmesh/agent";
import type { AgentRequest, AgentResult } from "@agentmesh/core";
import { beforeEach, describe, expect, it } from "vitest";
import { ReceiptLedger } from "./receipt.js";
import { RecursiveCast } from "./recursive.js";

interface AgentLike {
	id: string;
	capabilities?: string[];
}

interface ExecutorLike {
	execute(agentId: string, request: AgentRequest): Promise<AgentResult>;
}

function makeExecutor(
	agents: AgentLike[],
): ExecutorLike {
	const map = new Map(agents.map((a) => [a.id, a]));
	return {
		async execute(agentId: string, request: AgentRequest) {
			const agent = map.get(agentId);
			if (!agent) throw new Error(`Agent not found: ${agentId}`);
			return {
				requestId: request.id,
				agentId,
				answer: `answer-from-${agentId}`,
				confidence: 0.9,
				latencyMs: 5,
				metadata: { modelId: `${agentId}-model` },
			};
		},
	};
}

function makeRegistry(agents: AgentLike[]): AgentRegistry {
	const registry = new AgentRegistry();
	for (const a of agents) {
		registry.register({
			id: a.id,
			type: "llm",
			displayName: a.id,
			capabilities: () => a.capabilities ?? [],
			health: async () => ({ online: true, latency: 0 }),
			execute: async (request: AgentRequest): Promise<AgentResult> => ({
				requestId: request.id,
				agentId: a.id,
				answer: `answer-from-${a.id}`,
				confidence: 0.9,
				latencyMs: 5,
				metadata: { modelId: `${a.id}-model` },
			}),
		});
	}
	return registry;
}

describe("RecursiveCast", () => {
	let executor: ExecutorLike;
	let registry: AgentRegistry;
	let cast: RecursiveCast;

	beforeEach(() => {
		const agents: AgentLike[] = [
			{ id: "agent-a", capabilities: ["summarize"] },
			{ id: "agent-b", capabilities: ["summarize"] },
			{ id: "agent-c", capabilities: ["translate"] },
		];
		executor = makeExecutor(agents);
		registry = makeRegistry(agents);
		cast = new RecursiveCast(
			executor as unknown as import("@agentmesh/agent").AgentExecutor,
			registry,
		);
	});

	it("delegates to a local agent and returns its result", async () => {
		const result = await cast.delegate({
			request: {
				id: "req-1",
				question: "summarize X",
				requiredCapabilities: ["summarize"],
			},
			excludeAgentIds: ["self"],
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(["agent-a", "agent-b"]).toContain(result.result.agentId);
		expect(result.depth).toBe(1);
	});

	it("respects maxDepth and returns depth_exceeded", async () => {
		const result = await cast.delegate({
			request: { id: "req-1", question: "x", requiredCapabilities: ["summarize"] },
			excludeAgentIds: [],
			maxDepth: 1,
		}, ["self", "agent-a"]);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.reason).toBe("depth_exceeded");
	});

	it("returns no_agent_available when nothing matches the capability", async () => {
		const result = await cast.delegate({
			request: { id: "req-1", question: "x", requiredCapabilities: ["nonexistent"] },
			excludeAgentIds: [],
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.reason).toBe("no_agent_available");
	});

	it("enforces budget across recursive calls", async () => {
		const rec = new RecursiveCast(
			executor as unknown as import("@agentmesh/agent").AgentExecutor,
			registry,
		);
		const r1 = await rec.delegate({
			request: { id: "r1", question: "x", requiredCapabilities: ["summarize"] },
			excludeAgentIds: [],
			budget: 1,
		});
		expect(r1.ok).toBe(true);
		const r2 = await rec.delegate({
			request: { id: "r2", question: "y", requiredCapabilities: ["summarize"] },
			excludeAgentIds: [],
			budget: 1,
		});
		expect(r2.ok).toBe(false);
		if (r2.ok) return;
		expect(r2.reason).toBe("budget_exceeded");
	});

	it("routes via peerRouter when configured", async () => {
		const peer = new RecursiveCast(
			executor as unknown as import("@agentmesh/agent").AgentExecutor,
			registry,
			() => ({
				requestId: "peer-1",
				agentId: "remote-agent",
				answer: "from-peer",
				confidence: 0.95,
				latencyMs: 12,
			}),
		);
		const result = await peer.delegate({
			request: { id: "req-1", question: "x" },
			excludeAgentIds: ["self"],
			requiredCapability: "summarize",
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.result.agentId).toBe("remote-agent");
		expect(result.result.answer).toBe("from-peer");
	});

	describe("receipt ledger integration", () => {
		it("appends a receipt for a successful local hop", async () => {
			const ledger = new ReceiptLedger();
			const localCast = new RecursiveCast(
				executor as unknown as import("@agentmesh/agent").AgentExecutor,
				registry,
				undefined,
				undefined,
				{ receiptLedger: ledger, localPeerId: "self-peer" },
			);
			const result = await localCast.delegate({
				request: {
					id: "req-ledger-1",
					question: "summarize X",
					requiredCapabilities: ["summarize"],
				},
				excludeAgentIds: [],
			});
			expect(result.ok).toBe(true);

			const receipts = ledger.query({ requestId: "req-ledger-1" });
			expect(receipts).toHaveLength(1);
			const r = receipts[0]!.receipt;
			expect(r.callerPeerId).toBe("self-peer");
			// Without resolvePeerId the local callee falls back to localPeerId,
			// so both sides are the local peer.
			expect(r.calleePeerId).toBe("self-peer");
			expect(["agent-a", "agent-b"]).toContain(r.calleeAgentId);
			expect(r.modelId).toBe(`${r.calleeAgentId}-model`);
			expect(r.latencyMs).toBe(5);
			expect(r.id).toMatch(/^receipt:(blake3|sha256):[a-f0-9]{64}$/);
		});

		it("records parentReceiptId when delegating with ancestor context", async () => {
			const ledger = new ReceiptLedger();
			const localCast = new RecursiveCast(
				executor as unknown as import("@agentmesh/agent").AgentExecutor,
				registry,
				undefined,
				undefined,
				{ receiptLedger: ledger, localPeerId: "self-peer" },
			);
			const parentRequestId = "req-parent";
			const parentHop = await localCast.delegate({
				request: {
					id: parentRequestId,
					question: "summarize X",
					requiredCapabilities: ["summarize"],
				},
				excludeAgentIds: [],
			});
			expect(parentHop.ok).toBe(true);
			const [parentEntry] = ledger.query({ requestId: parentRequestId });
			expect(parentEntry).toBeDefined();

			// Now re-enter delegate() with the parent agent as an ancestor,
			// simulating a child hop from inside the parent's reasoning.
			const childRequestId = "req-child";
			const childResult = await localCast.delegate(
				{
					request: {
						id: childRequestId,
						question: "follow-up",
						requiredCapabilities: ["summarize"],
					},
					excludeAgentIds: [],
				},
				[parentEntry!.receipt.calleeAgentId as string],
			);
			expect(childResult.ok).toBe(true);

			const [childEntry] = ledger.query({ requestId: childRequestId });
			expect(childEntry).toBeDefined();
			expect(childEntry!.receipt.parentReceiptId).toBe(parentEntry!.receipt.id);
			// callerPeerId becomes the last ancestor, not the local peer.
			expect(childEntry!.receipt.callerPeerId).toBe(parentEntry!.receipt.calleeAgentId);
		});

		it("uses resolvePeerId for the callee peer id", async () => {
			const ledger = new ReceiptLedger();
			const peerMapped = new RecursiveCast(
				executor as unknown as import("@agentmesh/agent").AgentExecutor,
				registry,
				undefined,
				(agentId) => `${agentId}-peer`,
				{ receiptLedger: ledger, localPeerId: "self-peer" },
			);
			const result = await peerMapped.delegate({
				request: {
					id: "req-resolve-peer",
					question: "x",
					requiredCapabilities: ["summarize"],
				},
				excludeAgentIds: [],
			});
			expect(result.ok).toBe(true);

			const [receipt] = ledger.query({ requestId: "req-resolve-peer" });
			expect(receipt).toBeDefined();
			expect(receipt!.receipt.calleePeerId).toBe(`${receipt!.receipt.calleeAgentId}-peer`);
		});

		it("records a receipt for the peer-routed hop when a peerRouter is configured", async () => {
			const ledger = new ReceiptLedger();
			const peer = new RecursiveCast(
				executor as unknown as import("@agentmesh/agent").AgentExecutor,
				registry,
				() => ({
					requestId: "peer-1",
					agentId: "remote-agent",
					answer: "from-peer",
					confidence: 0.95,
					latencyMs: 12,
				}),
				(agentId) => (agentId === "remote-agent" ? "remote-peer" : undefined),
				{
					receiptLedger: ledger,
					localPeerId: "self-peer",
					signer: { sign: (_bytes: Uint8Array) => "test-signature" },
				},
			);
			const result = await peer.delegate({
				request: { id: "req-peer", question: "x" },
				excludeAgentIds: ["self"],
				requiredCapability: "summarize",
			});
			expect(result.ok).toBe(true);

			const [entry] = ledger.query({ requestId: "req-peer" });
			expect(entry).toBeDefined();
			expect(entry!.receipt.calleeAgentId).toBe("remote-agent");
			expect(entry!.receipt.calleePeerId).toBe("remote-peer");
			expect(entry!.receipt.callerPeerId).toBe("self-peer");
			// The peer hop has a parent (the local caller), so the signature
			// chain is non-empty.
			expect(entry!.receipt.signatures.caller).toBe("test-signature");
		});

		it("does not append a receipt when delegation fails", async () => {
			const ledger = new ReceiptLedger();
			const localCast = new RecursiveCast(
				executor as unknown as import("@agentmesh/agent").AgentExecutor,
				registry,
				undefined,
				undefined,
				{ receiptLedger: ledger, localPeerId: "self-peer" },
			);
			const result = await localCast.delegate({
				request: {
					id: "req-fail",
					question: "x",
					requiredCapabilities: ["nonexistent"],
				},
				excludeAgentIds: [],
			});
			expect(result.ok).toBe(false);
			expect(ledger.query({ requestId: "req-fail" })).toHaveLength(0);
		});

		it("exposes the configured ledger via the receiptLedger getter", () => {
			const ledger = new ReceiptLedger();
			const localCast = new RecursiveCast(
				executor as unknown as import("@agentmesh/agent").AgentExecutor,
				registry,
				undefined,
				undefined,
				{ receiptLedger: ledger },
			);
			expect(localCast.receiptLedger).toBe(ledger);
		});
	});
});
