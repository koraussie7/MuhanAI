import type { IAgentRuntime, Provider } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import { AgentMeshRpcError } from "../rpc.js";
import { setClientForCharacter } from "../runtime.js";
import type { ReputationSnapshot } from "../types.js";
import { createReputationProvider } from "./reputation.js";

function fakeRuntime(): IAgentRuntime {
	const settings = new Map<string, string>();
	return {
		agentId: "agent-1",
		character: { name: "trader-bot" },
		getSetting: (key) => settings.get(key),
		getService: () => undefined,
	};
}

const snapshot = (): ReputationSnapshot => ({
	peerId: "p1",
	score: 0.842,
	signals: 12,
	variance: 0.0025,
	asOf: 1,
});

describe("createReputationProvider", () => {
	it("renders a fresh snapshot on first call", async () => {
		const rt = fakeRuntime();
		const _fetchImpl = vi.fn(
			async () => new Response(JSON.stringify({ result: snapshot() }), { status: 200 }),
		);
		setClientForCharacter(rt, {
			client: {
				castTask: async () => {
					throw new Error("unused");
				},
				getReputation: async () => snapshot(),
				recordCredit: async () => {
					throw new Error("unused");
				},
				broadcastHeartbeat: async () => {
					throw new Error("unused");
				},
			},
			peerId: "p1",
		});

		const provider: Provider = createReputationProvider();
		const result = await provider.get(rt, {
			entityId: "u1",
			roomId: "r1",
			content: { text: "hi" },
		});
		expect(result.text).toContain("peer p1");
		expect(result.text).toContain("(fresh)");
		expect(result.values?.agentmesh_reputation).toBe(0.842);
	});

	it("does not call RPC twice within cache window", async () => {
		const rt = fakeRuntime();
		let calls = 0;
		setClientForCharacter(rt, {
			client: {
				castTask: async () => {
					throw new Error("unused");
				},
				getReputation: async () => {
					calls++;
					return snapshot();
				},
				recordCredit: async () => {
					throw new Error("unused");
				},
				broadcastHeartbeat: async () => {
					throw new Error("unused");
				},
			},
			peerId: "p1",
		});
		const provider: Provider = createReputationProvider({ cacheMs: 30_000 });
		await provider.get(rt, {
			entityId: "u1",
			roomId: "r1",
			content: { text: "a" },
		});
		const second = await provider.get(rt, {
			entityId: "u1",
			roomId: "r1",
			content: { text: "b" },
		});
		expect(calls).toBe(1);
		expect(second.text).toContain("(cached)");
	});

	it("returns graceful error text when RPC throws", async () => {
		const rt = fakeRuntime();
		setClientForCharacter(rt, {
			client: {
				castTask: async () => {
					throw new Error("unused");
				},
				getReputation: async () => {
					throw new AgentMeshRpcError("CONFIG_MISSING", "no rpc url");
				},
				recordCredit: async () => {
					throw new Error("unused");
				},
				broadcastHeartbeat: async () => {
					throw new Error("unused");
				},
			},
			peerId: "p1",
		});
		const provider: Provider = createReputationProvider();
		const result = await provider.get(rt, {
			entityId: "u1",
			roomId: "r1",
			content: { text: "x" },
		});
		expect(result.text).toContain("reputation unavailable");
		expect(result.text).toContain("CONFIG_MISSING");
	});
});
