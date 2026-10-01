/**
 * Thin-client routes — Phase 0 foundation for the MuhanAI thin client.
 *
 * The thin client (Electron + Vite + React) is deliberately stateless: it
 * renders chat, prompts for approvals, registers BYOK keys, and
 * auto-updates. All inference, storage, and sandboxing stay on the server.
 * This module is the server half of that contract.
 *
 * Endpoints:
 *   GET    /api/thin-client/config                      — server capability + feature flags
 *   POST   /api/thin-client/pair/start                  — issue a one-time pairing code
 *   POST   /api/thin-client/pair                        — exchange code → device token
 *   GET    /api/thin-client/providers/status            — keyless pool + BYOK readiness
 *   GET    /api/thin-client/keys                        — masked BYOK key inventory
 *   POST   /api/thin-client/keys                        — register a BYOK key (server-side)
 *   DELETE /api/thin-client/keys/:provider              — remove a BYOK key
 *   POST   /api/thin-client/approvals                   — open an approval ticket
 *   GET    /api/thin-client/approvals/pending           — poll pending tickets
 *   GET    /api/thin-client/approvals/:id               — read one ticket
 *   POST   /api/thin-client/approvals/:id/decision      — approve / deny
 *   GET    /api/thin-client/approvals/audit             — append-only decision log
 *   GET    /api/thin-client/updates/latest              — electron-updater feed
 *   POST   /api/thin-client/devices/revoke              — revoke a device token
 *
 * Security posture (Phase 0):
 *   - Pairing codes are 6 chars from a 32-symbol alphabet, 5 min TTL,
 *     single use, and rate limited per IP.
 *   - Device tokens are returned exactly once; only their SHA-256 hash is
 *     retained server-side, and compared with `timingSafeEqual`.
 *   - BYOK key material is never echoed back — reads return a mask.
 *
 * Storage is in-process (Map). Single-instance dev is the Phase 0 target;
 * the `store` seam is deliberate so Phase 1 can swap in Prisma without
 * touching route logic.
 *
 * See docs/thin-client/AGENT-WORKSTREAMS.md for the multi-agent split.
 */

import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { getKeylessProviderNames } from "@agentmesh/llm-router/src/keyless-providers.js";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { clientError, formatZodError } from "./error-shapes.js";

// === Constants ===

/** Pairing codes avoid glyphs that survive a QR scan into a terminal badly. */
const PAIRING_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PAIRING_CODE_LENGTH = 6;
const PAIRING_TTL_MS = 5 * 60 * 1000;
const PAIRING_MAX_FAILURES = 10;
const PAIRING_FAILURE_WINDOW_MS = 10 * 60 * 1000;

const APPROVAL_TTL_MS = 10 * 60 * 1000;
const AUDIT_LOG_LIMIT = 500;
const DEVICE_TOKEN_PREFIX = "tc_";

/**
 * Risk ladder inherited from the open-dots deny-by-default gateway:
 *   read     — safe, auto-runs, audit only
 *   write    — one confirmation per action
 *   external — always confirms (leaves our trust boundary)
 *   system   — confirms and requires a written reason
 */
const RISK_TIERS = ["read", "write", "external", "system"] as const;
type RiskTier = (typeof RISK_TIERS)[number];

/**
 * BYOK allowlist. Superset of the `computer-use` provider enum plus the
 * free-tier hostnames the SAM Free-Brains rotation popularised — we keep
 * the names aligned so the client can render one flat provider list.
 */
const BYOK_PROVIDERS = [
	"openai",
	"anthropic",
	"google",
	"groq",
	"openrouter",
	"mistral",
	"deepseek",
	"cerebras",
	"nvidia",
	"xai",
	"github",
] as const;
type ByokProvider = (typeof BYOK_PROVIDERS)[number];

/** Server-side env var that already holds a key for a provider, if any. */
const PROVIDER_ENV_KEYS: Record<ByokProvider, string[]> = {
	openai: ["OPENAI_API_KEY"],
	anthropic: ["ANTHROPIC_API_KEY"],
	google: ["GOOGLE_API_KEY", "GEMINI_API_KEY"],
	groq: ["GROQ_API_KEY"],
	openrouter: ["OPENROUTER_API_KEY"],
	mistral: ["MISTRAL_API_KEY"],
	deepseek: ["DEEPSEEK_API_KEY"],
	cerebras: ["CEREBRAS_API_KEY"],
	nvidia: ["NVIDIA_API_KEY"],
	xai: ["XAI_API_KEY"],
	github: ["GITHUB_TOKEN", "GITHUB_MODELS_TOKEN"],
};

