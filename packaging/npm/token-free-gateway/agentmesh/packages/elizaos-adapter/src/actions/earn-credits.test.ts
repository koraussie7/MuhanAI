import type { IAgentRuntime, Memory } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import { setClientForCharacter } from "../runtime.js";
import type { CreditLedgerEntry } from "../types.js";
import { AGENTMESH_EARN_CREDITS } from "./earn-credits.js";

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

const ledger = (overrides: Partial<CreditLedgerEntry> = {}): CreditLedgerEntry => ({
	id: "ledger-1",
	amount: 250n,
	reason: "contribution",
	idempotencyKey: "k",
	metadata: null,
	createdAt: new Date(0),
	...overrides,
});

describe("AGENTMESH_EARN_CREDITS", () => {
	it("validates leading earn/grant/+ trigger phrases", async () => {
		const rt = runtime();
		expect(await AGENTMESH_EARN_CREDITS.validate(rt, message("earn 100"))).toBe(true);
		expect(await AGENTMESH_EARN_CREDITS.validate(rt, message("grant 50 contribution"))).toBe(true);
		expect(await AGENTMESH_EARN_CREDITS.validate(rt, message("+100 for helping"))).toBe(true);
		expect(await AGENTMESH_EARN_CREDITS.validate(rt, message("hi there"))).toBe(false);
	});

	it("parses amount and reason out of the message body", async () => {
		const rt = runtime();
		const recordCredit = vi.fn(async (e: Omit<CreditLedgerEntry, "id" | "createdAt">) =>
			ledger({
				amount: BigInt(e.amount),
				reason: e.reason,
				idempotencyKey: e.idempotencyKey,
				metadata: e.metadata,
			}),
		);
		setClientForCharacter(rt, {
			client: {
				castTask: async () => {
					throw new Error("unused");
				},
				getReputation: async () => {
					throw new Error("unused");
				},
				recordCredit: recordCredit as never,
				broadcastHeartbeat: async () => {
					throw new Error("unused");
				},
			},
			peerId: "p1",
		});
		const cb = vi.fn(async () => undefined);
		const handled = await AGENTMESH_EARN_CREDITS.handler(
			rt,
			message("earn 250 for helping sora"),
			undefined,
			undefined,
			cb,
		);
		expect(handled).toBe(true);
		expect(recordCredit).toHaveBeenCalledOnce();
		const cbArg = (cb.mock.calls[0] as unknown[] | undefined)?.[0] as { text: string } | undefined;
		expect(cbArg?.text).toContain("+250");
	});

	it("rejects malformed input gracefully", async () => {
		const rt = runtime();
		const cb = vi.fn(async () => undefined);
		const handled = await AGENTMESH_EARN_CREDITS.handler(
			rt,
			message("earn nothing"),
			undefined,
			undefined,
			cb,
		);
		expect(handled).toBe(false);
		expect(cb).toHaveBeenCalledOnce();
		const cbArg = (cb.mock.calls[0] as unknown[] | undefined)?.[0] as { text: string } | undefined;
		expect(cbArg?.text).toContain("syntax");
	});
});
