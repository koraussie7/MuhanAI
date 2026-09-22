import { createAppLogger, defineAction } from "@rome-os/app-runtime";
import type {
	Action,
	ActionConfig,
	ActionResult,
	AppActionRuntimeDeps,
} from "@rome-os/app-runtime";
import { z } from "@rome-os/app-runtime";
import { gatewayHealth, resolveGatewayUrl } from "../../lib/gateway.js";

const log = createAppLogger("agentmesh-bridge:status");

const statusInputSchema = z.object({});

/** `agentmesh-bridge:status` — liveness probe of the agentmesh gateway. */
export function createAction(config: ActionConfig, _runtime: AppActionRuntimeDeps): Action {
	return defineAction({
		config,
		schema: statusInputSchema,
		execute: async () => {
			const base = resolveGatewayUrl(process.env as Record<string, string | undefined>);
			log.info("status probe", { gateway: base });
			const health = await gatewayHealth({
				env: process.env as Record<string, string | undefined>,
			});
			if (health.ok) {
				return {
					status: "ok",
					data: { gateway: base, online: true },
				} satisfies ActionResult;
			}
			return {
				status: "error",
				error: health.error ?? "gateway unreachable",
			} satisfies ActionResult;
		},
	});
}
