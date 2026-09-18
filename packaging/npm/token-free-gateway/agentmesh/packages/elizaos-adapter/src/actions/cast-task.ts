/**
 * AGENTMESH_CAST_TASK action.
 *
 * Lifts a free-form user prompt and dispatches it as a Cast task into
 * the MuhanAI mesh, returning the consensus answer to elizaOS via the
 * default handler callback. `validate` is permissive by design — if the
 * caller invoked the action, we trust it; reputation gating happens in
 * the model layer using the REPUTATION provider context.
 */
import type { Action, HandlerCallback, IAgentRuntime, Memory } from "@elizaos/core";
import { AgentMeshRpcError } from "../rpc.js";
import { getClient } from "../runtime.js";
import type { CastTaskRequest } from "../types.js";

const CASTS_TRIGGER_KEYWORDS = ["cast", "consensus", "ask the mesh", "ask the swarm"];

export const AGENTMESH_CAST_TASK: Action = {
	name: "AGENTMESH_CAST_TASK",
	description:
		"Dispatch a free-form prompt to the MuhanAI mesh Cast protocol and return the consensus answer.",
	examples: [
		[
			{
				user: "operator",
				content: { text: "Cast: which regulatory body oversees USDC issuers?" },
			},
			{
				user: "trader-bot",
				content: {
					text: "[agentmesh] Cast consensus: NYDFS and state-level regulators; OCC for trust banks.",
				},
			},
		],
	],
	async validate(_runtime: IAgentRuntime, message: Memory): Promise<boolean> {
		const text = message.content.text.toLowerCase();
		return CASTS_TRIGGER_KEYWORDS.some((kw) => text.includes(kw));
	},
	async handler(
		runtime: IAgentRuntime,
		message: Memory,
		_state,
		options,
		callback,
	): Promise<boolean> {
		const prompt = (options?.prompt as string | undefined) ?? extractPrompt(message);
		if (!prompt.trim()) return false;
		try {
			const { client } = getClient(runtime);
			const req: CastTaskRequest = {
				prompt,
				...(Array.isArray(options?.agents) ? { agents: options.agents as string[] } : {}),
				...(typeof options?.consensus === "string"
					? { consensus: options.consensus as CastTaskRequest["consensus"] }
					: {}),
			};
			const result = await client.castTask(req);
			const text = result.answer
				? `[agentmesh] Cast consensus (${result.results.length} votes): ${result.answer.text}`
				: "[agentmesh] Cast produced no consensus.";
			respond(callback, text);
			return true;
		} catch (e) {
			const reason = e instanceof AgentMeshRpcError ? `${e.code}: ${e.message}` : String(e);
			respond(callback, `[agentmesh] Cast failed — ${reason}`);
			return false;
		}
	},
};

function extractPrompt(message: Memory): string {
	const t = message.content.text.trim();
	const m = t.match(/(?:^|\s)(?:cast|consensus|ask the (?:mesh|swarm))[:\s-]+(.+)/i);
	return m ? (m[1] ?? t) : t;
}

function respond(callback: HandlerCallback | undefined, text: string): void {
	if (!callback) return;
	void callback({ text, source: "agentmesh-cast" });
}
