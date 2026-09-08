/**
 * Computer-use HTTP route — `/api/computer-use/run`.
 *
 * Wraps the `@agentmesh/muhan-agent` computer-use router over Fastify.
 * Body carries the BYOK vision provider key, the goal, and optional
 * model/step overrides. The server owns the e2b Desktop sandbox so
 * the user's browser stays thin (it just sends goals + receives
 * step results).
 *
 * Streaming step events land in a follow-up route (`/api/computer-use/
 * stream/:sessionId`) once the underlying SessionRunner supports it.
 * Phase 1 ships the request/response form first.
 */

import {
	buildComputerUseRunHandler,
	COMPUTER_USE_RUN_CAPABILITY,
	E2bBrowserAdapter,
} from "@agentmesh/muhan-agent";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { clientError, formatZodError } from "./error-shapes.js";

const RunSchema = z.object({
	goal: z.string().min(1).max(2048),
	provider: z.enum(["openai", "google", "groq", "openrouter"]),
	apiKey: z.string().min(1).max(512),
	planModel: z.string().max(128).optional(),
	locateModel: z.string().max(128).optional(),
	maxSteps: z.number().int().min(1).max(100).optional(),
	viewport: z
		.object({
			width: z.number().int().min(320).max(7680),
			height: z.number().int().min(240).max(4320),
		})
		.optional(),
});

/**
 * One adapter per server process is fine for Phase 1 — it serializes
 * step requests so we don't accidentally spawn many sandboxes. If we
 * later want concurrent sessions, this becomes a session map keyed by
 * sessionId.
 */
let sharedAdapter: E2bBrowserAdapter | undefined;

async function getAdapter(): Promise<E2bBrowserAdapter> {
	if (!sharedAdapter) {
		sharedAdapter = new E2bBrowserAdapter({
			apiKey: process.env.E2B_API_KEY,
			template: process.env.E2B_DESKTOP_TEMPLATE ?? "desktop",
			viewport: { width: 1280, height: 720 },
		});
	}
	return sharedAdapter;
}

export async function computerUseRoutes(app: FastifyInstance) {
	app.post("/api/computer-use/run", async (request, reply) => {
		const parse = RunSchema.safeParse(request.body);
		if (!parse.success) {
			return clientError(reply, 400, formatZodError(parse.error), request.id);
		}

		if (!process.env.E2B_API_KEY) {
			return clientError(
				reply,
				503,
				"E2B_API_KEY is not configured on the server. Set it in the API environment to use Computer Use.",
				request.id,
			);
		}

		try {
			const adapter = await getAdapter();
			const handler = buildComputerUseRunHandler({ adapter });
			const res = await handler({
				capability: COMPUTER_USE_RUN_CAPABILITY,
				correlationId: request.id,
				args: parse.data,
			});
			if (!res.ok) {
				return clientError(reply, 502, res.error ?? "computer-use.run failed", request.id);
			}
			return res.result;
		} catch (err) {
			request.log.error({ err }, "computer-use.run handler crashed");
			const reason = err instanceof Error ? err.message : String(err);
			return clientError(reply, 500, `computer-use.run crashed: ${reason}`, request.id);
		}
	});
}
