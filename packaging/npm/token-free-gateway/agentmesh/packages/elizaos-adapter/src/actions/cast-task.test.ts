import type { IAgentRuntime, Memory } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import { setClientForCharacter } from "../runtime.js";
import type { CastTaskResult } from "../types.js";
import { AGENTMESH_CAST_TASK } from "./cast-task.js";

function runtime(): IAgentRuntime {
	return {
		agentId: "agent-1",
		character: { name: "trader-bot" },
		getSetting: () => "",
		getService: () => undefined,
	};
}

const message = (text: string): Memory => ({
	entityId: "u1",
	roomId: "r1",
	content: { text },
});

const okResult: CastTaskResult = {
	requestId: "req-1",
	answer: { text: "consensus answer", agentId: "a1" },
	results: [
		{ agentId: "a1", text: "consensus answer" },
		{ agentId: "a2", text: "alt answer" },
	],
	consensusAt: 1,
};

describe("AGENTMESH_CAST_TASK", () => {
	it("rejects prompts without a trigger keyword", async () => {
		expect(await AGENTMESH_CAST_TASK.validate(runtime(), message("What's the weather?"))).toBe(
			false,
		);
	});

	it("accepts prompts containing cast/consensus/mesh keywords", async () => {
		const rt = runtime();
		expect(await AGENTMESH_CAST_TASK.validate(rt, message("Cast: what's NYDFS?"))).toBe(true);
		expect(await AGENTMESH_CAST_TASK.validate(rt, message("ask the mesh about USDC"))).toBe(true);
		expect(await AGENTMESH_CAST_TASK.validate(rt, message("consensus needed"))).toBe(true);
	});

	it("dispatches via RPC and writes the answer through callback", async () => {
		const rt = runtime();
		const castTask = vi.fn(async () => okResult);
		setClientForCharacter(rt, {
			client: {
				castTask: castTask as never,
				getReputation: async () => {
					throw new Error("unused");
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
		const cb = vi.fn(async () => undefined);
		const handled = await AGENTMESH_CAST_TASK.handler(
			rt,
			message("Cast: what's NYDFS?"),
			undefined,
			undefined,
			cb,
		);
		expect(handled).toBe(true);
		expect(castTask).toHaveBeenCalledOnce();
		expect(cb).toHaveBeenCalledOnce();
		const cbArg = (cb.mock.calls[0] as unknown[] | undefined)?.[0] as { text: string } | undefined;
		expect(cbArg?.text).toContain("consensus answer");
		expect(cbArg?.text).toContain("2 votes");
	});
});
