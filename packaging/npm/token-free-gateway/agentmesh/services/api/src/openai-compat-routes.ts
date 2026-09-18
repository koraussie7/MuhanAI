/**
 * OpenAI-compatible /v1 endpoints — drop-in backend for KiloCode / Cline /
 * Open WebUI / Pythia CLI.
 *
 * Every request is served by the Token-Free keyless pool
 * (mesh-llm → omniroute-auto → pollinations), so clients configured with
 * `base_url = https://muhanai.com/v1` get zero-token-cost completions with a
 * plain OpenAI SDK — no key required.
 *
 * Endpoints:
 *   POST /v1/chat/completions  → OpenAI chat completions (stream + non-stream)
 *   GET  /v1/models            → model catalog in OpenAI list shape
 */

import { randomUUID } from "node:crypto";
import {
	callKeylessProviders,
	getKeylessProviderNames,
	type KeylessRequest,
} from "@agentmesh/llm-router/src/keyless-providers.js";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { clientError, formatZodError } from "./error-shapes.js";

const ChatCompletionsSchema = z.object({
	model: z.string().max(128).optional(),
	messages: z
		.array(
			z.object({
				role: z.enum(["system", "user", "assistant", "tool"]),
				content: z.string().max(16384),
			}),
		)
		.min(1)
		.max(64),
	temperature: z.number().min(0).max(2).optional(),
	max_tokens: z.number().int().min(1).max(4096).optional(),
	stream: z.boolean().optional(),
});

export async function openaiCompatRoutes(app: FastifyInstance) {
	app.post("/v1/chat/completions", async (request, reply) => {
		const parse = ChatCompletionsSchema.safeParse(request.body);
		if (!parse.success) {
			return clientError(reply, 400, formatZodError(parse.error), request.id);
		}
		const body = parse.data;

		const system = body.messages.find((m) => m.role === "system")?.content;
		const prompt = body.messages
			.filter((m) => m.role !== "system")
			.map((m) => m.content)
			.join("\n\n");

		const keylessReq: KeylessRequest = { prompt };
		if (body.model !== undefined) keylessReq.model = body.model;
		if (system !== undefined) keylessReq.system = system;
		if (body.temperature !== undefined) keylessReq.temperature = body.temperature;
		if (body.max_tokens !== undefined) keylessReq.maxTokens = body.max_tokens;

		try {
			const result = await callKeylessProviders(keylessReq);

			const id = `chatcmpl-${randomUUID().replace(/-/g, "").slice(0, 24)}`;
			const created = Math.floor(Date.now() / 1000);

			if (body.stream) {
				// Minimal-but-valid SSE: one delta chunk carrying the full answer,
				// then the standard [DONE] sentinel. Streaming clients render
				// correctly; token-level incremental delivery can be layered on
				// later without breaking this shape.
				reply.hijack();
				reply.raw.writeHead(200, {
					"Content-Type": "text/event-stream",
					"Cache-Control": "no-cache",
					Connection: "keep-alive",
				});
				reply.raw.write(
					`data: ${JSON.stringify({
						id,
						object: "chat.completion.chunk",
						created,
						model: result.model,
						choices: [{ index: 0, delta: { content: result.text }, finish_reason: "stop" }],
					})}\n\n`,
				);
				reply.raw.write("data: [DONE]\n\n");
				reply.raw.end();
				return reply;
			}

			return {
				id,
				object: "chat.completion",
				created,
				model: result.model,
				choices: [
					{
						index: 0,
						message: { role: "assistant", content: result.text },
						finish_reason: "stop",
					},
				],
				usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
				system_fingerprint: `keyless:${result.provider}`,
			};
		} catch (err) {
			request.log.error({ err }, "openai-compat chat completions failed");
			return clientError(reply, 502, "All keyless providers failed", request.id);
		}
	});

	app.get("/v1/models", async () => ({
		object: "list",
		data: ["auto", ...getKeylessProviderNames()].map((name) => ({
			id: name,
			object: "model",
			owned_by: name,
		})),
	}));
}
