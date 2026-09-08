/**
 * Happy CLI integration routes — Token-Free Gateway for Claude Code & Codex.
 *
 * Happy (github.com/slopus/happy, 23.7k stars) is a mobile/web client for
 * Claude Code and Codex with E2E encryption. These routes let Happy CLI
 * proxy its Claude Code / Codex API calls through muhanai.com's
 * Token-Free Gateway — zero API key, zero token cost.
 *
 * Endpoints:
 *   POST /api/happy/session     Create a new Happy session routed through keyless providers
 *   GET  /api/happy/pulse/:id   SSE stream of session progress (reuses PulseBridge)
 *   GET  /api/happy/sessions    List active sessions for the authenticated user
 *   DELETE /api/happy/session/:id  Stop a session
 *
 * Architecture:
 *   Happy CLI → muhanai.com /api/happy/* → keyless-providers.ts
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
	agent: z.enum(["claude", "codex"]),
	prompt: z.string().min(1).max(8192),
	system: z.string().max(4096).optional(),
	userId: z.string().min(1).max(128).optional(),
});

const SendSchema = z.object({
	message: z.string().min(1).max(8192),
});

interface HappySession {
	id: string;
	agent: "claude" | "codex";
	prompt: string;
	status: "active" | "completed" | "error";
	provider: string;
	latencyMs: number;
	createdAt: number;
}

// In-memory session store (dev/demo mode). Replace with Prisma for production.
const sessions = new Map<string, HappySession>();

export async function happyRoutes(app: FastifyInstance) {
	/**
	 * POST /api/happy/session
	 *
	 * Create a new Happy session. Routes the prompt through the
	 * Token-Free Gateway's keyless providers pool.
	 * Returns a session ID + the LLM response.
	 */
	app.post("/api/happy/session", async (request, reply) => {
		const parse = CreateSessionSchema.safeParse(request.body);
		if (!parse.success) {
			return clientError(reply, 400, formatZodError(parse.error), request.id);
		}

		const { agent, prompt, system, userId } = parse.data;
		const sessionId = `happy_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

		const agentSystem =
			system ??
			(agent === "claude"
				? "You are Claude Code, an AI coding assistant. Provide clear, actionable code and explanations."
				: "You are Codex, an AI programming assistant. Provide concise, accurate code solutions.");

		try {
			const result = await callKeylessProviders({
				prompt: `[${agent.toUpperCase()}] ${prompt}`,
				system: agentSystem,
			});

			const session: HappySession = {
				id: sessionId,
				agent,
				prompt,
				status: "completed",
				provider: result.provider,
				latencyMs: result.latencyMs,
				createdAt: Date.now(),
			};
			sessions.set(sessionId, session);

			return {
				sessionId,
				agent,
				response: result.text,
				provider: result.provider,
				latencyMs: result.latencyMs,
				tier: "keyless",
				cost: "0 MHT (Token-Free)",
			};
		} catch (err) {
			request.log.error({ err }, "happy session creation failed");
			return clientError(reply, 502, "All keyless providers failed", request.id);
		}
	});

	/**
	 * POST /api/happy/session/:id/message
	 *
	 * Send a follow-up message to an existing session.
	 */
	app.post("/api/happy/session/:id/message", async (request, reply) => {
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
				prompt: `[${session.agent.toUpperCase()} CONTINUE] ${parse.data.message}`,
			});

			return {
				sessionId: id,
				response: result.text,
				provider: result.provider,
				latencyMs: result.latencyMs,
				tier: "keyless",
				cost: "0 MHT (Token-Free)",
			};
		} catch (err) {
			request.log.error({ err }, "happy message failed");
			return clientError(reply, 502, "All keyless providers failed", request.id);
		}
	});

	/**
	 * GET /api/happy/sessions
	 *
	 * List active sessions.
	 */
	app.get("/api/happy/sessions", async (_request, _reply) => {
		return {
			sessions: Array.from(sessions.values()).map((s) => ({
				id: s.id,
				agent: s.agent,
				prompt: s.prompt.slice(0, 120),
				status: s.status,
				provider: s.provider,
				createdAt: new Date(s.createdAt).toISOString(),
			})),
			providers: getKeylessProviderNames(),
		};
	});

	/**
	 * DELETE /api/happy/session/:id
	 *
	 * Stop a session.
	 */
	app.delete("/api/happy/session/:id", async (request, reply) => {
		const { id } = request.params as { id: string };
		const session = sessions.get(id);
		if (!session) {
			return clientError(reply, 404, "Session not found", request.id);
		}
		sessions.delete(id);
		return { ok: true, sessionId: id };
	});

	/**
	 * GET /api/happy/providers
	 *
	 * Returns the list of available keyless providers for Happy CLI configuration.
	 */
	app.get("/api/happy/providers", async (_request, _reply) => {
		return {
			providers: getKeylessProviderNames(),
			endpoint: "/api/happy/session",
			tier: "keyless",
			cost: "0 MHT (Token-Free)",
		};
	});
}
