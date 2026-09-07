/**
 * Security & Keys control-plane routes.
 *
 * Endpoints (protected by x-api-key hook in server.ts):
 *
 *   GET  /api/security                → SecuritySnapshot
 *   POST /api/security/toggles        body: SecurityToggles
 *   POST /api/security/daily-limit    body: { limit: number }
 *   POST /api/security/keys/:service/revoke
 *
 * Backed by an in-memory store for now. When the API gains a Prisma
 * table for security state, replace the `store` object with a repository
 * — the route handlers stay identical.
 *
 * Snapshot shape mirrors `SecuritySnapshot` from
 * `apps/web/src/components/harvest/C/SecuritySettings.tsx` — keep them
 * in sync if you change one.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { clientError, formatZodError } from "./error-shapes.js";

interface SecurityToggles {
	zeroTrustEnabled: boolean;
	relayEncryption: boolean;
	budgetGuardEnabled: boolean;
	apiVaultEnabled: boolean;
}

interface VaultKeyEntry {
	service: string;
	label: string;
	masked: string;
	updatedAt: number;
	rotatedDays: number;
}

interface SecurityAuditEvent {
	id: string;
	at: number;
	actor: string;
	action: string;
	detail: string;
}

interface SecuritySnapshot {
	toggles: SecurityToggles;
	dailyLimitCredits: number;
	dailyUsedCredits: number;
	quota: { name: string; quota: number; used: number }[];
	gateways: Array<{
		name: string;
		status: "healthy" | "degraded" | "offline";
		latencyMs: number;
		costTier: "free" | "low" | "paid";
	}>;
	keys: VaultKeyEntry[];
	audit: SecurityAuditEvent[];
}

const store: SecuritySnapshot = {
	toggles: {
		zeroTrustEnabled: true,
		relayEncryption: true,
		budgetGuardEnabled: true,
		apiVaultEnabled: false,
	},
	dailyLimitCredits: 5000,
	dailyUsedCredits: 1416,
	quota: [
		{ name: "openai", quota: 1000, used: 412 },
		{ name: "anthropic", quota: 500, used: 188 },
		{ name: "gemini", quota: 1500, used: 720 },
		{ name: "groq", quota: 800, used: 96 },
	],
	gateways: [
		{ name: "WebLLM", status: "healthy", latencyMs: 60, costTier: "free" },
		{ name: "LocalAI", status: "healthy", latencyMs: 90, costTier: "free" },
		{ name: "Ollama", status: "healthy", latencyMs: 110, costTier: "free" },
		{ name: "FreeLLMAPI", status: "healthy", latencyMs: 210, costTier: "free" },
		{ name: "Groq", status: "healthy", latencyMs: 150, costTier: "low" },
		{ name: "Mistral", status: "degraded", latencyMs: 420, costTier: "low" },
		{ name: "Gemini", status: "healthy", latencyMs: 180, costTier: "low" },
		{ name: "Claude", status: "healthy", latencyMs: 220, costTier: "paid" },
		{ name: "GPT", status: "healthy", latencyMs: 240, costTier: "paid" },
		{ name: "OpenRouter", status: "healthy", latencyMs: 360, costTier: "paid" },
	],
	keys: [
		{
			service: "openai",
			label: "OpenAI Production",
			masked: "sk-prod-****3a9f",
			updatedAt: Date.now() - 86_400_000,
			rotatedDays: 12,
		},
		{
			service: "anthropic",
			label: "Anthropic Main",
			masked: "sk-ant-****7c2e",
			updatedAt: Date.now() - 2 * 86_400_000,
			rotatedDays: 24,
		},
		{
			service: "groq",
			label: "Groq Backup",
			masked: "gsk-****b81d",
			updatedAt: Date.now() - 5 * 86_400_000,
			rotatedDays: 45,
		},
	],
	audit: [
		{
			id: "evt-1",
			at: Date.now() - 180_000,
			actor: "user:brianyeon",
			action: "policy.change",
			detail: "Active policy → Balanced",
		},
		{
			id: "evt-2",
			at: Date.now() - 1_800_000,
			actor: "gateway:webllm",
			action: "vault.read",
			detail: "Served 3 prompts (free tier)",
		},
		{
			id: "evt-3",
			at: Date.now() - 7_200_000,
			actor: "user:brianyeon",
			action: "key.rotate",
			detail: "groq → rotated",
		},
	],
};

const TogglesSchema = z.object({
	zeroTrustEnabled: z.boolean(),
	relayEncryption: z.boolean(),
	budgetGuardEnabled: z.boolean(),
	apiVaultEnabled: z.boolean(),
});

const DailyLimitSchema = z.object({
	limit: z.number().int().positive().max(1_000_000),
});

let auditCounter = store.audit.length;

function appendAudit(actor: string, action: string, detail: string): SecurityAuditEvent {
	auditCounter += 1;
	const evt: SecurityAuditEvent = {
		id: `evt-${auditCounter}-${Date.now().toString(36)}`,
		at: Date.now(),
		actor,
		action,
		detail,
	};
	store.audit = [evt, ...store.audit].slice(0, 50);
	return evt;
}

export async function securityRoutes(app: FastifyInstance) {
	app.get("/api/security", async (_request, _reply) => {
		return store satisfies SecuritySnapshot;
	});

	app.post("/api/security/toggles", async (request, reply) => {
		const parse = TogglesSchema.safeParse(request.body);
		if (!parse.success) {
			return clientError(reply, 400, formatZodError(parse.error), request.id);
		}
		store.toggles = parse.data;
		appendAudit(
			(request.headers["x-actor"] as string) ?? "user:unknown",
			"security.toggle",
			JSON.stringify(parse.data),
		);
		return { ok: true, toggles: store.toggles };
	});

	app.post("/api/security/daily-limit", async (request, reply) => {
		const parse = DailyLimitSchema.safeParse(request.body);
		if (!parse.success) {
			return clientError(reply, 400, formatZodError(parse.error), request.id);
		}
		store.dailyLimitCredits = parse.data.limit;
		appendAudit(
			(request.headers["x-actor"] as string) ?? "user:unknown",
			"budget.limit",
			`${parse.data.limit} cr`,
		);
		return { ok: true, dailyLimitCredits: store.dailyLimitCredits };
	});

	app.post<{ Params: { service: string } }>(
		"/api/security/keys/:service/revoke",
		async (request, reply) => {
			const service = request.params.service?.trim();
			if (!service) {
				return clientError(reply, 400, "service: required", request.id);
			}
			const idx = store.keys.findIndex((k) => k.service === service);
			if (idx === -1) {
				return clientError(reply, 404, `service: not found in vault`, request.id);
			}
			const [removed] = store.keys.splice(idx, 1);
			appendAudit(
				(request.headers["x-actor"] as string) ?? "user:unknown",
				"key.revoke",
				`${removed?.service ?? service} → revoked`,
			);
			return { ok: true, revoked: removed?.service ?? service };
		},
	);
}

/** Exposed for tests that need to reset state between cases. */
export function _resetSecurityStore(): void {
	auditCounter = store.audit.length;
}
