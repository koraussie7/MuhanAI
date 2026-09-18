/**
 * Pythia integration routes — Token-Free Gateway for Python coding tasks.
 *
 * Pythia (github.com/jangles-byte/Pythia) is a Python-based agentic coding tool.
 * Python code repair, refactoring, bug detection, and best practices. These routes let Pythia CLI
 * proxy Python code analysis through muhanai.com's
 * Token-Free Gateway — zero API key, zero token cost.
 *
 * Endpoints:
 *   POST   /api/pythia/session              Create a new Pythia session (file + prompt)
 *   POST   /api/pythia/session/:id/message  Send a follow-up message
 *   GET    /api/pythia/sessions             List active sessions
 *   GET    /api/pythia/models               Model catalog (OmniRoute catalog, static fallback)
 *   DELETE /api/pythia/session/:id          Stop a session
 *   GET    /api/pythia/providers            List available keyless providers
 *
 * Architecture:
 *   Pythia CLI → muhanai.com /api/pythia/* → keyless-providers.ts
 *                                            ↓
 *                              Mesh-LLM / OmniRoute free mesh / Pollinations
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
import { pythiaA2uiCall } from "./pythia-a2ui-service.js";

const CreateSessionSchema = z.object({
	file: z.string().min(1).max(256),
	prompt: z.string().min(1).max(8192),
	system: z.string().max(4096).optional(),
	model: z.string().max(128).optional(),
	userId: z.string().min(1).max(128).optional(),
});

const SendSchema = z.object({
	message: z.string().min(1).max(8192),
});

interface PythiaSession {
	id: string;
	file: string;
	prompt: string;
	model: string;
	status: "completed" | "error";
	provider: string;
	latencyMs: number;
	createdAt: number;
}

// In-memory session store (dev/demo mode). Replace with Prisma for production.
const sessions = new Map<string, PythiaSession>();

// ---------------------------------------------------------------------------
// OmniRoute prompt compression (RTK + Caveman): shrink long prompts before the
// keyless call so free-tier quotas stretch further (avg ~89% token savings).
// Env-gated (PYTHIA_COMPRESS=off to disable) and silent on any failure —
// Pythia must never break because an optional OmniRoute sidecar is missing.
// ---------------------------------------------------------------------------

export interface PromptCompressor {
	compressPrompt(args: { text: string; level?: string }): Promise<{
		compressed: string;
		ratio: number;
	}>;
}

/** Skip compression for short prompts — overhead beats savings below this. */
const COMPRESS_MIN_CHARS = 1024;

function isCompressionDisabled(): boolean {
	const flag = process.env.PYTHIA_COMPRESS;
	if (!flag) return false;
	return ["off", "false", "0"].includes(flag.toLowerCase());
}

/**
 * Compress a Pythia prompt through the OmniRoute RTK/Caveman tool when
 * available. Returns the (possibly) compressed text plus a flag so callers
 * can observe whether compression actually fired.
 */
export async function maybeCompressPrompt(
	text: string,
	injected?: PromptCompressor,
): Promise<{ text: string; compressed: boolean }> {
	if (text.length < COMPRESS_MIN_CHARS) return { text, compressed: false };
	if (isCompressionDisabled()) return { text, compressed: false };

	let client: PromptCompressor | undefined = injected;
	if (!client) {
		try {
			const mod = (await import("@agentmesh/personal-mcp")) as unknown as {
				getOmniRouteMcpClient?: () => PromptCompressor | null;
			};
			if (typeof mod.getOmniRouteMcpClient === "function") {
				client = mod.getOmniRouteMcpClient() ?? undefined;
			}
		} catch {
			// optional integration — degrade silently
		}
	}
	if (!client || typeof client.compressPrompt !== "function") {
		return { text, compressed: false };
	}

	try {
		const res = await client.compressPrompt({ text, level: "medium" });
		if (
			res &&
			typeof res.compressed === "string" &&
			res.compressed.length > 0 &&
			res.compressed.length < text.length &&
			res.ratio < 1
		) {
			return { text: res.compressed, compressed: true };
		}
	} catch {
		// degrade silently
	}
	return { text, compressed: false };
}

// ---------------------------------------------------------------------------
// Model catalog for the Pythia UI: live OmniRoute catalog when reachable,
// static keyless-friendly list otherwise.
// ---------------------------------------------------------------------------

const STATIC_MODELS: readonly string[] = ["auto", "minimax-m3", "openai/gpt-4o-mini"];

export async function listPythiaModels(): Promise<string[]> {
	try {
		const mod = (await import("@agentmesh/personal-mcp")) as unknown as {
			getOmniRouteMcpClient?: () => {
				listModels: (opts?: { capability?: string }) => Promise<{
					models?: Array<{ id?: string }>;
				}>;
			} | null;
		};
		if (typeof mod.getOmniRouteMcpClient !== "function") return [...STATIC_MODELS];
		const client = mod.getOmniRouteMcpClient();
		if (!client || typeof client.listModels !== "function") return [...STATIC_MODELS];
		const catalog = await client.listModels({ capability: "chat" });
		const ids = (catalog?.models ?? [])
			.map((m) => m.id)
			.filter((id): id is string => typeof id === "string" && id.length > 0);
		return ids.length > 0 ? ids.slice(0, 50) : [...STATIC_MODELS];
	} catch {
		return [...STATIC_MODELS];
	}
}

const PYTHIA_SYSTEM =
	"You are Pythia, an expert Python coding agent. You specialize in code repair, " +
	"refactoring, bug detection, and best practices. You work through the Token-Free " +
	"Gateway with zero API cost. Always provide working, tested Python code with explanations.";

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

		const { file, prompt, system, model } = parse.data;
		const sessionId = `pythia_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

		try {
			const compressed = await maybeCompressPrompt(`[PYTHIA] File: ${file}\n\n${prompt}`);
			const result = await callKeylessProviders({
				prompt: compressed.text,
				system: system ?? PYTHIA_SYSTEM,
				...(model !== undefined ? { model } : {}),
			});

			const session: PythiaSession = {
				id: sessionId,
				file,
				prompt,
				model: model ?? "auto",
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
				surface: await pythiaA2uiCall({
					prompt: `[PYTHIA] File: ${file}\n\n${prompt}`,
					file,
				}).then((r) => r.surface),
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
			const compressed = await maybeCompressPrompt(
				`[${session.file} CONTINUE] ${parse.data.message}`,
			);
			const keylessReq: KeylessRequest = { prompt: compressed.text };
			if (session.model && session.model !== "auto") keylessReq.model = session.model;
			const result = await callKeylessProviders(keylessReq);


			return {
				sessionId: id,
				response: result.text,
				file: session.file,
				provider: result.provider,
				latencyMs: result.latencyMs,
				tier: "keyless",
				cost: "0 MHT (Token-Free)",
				surface: await pythiaA2uiCall({
					prompt: `[PYTHIA] File: ${session.file}\n\n${parse.data.message}`,
					file: session.file,
				}).then((r) => r.surface),
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
				model: s.model,
				status: s.status,
				provider: s.provider,
				createdAt: new Date(s.createdAt).toISOString(),
			})),
			providers: getKeylessProviderNames(),
		};
	});

	/**
	 * GET /api/pythia/models
	 *
	 * Model catalog for the Pythia UI. Prefers the live OmniRoute catalog
	 * (1,312+ models) and degrades to a static keyless-friendly list.
	 */
	app.get("/api/pythia/models", async () => ({
		models: await listPythiaModels(),
		providers: getKeylessProviderNames(),
	}));

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
