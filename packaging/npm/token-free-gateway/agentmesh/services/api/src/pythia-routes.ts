/**
 * Pythia integration routes — Token-Free Gateway for Python coding tasks.
 *
 * Pythia (github.com/jangles-byte/Pythia) is a Python-based agentic coding tool.
 * Python code repair, refactoring, bug detection, and best practices. These routes let Pythia CLI
 * proxy Python code analysis through muhanai.com's
 * Token-Free Gateway — zero API key, zero token cost.
 *
 * Endpoints:
 *   POST   /api/pythia/session            Create a new Pythia session (file + prompt)
 *   POST   /api/pythia/session/:id/message  Send a follow-up message
 *   GET    /api/pythia/sessions           List active sessions
 *   DELETE /api/pythia/session/:id        Stop a session
 *   GET    /api/pythia/providers          List available keyless providers
 *
 * Architecture:
 *   Pythia CLI → muhanai.com /api/pythia/* → keyless-providers.ts
 *                                            ↓
 *                              Pollinations / OpenRouter free / Cloudflare / HF
 */

import { randomUUID } from "node:crypto";
import {
	callKeylessProviders,
	getKeylessProviderNames,
} from "@agentmesh/llm-router/src/keyless-providers.js";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { clientError, formatZodError } from "./error-shapes.js";

const CreateSessionSchema = z.object({
	file: z.string().min(1).max(256),
	prompt: z.string().min(1).max(8192),
	system: z.string().max(4096).optional(),
	userId: z.string().min(1).max(128).optional(),
});

const SendSchema = z.object({
	message: z.string().min(1).max(8192),
});

interface PythiaSession {
	id: string;

	file: string;
	prompt: string;
	status: "completed" | "error";
	provider: string;
	latencyMs: number;
	createdAt: number;
}

// In-memory session store (dev/demo mode). Replace with Prisma for production.
const sessions = new Map<string, PythiaSession>();

export async function pythiaRoutes(app: FastifyInstance) {
	/**
	 * POST /api/pythia/session
	 *
	 * Create a new Pythia session. Routes the prompt through the
	 * Token-Free Gateway's keyless providers pool.
	 * Returns a session ID + the LLM response.
	 */
	app.post("/api/pythia/session", async (request, reply) => {
		const parse = CreateSessionSchema.safeParse(request.body);
		if (!parse.success) {
			return clientError(reply, 400, formatZodError(parse.error), request.id);
		}

			const { file, prompt, system } = parse.data;
		const sessionId = `pythia_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

		const PYTHIA_SYSTEM =
		"You are Pythia, an expert Python coding agent. You specialize in code repair, " +
		"refactoring, bug detection, and best practices. You work through the Token-Free " +
		"Gateway with zero API cost. Always provide working, tested Python code with explanations.";

		try {
			const result = await callKeylessProviders({
				prompt: `[PYTHIA] File: ${file}\n\n${prompt}`,
				system: system ?? PYTHIA_SYSTEM,
			});

				const session: PythiaSession = {
			id: sessionId,
			file,
			prompt,
				status: "completed",
				provider: result.provider,
				latencyMs: result.latencyMs,
				createdAt: Date.now(),
			};
			sessions.set(sessionId, session);

				return {
				sessionId,
			response: result.text,
				file,
				provider: result.provider,
				latencyMs: result.latencyMs,
				tier: "keyless",
				cost: "0 MHT (Token-Free)",
			};
		} catch (err) {
			request.log.error({ err }, "pythia session creation failed");
			return clientError(reply, 502, "All keyless providers failed", request.id);
		}
	});

	/**
	 * POST /api/pythia/session/:id/message
	 *
	 * Send a follow-up message to an existing session.
	 */
	app.post("/api/pythia/session/:id/message", async (request, reply) => {
		const { id } = request.params as { id: string };
		const session = sessions.get(id);
		if (!session) {
			return clientError(reply, 404, "Session not found", request.id);
		}

		const parse = SendSchema.safeParse(request.body);
		if (!parse.success) {
			return clientError(reply, 400, formatZodError(parse.error), request.id);
		}

		try {
			const result = await callKeylessProviders({
				prompt: `[${session.file} CONTINUE] ${parse.data.message}`,
			});

				return {
				sessionId: id,
			response: result.text,
			file: session.file,
			provider: result.provider,
				latencyMs: result.latencyMs,
				tier: "keyless",
				cost: "0 MHT (Token-Free)",
			};
		} catch (err) {
			request.log.error({ err }, "pythia message failed");
			return clientError(reply, 502, "All keyless providers failed", request.id);
		}
	});

	/**
	 * GET /api/pythia/sessions
	 *
	 * List active sessions.
	 */
	app.get("/api/pythia/sessions", async (_request, _reply) => {
		return {
			sessions: Array.from(sessions.values()).map((s) => ({
				id: s.id,
								file: s.file,
				prompt: s.prompt.slice(0, 120),
				status: s.status,
				provider: s.provider,
				createdAt: new Date(s.createdAt).toISOString(),
			})),
			providers: getKeylessProviderNames(),
		};
	});

	/**
	 * DELETE /api/pythia/session/:id
	 *
	 * Stop a session.
	 */
	app.delete("/api/pythia/session/:id", async (request, reply) => {
		const { id } = request.params as { id: string };
		const session = sessions.get(id);
		if (!session) {
			return clientError(reply, 404, "Session not found", request.id);
		}
		sessions.delete(id);
		return { ok: true, sessionId: id };
	});

	/**
	 * GET /api/pythia/providers
	 *
	 * Returns the list of available keyless providers for Pythia CLI configuration.
	 */
	app.get("/api/pythia/providers", async (_request, _reply) => {
		return {
			providers: getKeylessProviderNames(),
			endpoint: "/api/pythia/session",
			tier: "keyless",
			cost: "0 MHT (Token-Free)",
		};
	});
}