// === Request schemas ===

const PairStartSchema = z.object({
	/** Free-form label shown in the confirming UI (hostname, OS, …). */
	label: z.string().min(1).max(64).optional(),
	platform: z.enum(["darwin", "win32", "linux"]).optional(),
});

const PairRedeemSchema = z.object({
	code: z
		.string()
		.trim()
		.toUpperCase()
		.regex(/^[A-Z2-9]{6}$/, "must be a 6-character pairing code"),
	label: z.string().min(1).max(64).optional(),
	platform: z.enum(["darwin", "win32", "linux"]).optional(),
	appVersion: z.string().max(32).optional(),
});

const KeyUpsertSchema = z.object({
	provider: z.enum(BYOK_PROVIDERS),
	key: z.string().min(8).max(512),
	label: z.string().max(64).optional(),
});

const ApprovalCreateSchema = z.object({
	resource: z.enum(["computer-use", "quorum", "shell", "filesystem", "network", "other"]),
	riskTier: z.enum(RISK_TIERS),
	summary: z.string().min(1).max(512),
	/** Sanitised, non-secret arguments shown to the human before approval. */
	args: z.record(z.union([z.string().max(256), z.number(), z.boolean(), z.null()])).optional(),
	deviceId: z.string().max(64).optional(),
	traceId: z.string().max(128).optional(),
});

const ApprovalDecisionSchema = z.object({
	decision: z.enum(["approve", "deny"]),
	reason: z.string().max(512).optional(),
	deviceId: z.string().max(64).optional(),
});

const RevokeSchema = z.object({
	deviceId: z.string().min(1).max(64),
	reason: z.string().max(256).optional(),
});

// === In-process store (Phase 0 seam) ===

interface PairingTicket {
	code: string;
	label: string;
	platform?: string;
	createdAt: number;
	expiresAt: number;
	redeemedBy?: string;
}

interface DeviceRecord {
	id: string;
	label: string;
	platform?: string;
	appVersion?: string;
	tokenHash: string;
	createdAt: number;
	lastSeenAt: number;
	revokedAt?: number;
	revokedReason?: string;
}

interface ByokRecord {
	provider: ByokProvider;
	key: string;
	label?: string;
	createdAt: number;
	updatedAt: number;
}

interface ApprovalTicket {
	id: string;
	resource: string;
	riskTier: RiskTier;
	summary: string;
	args?: Record<string, string | number | boolean | null>;
	deviceId?: string;
	traceId?: string;
	status: "pending" | "approved" | "denied" | "expired";
	createdAt: number;
	expiresAt: number;
	decidedAt?: number;
	decidedBy?: string;
	reason?: string;
}

interface AuditEntry {
	id: string;
	at: number;
	action:
		| "pair.start"
		| "pair.redeem"
		| "pair.fail"
		| "key.upsert"
		| "key.delete"
		| "approval.create"
		| "approval.decide"
		| "device.revoke";
	actor: string;
	detail: Record<string, string | number | boolean | null>;
}

interface ThinClientStore {
	pairings: Map<string, PairingTicket>;
	devices: Map<string, DeviceRecord>;
	byok: Map<ByokProvider, ByokRecord>;
	approvals: Map<string, ApprovalTicket>;
	audit: AuditEntry[];
	/** IP → failure timestamps, pruned on read. */
	pairFailures: Map<string, number[]>;
}

const store: ThinClientStore = {
	pairings: new Map(),
	devices: new Map(),
	byok: new Map(),
	approvals: new Map(),
	audit: [],
	pairFailures: new Map(),
};

/** Test seam — `buildApp` hands every test a clean process, but suites that
 * boot the app once still need a reset between cases. */
export function __resetThinClientStore(): void {
	store.pairings.clear();
	store.devices.clear();
	store.byok.clear();
	store.approvals.clear();
	store.audit.length = 0;
	store.pairFailures.clear();
}

// === Helpers ===

function makePairingCode(): string {
	const bytes = randomBytes(PAIRING_CODE_LENGTH);
	let out = "";
	for (let i = 0; i < PAIRING_CODE_LENGTH; i += 1) {
		const idx = bytes[i] ?? 0;
		out += PAIRING_ALPHABET[idx % PAIRING_ALPHABET.length];
	}
	return out;
}

