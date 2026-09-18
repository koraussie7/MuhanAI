/**
 * AGENTMESH_EARN_CREDITS action.
 *
 * Records a positive credit ledger entry against the local character for
 * a verified contribution (a Cast result accepted by the user, a peer
 * upvote, a referral, etc.). The numeric `amount` and an idempotency
 * key are required and are supplied either via `options` or pulled from
 * the message body (`earn <amount> <reason>`). Duplicate idempotency
 * keys are a no-op server-side, so this is safe to retry.
 */
import type { Action, HandlerCallback, IAgentRuntime, Memory } from "@elizaos/core";
import { AgentMeshRpcError } from "../rpc.js";
import { getClient } from "../runtime.js";

const REASONS = ["welcome_bonus", "purchase", "contribution", "referral", "admin_adjustment"];

export const AGENTMESH_EARN_CREDITS: Action = {
	name: "AGENTMESH_EARN_CREDITS",
	description:
		"Record a positive credit ledger entry for this character against the MuhanAI mesh ledger.",
	examples: [
		[
			{
				user: "operator",
				content: { text: "earn 250 for contribution: helped Sora debug inference" },
			},
			{
				user: "trader-bot",
				content: { text: "[agentmesh] Credit +250 recorded (ledger id=cd_8h2…)." },
			},
		],
	],
	async validate(_runtime: IAgentRuntime, message: Memory): Promise<boolean> {
		const text = message.content.text.toLowerCase();
		return /^(?:earn|grant|\+)\s*\d+/.test(text);
	},
	async handler(
		runtime: IAgentRuntime,
		message: Memory,
		_state,
		options,
		callback,
	): Promise<boolean> {
		const parsed = parseCredit(message.content.text, options);
		if (!parsed) {
			respond(callback, "[agentmesh] earn credits: required `earn <amount> [reason]` syntax");
			return false;
		}
		try {
			const { client } = getClient(runtime);
			const entry = await client.recordCredit({
				amount: BigInt(parsed.amount),
				reason: parsed.reason,
				idempotencyKey: parsed.idempotencyKey,
				metadata: parsed.metadata,
			});
			respond(callback, `[agentmesh] Credit +${parsed.amount} recorded (ledger id=${entry.id}).`);
			return true;
		} catch (e) {
			const reason = e instanceof AgentMeshRpcError ? `${e.code}: ${e.message}` : String(e);
			respond(callback, `[agentmesh] credit record failed — ${reason}`);
			return false;
		}
	},
};

interface ParsedCredit {
	amount: number;
	reason: string;
	idempotencyKey: string;
	metadata: Record<string, unknown> | null;
}

function parseCredit(
	text: string,
	options: Record<string, unknown> | undefined,
): ParsedCredit | null {
	if (options && typeof options.amount === "number") {
		return {
			amount: Math.trunc(options.amount),
			reason: typeof options.reason === "string" ? options.reason : "contribution",
			idempotencyKey:
				typeof options.idempotencyKey === "string" ? options.idempotencyKey : `auto:${Date.now()}`,
			metadata: null,
		};
	}
	const m = text.match(/^(?:earn|grant|\+)\s*(\d+)(?:\s+(\w+))?(?:\s+(.+))?/i);
	if (!m) return null;
	const amountRaw = m[1];
	if (!amountRaw) return null;
	const reasonRaw = (m[2] ?? "contribution").toLowerCase();
	const reason = REASONS.includes(reasonRaw) ? reasonRaw : "contribution";
	const note = (m[3] ?? "").trim();
	const amt = Number.parseInt(amountRaw, 10);
	if (!Number.isFinite(amt) || amt <= 0) return null;
	return {
		amount: amt,
		reason,
		idempotencyKey: `text:${amt}:${reason}:${note.slice(0, 80)}`,
		metadata: note ? { note } : null,
	};
}

function respond(callback: HandlerCallback | undefined, text: string): void {
	if (!callback) return;
	void callback({ text, source: "agentmesh-credits" });
}
