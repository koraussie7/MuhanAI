import type { IAgentRuntime } from "@elizaos/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setClientForCharacter } from "../runtime.js";
import { AgentMeshHeartbeatService } from "./heartbeat.js";

function runtime(): IAgentRuntime {
	return {
		agentId: "agent-1",
		character: { name: "trader-bot" },
		getSetting: () => "",
		getService: () => undefined,
	};
}

describe("AgentMeshHeartbeatService", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("emits a heartbeat envelope on every interval", async () => {
		const rt = runtime();
		const broadcasts: unknown[] = [];
		setClientForCharacter(rt, {
			client: {
				castTask: async () => {
					throw new Error("unused");
				},
				getReputation: async () => {
					throw new Error("unused");
				},
				recordCredit: async () => {
					throw new Error("unused");
				},
				broadcastHeartbeat: async (env) => {
					broadcasts.push(env);
				},
			},
			peerId: "p1",
		});
		const svc = new AgentMeshHeartbeatService(rt, { intervalMs: 1_000, tags: ["consensus"] });
		await svc.initialize(rt);
		await vi.advanceTimersByTimeAsync(3_500);
		await svc.stop();
		expect(broadcasts.length).toBeGreaterThanOrEqual(3);
		const first = broadcasts[0] as {
			peerId: string;
			nonce: number;
			characterName?: string;
			tags?: string[];
		};
		expect(first.peerId).toBe("p1");
		expect(first.nonce).toBe(1);
		expect(first.characterName).toBe("trader-bot");
		expect(first.tags).toEqual(["consensus"]);
	});

	it("swallows RPC failures without throwing", async () => {
		const rt = runtime();
		setClientForCharacter(rt, {
			client: {
				castTask: async () => {
					throw new Error("unused");
				},
				getReputation: async () => {
					throw new Error("unused");
				},
				recordCredit: async () => {
					throw new Error("unused");
				},
				broadcastHeartbeat: async () => {
					throw new Error("mesh down");
				},
			},
			peerId: "p1",
		});
		const svc = new AgentMeshHeartbeatService(rt, { intervalMs: 500 });
		await svc.initialize(rt);
		await vi.advanceTimersByTimeAsync(2_000);
		await svc.stop();
	});
});