function sha256(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

/** Constant-time compare that tolerates length mismatch. */
function hashEquals(a: string, b: string): boolean {
	const bufA = Buffer.from(a, "hex");
	const bufB = Buffer.from(b, "hex");
	if (bufA.length !== bufB.length) return false;
	return timingSafeEqual(bufA, bufB);
}

function maskKey(key: string): string {
	if (key.length <= 8) return "****";
	return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

function prunePairFailures(ip: string, now: number): number[] {
	const recent = (store.pairFailures.get(ip) ?? []).filter(
		(at) => now - at < PAIRING_FAILURE_WINDOW_MS,
	);
	if (recent.length === 0) {
		store.pairFailures.delete(ip);
	} else {
		store.pairFailures.set(ip, recent);
	}
	return recent;
}

function recordPairFailure(ip: string, now: number): void {
	const recent = prunePairFailures(ip, now);
	recent.push(now);
	store.pairFailures.set(ip, recent);
}

function recordAudit(entry: Omit<AuditEntry, "id" | "at">): void {
	store.audit.unshift({ id: randomUUID(), at: Date.now(), ...entry });
	if (store.audit.length > AUDIT_LOG_LIMIT) {
		store.audit.length = AUDIT_LOG_LIMIT;
	}
}

function pruneExpiredPairings(now: number): void {
	for (const [code, ticket] of store.pairings) {
		if (ticket.expiresAt <= now) store.pairings.delete(code);
	}
}

function expireApprovals(now: number): void {
	for (const ticket of store.approvals.values()) {
		if (ticket.status === "pending" && ticket.expiresAt <= now) {
			ticket.status = "expired";
			ticket.decidedAt = now;
		}
	}
}

/** Provider readiness: server env key first, then a registered BYOK key. */
function providerStatus(provider: ByokProvider) {
	const envKeys = PROVIDER_ENV_KEYS[provider].filter((name) => Boolean(process.env[name]));
	const byok = store.byok.get(provider);
	return {
		provider,
		hasServerKey: envKeys.length > 0,
		envVars: envKeys,
		hasByokKey: Boolean(byok),
		byokMasked: byok ? maskKey(byok.key) : null,
		ready: envKeys.length > 0 || Boolean(byok),
	};
}

/**
 * Resolve the calling device from `x-device-token` or `Authorization: Bearer <token>`.
 * Returns null when the header is absent, unknown, or revoked — callers decide
 * whether that is a 401 or an anonymous-friendly read.
 *
 * Exported so the global onRequest hook in server.ts can validate device tokens
 * for thin-client-accessible routes like /api/llm/chat.
 */
export function resolveDevice(request: FastifyRequest): DeviceRecord | null {
	let token: string | undefined;
	const raw = request.headers["x-device-token"];
	token = Array.isArray(raw) ? raw[0] : raw;
	if (!token) {
		const auth = request.headers.authorization;
		const rawAuth = Array.isArray(auth) ? auth[0] : auth;
		if (rawAuth?.startsWith("Bearer ")) {
			token = rawAuth.slice(7);
		}
	}
	if (!token || typeof token !== "string") return null;
	const hash = sha256(token);
	for (const device of store.devices.values()) {
		if (device.revokedAt) continue;
		if (hashEquals(device.tokenHash, hash)) {
			device.lastSeenAt = Date.now();
			return device;
		}
	}
	return null;
}

function requireDevice(request: FastifyRequest, reply: FastifyReply): DeviceRecord | null {
	const device = resolveDevice(request);
	if (!device) {
		clientError(reply, 401, "Missing or invalid device token", request.id);
		return null;
	}
	return device;
}

function clientIp(request: FastifyRequest): string {
	const forwarded = request.headers["x-forwarded-for"];
	let raw: string | undefined;
	if (Array.isArray(forwarded)) {
		raw = forwarded[0];
	} else {
		raw = forwarded;
	}
	if (typeof raw === "string" && raw.length > 0) {
		const first = raw.split(",")[0];
		return first ? first.trim() : "unknown";
	}
	return request.ip ?? "unknown";
}

// === Update feed config ===

const THIN_CLIENT_LATEST_VERSION = process.env.THIN_CLIENT_LATEST_VERSION ?? "0.1.0";
const THIN_CLIENT_MINIMUM_VERSION = process.env.THIN_CLIENT_MINIMUM_VERSION ?? "0.1.0";
const THIN_CLIENT_UPDATE_CHANNEL = process.env.THIN_CLIENT_UPDATE_CHANNEL ?? "stable";
const THIN_CLIENT_RELEASE_NOTES = process.env.THIN_CLIENT_RELEASE_NOTES ?? "";
const THIN_CLIENT_DOWNLOAD_BASE_URL =
	process.env.THIN_CLIENT_DOWNLOAD_BASE_URL ?? "https://muhanai.com/downloads/thin-client";

/** Numeric semver compare — enough for `x.y.z` release tags. */
function compareVersions(a: string, b: string): number {
	const pa = a.split(".").map((part) => Number.parseInt(part, 10) || 0);
	const pb = b.split(".").map((part) => Number.parseInt(part, 10) || 0);
	const len = Math.max(pa.length, pb.length);
	for (let i = 0; i < len; i += 1) {
		const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
		if (diff !== 0) return diff;
	}
	return 0;
}

const UPDATE_PLATFORMS = ["darwin", "win32", "linux"] as const;
type UpdatePlatform = (typeof UPDATE_PLATFORMS)[number];

function updateArtifact(platform: UpdatePlatform, version: string) {
	const fileName =
		platform === "darwin"
			? `MuhanAI-Thin-Client-${version}.dmg`
			: platform === "win32"
				? `MuhanAI-Thin-Client-Setup-${version}.exe`
				: `MuhanAI-Thin-Client-${version}.AppImage`;
	return {
		platform,
		fileName,
		url: `${THIN_CLIENT_DOWNLOAD_BASE_URL}/${version}/${fileName}`,
	};
}

// === Route handlers ===

/** Auth check for web-session endpoints (approval management). */
function requireAdmin(request: FastifyRequest): string | null {
	const validApiKey = process.env.API_KEY;
	if (!validApiKey) {
		return "Unauthorized: admin API key required";
	}
	const rawApiKey = request.headers["x-api-key"];
	const apiKey = Array.isArray(rawApiKey) ? rawApiKey[0] : rawApiKey;
	if (!apiKey || typeof apiKey !== "string" || apiKey.length !== validApiKey.length) {
		return "Unauthorized: admin API key required";
	}
	if (!timingSafeEqual(Buffer.from(apiKey), Buffer.from(validApiKey))) {
		return "Unauthorized: admin API key required";
	}
	return null;
}

export async function thinClientRoutes(app: FastifyInstance) {
	app.addHook("preHandler", async () => {
		// Periodic cleanup of expired pairings and approvals.
		const now = Date.now();
		pruneExpiredPairings(now);
		expireApprovals(now);
	});

	// 1. GET /api/thin-client/config (public)
	app.get("/api/thin-client/config", async (_request, reply) => {
		return reply.send({
			latestVersion: THIN_CLIENT_LATEST_VERSION,
			minimumVersion: THIN_CLIENT_MINIMUM_VERSION,
			updateChannel: THIN_CLIENT_UPDATE_CHANNEL,
			releaseNotes: THIN_CLIENT_RELEASE_NOTES,
			downloadBaseUrl: THIN_CLIENT_DOWNLOAD_BASE_URL,
			keylessProviders: getKeylessProviderNames(),
			byokProviders: BYOK_PROVIDERS,
		});
	});

	// 2. POST /api/thin-client/pair (public)
	app.post("/api/thin-client/pair", async (request, reply) => {
		const ip = clientIp(request);
		const now = Date.now();

		// Rate-limit pairing attempts per IP
		const recent = prunePairFailures(ip, now);
		if (recent.length >= PAIRING_MAX_FAILURES) {
			return clientError(reply, 429, "Too many pairing attempts. Try again later.", request.id);
		}
		recordPairFailure(ip, now);

		const parse = PairStartSchema.safeParse(request.body);
		if (!parse.success) {
			return clientError(reply, 400, formatZodError(parse.error), request.id);
		}
		const { label = "unknown", platform } = parse.data;

		const code = makePairingCode();
		const expiresAt = now + PAIRING_TTL_MS;
		store.pairings.set(code, { code, label, platform, createdAt: now, expiresAt });

		recordAudit({ action: "pair.start", actor: ip, detail: { label, platform: platform ?? null } });

		return reply.send({
			code,
			expiresIn: PAIRING_TTL_MS / 1000,
		});
	});

	// 3. GET /api/thin-client/providers (device auth)
	app.get("/api/thin-client/providers", async (request, reply) => {
		const device = requireDevice(request, reply);
		if (!device) return;

		const providers = [
			...Array.from(store.byok.values(), (r) => providerStatus(r.provider)),
			...BYOK_PROVIDERS.filter((p) => !store.byok.has(p)).map(providerStatus),
		];

		return reply.send({
			keyless: getKeylessProviderNames(),
			omniroute: BYOK_PROVIDERS,
			byok: providers,
		});
	});

	// 4. POST /api/thin-client/keys (device auth)
	app.post("/api/thin-client/keys", async (request, reply) => {
		const device = requireDevice(request, reply);
		if (!device) return;

		const parse = KeyUpsertSchema.safeParse(request.body);
		if (!parse.success) {
			return clientError(reply, 400, formatZodError(parse.error), request.id);
		}
		const { provider, key, label } = parse.data;

		const now = Date.now();
		store.byok.set(provider, { provider, key, label, createdAt: now, updatedAt: now });
		recordAudit({
			action: "key.upsert",
			actor: device.id,
			detail: { provider, label: label ?? null },
		});

		return reply.send({
			ok: true,
			provider,
			masked: maskKey(key),
		});
	});

	// 5. GET /api/thin-client/keys (device auth)
	app.get("/api/thin-client/keys", async (request, reply) => {
		const device = requireDevice(request, reply);
		if (!device) return;

		const keys = Array.from(BYOK_PROVIDERS, (provider) => {
			const rec = store.byok.get(provider);
			if (!rec) return { provider, registered: false };
			return {
				provider,
				registered: true,
				label: rec.label ?? null,
				masked: maskKey(rec.key),
				createdAt: rec.createdAt,
				updatedAt: rec.updatedAt,
			};
		});

		return reply.send({ keys });
	});

	// 6. DELETE /api/thin-client/keys/:id (device auth)
	app.delete("/api/thin-client/keys/:id", async (request, reply) => {
		const device = requireDevice(request, reply);
		if (!device) return;

		const parse = z.object({ id: z.enum(BYOK_PROVIDERS) }).safeParse(request.params);
		if (!parse.success) {
			return clientError(reply, 400, formatZodError(parse.error), request.id);
		}
		const { id: provider } = parse.data;

		const deleted = store.byok.delete(provider);
		if (!deleted) {
			return clientError(reply, 404, `No BYOK key registered for ${provider}`, request.id);
		}
		recordAudit({ action: "key.delete", actor: device.id, detail: { provider } });

		return reply.send({ ok: true, provider });
	});

	// 7. GET /api/thin-client/approvals (admin web session — list pending)
	app.get("/api/thin-client/approvals", async (request, reply) => {
		const authError = requireAdmin(request);
		if (authError) return reply.code(401).send({ error: authError });

		const now = Date.now();
		expireApprovals(now);
		const pending = Array.from(store.approvals.values()).filter((a) => a.status === "pending");

		return reply.send({ approvals: pending });
	});

	// 8. POST /api/thin-client/approvals (device → open an approval ticket)
	app.post("/api/thin-client/approvals", async (request, reply) => {
		const device = requireDevice(request, reply);
		if (!device) return;

		const parse = ApprovalCreateSchema.safeParse(request.body);
		if (!parse.success) {
			return clientError(reply, 400, formatZodError(parse.error), request.id);
		}
		const { resource, riskTier, summary, args, traceId } = parse.data;

		const now = Date.now();
		const id = `app_${randomUUID()}`;
		const ticket: ApprovalTicket = {
			id,
			resource,
			riskTier,
			summary,
			args,
			deviceId: device.id,
			traceId,
			status: "pending",
			createdAt: now,
			expiresAt: now + APPROVAL_TTL_MS,
		};
		store.approvals.set(id, ticket);
		recordAudit({
			action: "approval.create",
			actor: device.id,
			detail: { id, resource, riskTier },
		});

		return reply.send({
			id: ticket.id,
			status: ticket.status,
			expiresAt: ticket.expiresAt,
		});
	});

	// 8. POST /api/thin-client/approvals/:id/approve or /deny (admin web session)
	app.post("/api/thin-client/approvals/:id/decision", async (request, reply) => {
		const authError = requireAdmin(request);
		if (authError) return reply.code(401).send({ error: authError });

		const { id } = request.params as { id: string };
		const approval = store.approvals.get(id);
		if (!approval) {
			return clientError(reply, 404, "Approval not found", request.id);
		}

		if (approval.status !== "pending") {
			return clientError(reply, 409, `Approval is ${approval.status}`, request.id);
		}

		const parse = ApprovalDecisionSchema.safeParse(request.body);
		if (!parse.success) {
			return clientError(reply, 400, formatZodError(parse.error), request.id);
		}
		const { decision, reason } = parse.data;
		const now = Date.now();

		approval.status = decision === "approve" ? "approved" : "denied";
		approval.decidedAt = now;
		approval.reason = reason;
		approval.decidedBy = "admin";

		recordAudit({
			action: "approval.decide",
			actor: "admin",
			detail: { id, decision, resource: approval.resource },
		});

		return reply.send({
			ok: true,
			id: approval.id,
			status: approval.status,
		});
	});

	// 9. GET /api/thin-client/updates (public)
	app.get("/api/thin-client/updates", async (request, reply) => {
		const parse = z
			.object({
				platform: z.enum(["darwin", "win32", "linux"]),
				currentVersion: z.string().optional(),
			})
			.safeParse(request.query);
		if (!parse.success) {
			return clientError(reply, 400, formatZodError(parse.error), request.id);
		}
		const { platform, currentVersion } = parse.data;

		const latest = THIN_CLIENT_LATEST_VERSION;
		const artifact = updateArtifact(platform, latest);

		let hasUpdate = true;
		if (currentVersion) {
			hasUpdate = compareVersions(latest, currentVersion) > 0;
		}

		return reply.send({
			version: latest,
			minVersion: THIN_CLIENT_MINIMUM_VERSION,
			channel: THIN_CLIENT_UPDATE_CHANNEL,
			releaseNotes: THIN_CLIENT_RELEASE_NOTES,
			hasUpdate,
			downloadUrl: artifact.url,
			fileName: artifact.fileName,
		});
	});

	// 10. POST /api/thin-client/pair/redeem (public) — exchange code for device token
	app.post("/api/thin-client/pair/redeem", async (request, reply) => {
		const now = Date.now();
		pruneExpiredPairings(now);

		const parse = PairRedeemSchema.safeParse(request.body);
		if (!parse.success) {
			return clientError(reply, 400, formatZodError(parse.error), request.id);
		}
		const { code, label, platform, appVersion } = parse.data;

		const ticket = store.pairings.get(code);
		if (!ticket || ticket.expiresAt <= now) {
			store.pairings.delete(code);
			return clientError(reply, 404, "Invalid or expired pairing code", request.id);
		}

		const deviceId = `tc_dev_${randomUUID()}`;
		const deviceToken = `${DEVICE_TOKEN_PREFIX}${randomBytes(24).toString("hex")}`;
		const tokenHash = sha256(deviceToken);

		store.devices.set(deviceId, {
			id: deviceId,
			label: label ?? ticket.label,
			platform: platform ?? ticket.platform,
			appVersion,
			tokenHash,
			createdAt: now,
			lastSeenAt: now,
		});

		// Single-use: invalidate the code
		store.pairings.delete(code);
		ticket.redeemedBy = deviceId;

		recordAudit({
			action: "pair.redeem",
			actor: deviceId,
			detail: { code, label: label ?? null, platform: platform ?? null },
		});

		return reply.send({
			token: deviceToken,
			deviceId,
			expiresIn: 30 * 24 * 60 * 60, // 30 days
		});
	});

	// 11. GET /api/thin-client/approvals/:id (admin web session)
	app.get("/api/thin-client/approvals/:id", async (request, reply) => {
		const authError = requireAdmin(request);
		if (authError) return reply.code(401).send({ error: authError });

		const { id } = request.params as { id: string };
		const approval = store.approvals.get(id);
		if (!approval) {
			return clientError(reply, 404, "Approval not found", request.id);
		}

		return reply.send({ approval });
	});

	// 12. GET /api/thin-client/approvals/audit (admin web session)
	app.get("/api/thin-client/approvals/audit", async (request, reply) => {
		const authError = requireAdmin(request);
		if (authError) return reply.code(401).send({ error: authError });

		return reply.send({ entries: store.audit });
	});

	// 13. POST /api/thin-client/devices/revoke (admin web session)
	app.post("/api/thin-client/devices/revoke", async (request, reply) => {
		const authError = requireAdmin(request);
		if (authError) return reply.code(401).send({ error: authError });

		const parse = RevokeSchema.safeParse(request.body);
		if (!parse.success) {
			return clientError(reply, 400, formatZodError(parse.error), request.id);
		}
		const { deviceId, reason } = parse.data;

		const device = store.devices.get(deviceId);
		if (!device) {
			return clientError(reply, 404, "Device not found", request.id);
		}

		device.revokedAt = Date.now();
		device.revokedReason = reason;
		recordAudit({ action: "device.revoke", actor: "admin", detail: { deviceId } });

		return reply.send({ ok: true, deviceId });
	});
}
