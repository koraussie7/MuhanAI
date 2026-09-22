import { createAppLogger, defineAction } from "@rome-os/app-runtime";
import type {
	Action,
	ActionConfig,
	ActionResult,
	AppActionRuntimeDeps,
} from "@rome-os/app-runtime";
import { z } from "@rome-os/app-runtime";
import { routeQuestion } from "../../lib/gateway.js";

const log = createAppLogger("agentmesh-bridge:route");

const routeInputSchema = z.object({
	userId: z.string().trim().min(1).describe("AgentMesh user id charged for the route"),
	question: z.string().trim().min(1).max(8192).describe("Question to route through the mesh"),
});

/**
 * `agentmesh-bridge:route` — runs the full agentmesh routing pipeline
 * (category → agents → cast → credit receipt) and returns its result.
 */
export function createAction(config: ActionConfig, _runtime: AppActionRuntimeDeps): Action {
	return defineAction({
		config,
		schema: routeInputSchema,
		execute: async ({ userId, question }) => {
			log.info("route invoked", { userId, questionLength: question.length });
			const result = await routeQuestion(
				{ userId, question },
				{ env: process.env as Record<string, string | undefined> },
			);
			if (!result.ok || !result.data) {
				return {
					status: "error",
					error: result.error ?? "AgentMesh gateway returned no data",
				} satisfies ActionResult;
			}
			return {
				status: "ok",
				data: {
					category: result.data.category,
					cast: result.data.cast,
					knowledgeUsed: result.data.knowledgeUsed ?? null,
					runIds: result.data.runIds ?? [],
					credits: result.data.credits ?? null,
				},
			} satisfies ActionResult;
		},
	});
}
