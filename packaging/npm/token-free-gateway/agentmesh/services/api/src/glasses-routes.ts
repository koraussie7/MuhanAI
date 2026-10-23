/**
 * Horizon Glasses device API — `/api/glasses/v1/*`.
 *
 * Ported from `deploy/glasses-api.ts`, which was written for the Cloudflare
 * Workers runtime (KVNamespace, `env.*` secrets, a `Request`/`Response`
 * handler). This version runs on the Fastify server that actually serves
 * muhanai.com, so the device flows work without a separate edge deploy.
 *
 * Design:   docs/horizon-glasses/CLAUDE.md (unchanged)
 * Contract: docs/horizon-glasses-api-contract.md (§5 — endpoint schemas)
 *
 * Load-bearing rules from the design doc:
 *   - safety judgement (traffic light, crosswalk, blind path, obstacle) is
 *     on-device TFLite only; the server rejects those requests outright
 *   - model keys never leave the server
 *   - only text and consenting stills (<=512KB) are accepted, never raw audio
 *     or continuous frames
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { clientError } from "./error-shapes.js";

const PREFIX = "/api/glasses/v1";

/** On-device only. The server must refuse these even if a client asks. */
const SAFETY_TASKS = new Set(["traffic-light", "crosswalk", "blind-path", "obstacle"]);

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Upstream images are capped at 512KB by the contract (§llm/vision). */
const MAX_IMAGE_BYTES = 512 * 1024;

interface DeviceTokenPayload {
	deviceId: string;
	model: string;
	issuedAt: number;
	exp: number;
}

// ---------------------------------------------------------------------------
// Revocation store
//
// Workers used KV. KV existed here only as a blacklist, so a small JSON file
// replaces it: the set is tiny, lives across restarts, and needs no new
// dependency. Entries expire on read so the file cannot grow without bound.
// ---------------------------------------------------------------------------
// Resolved per call, not at module load: tests point this at a temp file and
// an operator can move it without a restart.
function revokedFile(): string {
	return process.env.GLASSES_REVOKED_FILE ?? "/var/lib/muhanai/glasses-revoked.json";
}

function readRevoked(): Record<string, number> {
	try {
		const parsed = JSON.parse(readFileSync(revokedFile(), "utf8")) as unknown;
		if (parsed && typeof parsed === "object") return parsed as Record<string, number>;
	} catch {
		/* absent or unreadable — treat as empty */
	}
	return {};
}

function isRevoked(token: string): boolean {
	const entries = readRevoked();
	const exp = entries[token];
	if (exp === undefined) return false;
	if (exp < Date.now()) return false;
	return true;
}

function revoke(token: string, exp: number): void {
	try {
		const entries = readRevoked();
		entries[token] = exp;
		for (const [key, value] of Object.entries(entries)) {
			if (value < Date.now()) delete entries[key];
		}
		writeFileSync(revokedFile(), JSON.stringify(entries), "utf8");
	} catch {
		/* best effort — a failed write must not fail the request */
	}
}

// ---------------------------------------------------------------------------
// Tokens: base64url(payload).hex(hmac_sha256(payload))
// ---------------------------------------------------------------------------
function sign(secret: string, payload: string): string {
	return createHmac("sha256", secret).update(payload).digest("hex");
}

function issueToken(secret: string, payload: DeviceTokenPayload): string {
	const body = JSON.stringify(payload);
	return `${Buffer.from(body, "utf8").toString("base64url")}.${sign(secret, body)}`;
}

function verifyToken(secret: string, token: string): DeviceTokenPayload | null {
	const dot = token.lastIndexOf(".");
	if (dot <= 0) return null;

	const encoded = token.slice(0, dot);
	const provided = token.slice(dot + 1);
	let body: string;
	try {
		body = Buffer.from(encoded, "base64url").toString("utf8");
	} catch {
		return null;
	}

	const expected = sign(secret, body);
	// Constant-time compare; unequal lengths would throw.
	const a = Buffer.from(provided, "utf8");
	const b = Buffer.from(expected, "utf8");
	if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

	let payload: DeviceTokenPayload;
	try {
		payload = JSON.parse(body) as DeviceTokenPayload;
	} catch {
		return null;
	}
	if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
	if (isRevoked(token)) return null;
	return payload;
}

function deviceSecret(): string | null {
	const secret = process.env.GLASSES_DEVICE_SECRET;
	return secret && secret.length > 0 ? secret : null;
}

function bearerFrom(request: FastifyRequest): string | null {
	const header = request.headers.authorization;
	if (typeof header === "string" && header.startsWith("Bearer ")) return header.slice(7);
	const cookie = request.headers.cookie;
	if (typeof cookie === "string") {
		const match = cookie.match(/(?:^|;\s*)glasses_token=([^;]+)/);
		if (match?.[1]) return decodeURIComponent(match[1]);
	}
	return null;
}

type Device = DeviceTokenPayload & { token: string };

function authenticate(request: FastifyRequest): Device | null {
	const secret = deviceSecret();
	if (!secret) return null;
	const token = bearerFrom(request);
	if (!token) return null;
	const payload = verifyToken(secret, token);
	if (!payload) return null;
	return { ...payload, token };
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------
const RegisterSchema = z.object({
	deviceId: z.string().min(1).max(128),
	model: z.string().min(1).max(128),
});

const ChatSchema = z.object({
	/** on-device intent, chat, translate or interpret */
	mode: z.enum(["intent", "chat", "translate", "interpret"]).default("chat"),
	messages: z
		.array(
			z.object({
				role: z.enum(["system", "user", "assistant"]),
				content: z.string().min(1).max(16_000),
			}),
		)
		.min(1)
		.max(32),
	/** Safety requests are refused, never forwarded upstream. */
	task: z.string().max(64).optional(),
});

const VisionSchema = z.object({
	/** Data URL or bare base64. Only stills are accepted. */
	image: z.string().min(1),
	prompt: z.string().max(2_000).optional(),
	/** Explicit consent is required by the design doc (§privacy). */
	consent: z.literal(true),
});

export async function glassesRoutes(app: FastifyInstance) {
	const base = `${PREFIX}`;

	// GET /manifest — device config. Public: a fresh device needs this before
	// it can register.
	app.get(`${base}/manifest`, async () => ({
		schemaVersion: 1,
		apiBase: `${base}`,
		auth: { type: "bearer", ttlSeconds: Math.floor(TOKEN_TTL_MS / 1000) },
		limits: {
			llmChat: { requests: 30, windowSeconds: 300 },
			llmVision: { requests: 6, windowSeconds: 300 },
			quorumAsk: { requests: 6, windowSeconds: 600 },
			knowledge: { requests: 60, windowSeconds: 300 },
			telemetry: { requests: 600, windowSeconds: 300 },
			maxImageBytes: MAX_IMAGE_BYTES,
		},
		modes: ["intent", "chat", "translate", "interpret"],
		/** Clients must run these locally; the server will reject them. */
		onDeviceOnly: [...SAFETY_TASKS],
	}));

	// POST /devices/register — issue a signed device token.
	// Requires the server secret to be configured; otherwise the endpoint would
	// hand out tokens signed with an empty key.
	app.post(`${base}/devices/register`, async (request, reply) => {
		const secret = deviceSecret();
		if (!secret) {
			return clientError(reply, 503, "GLASSES_DEVICE_SECRET is not configured", request.id);
		}

		const parse = RegisterSchema.safeParse(request.body);
		if (!parse.success) {
			return clientError(reply, 400, "Missing deviceId or model", request.id);
		}

		const issuedAt = Date.now();
		const payload: DeviceTokenPayload = {
			deviceId: parse.data.deviceId,
			model: parse.data.model,
			issuedAt,
			exp: issuedAt + TOKEN_TTL_MS,
		};
		const token = issueToken(secret, payload);

		return {
			tokenType: "Bearer",
			access_token: token,
			expiresIn: Math.floor(TOKEN_TTL_MS / 1000),
			scopes: [
				"llm.chat",
				"llm.vision",
				"quorum.ask",
				"knowledge.search",
				"knowledge.publish",
				"telemetry",
			],
		};
	});

	// POST /devices/revoke — blacklist the presented token until it expires.
	app.post(`${base}/devices/revoke`, async (request, reply) => {
		const device = authenticate(request);
		if (!device) return unauthorized(reply, request.id);

		revoke(device.token, device.exp);
		return {
			status: "revoked",
			deviceId: device.deviceId,
			message: "Device token revoked.",
		};
	});

	// POST /llm/chat — text only. Refuses on-device safety judgement.
	app.post(`${base}/llm/chat`, async (request, reply) => {
		const device = authenticate(request);
		if (!device) return unauthorized(reply, request.id);

		const parse = ChatSchema.safeParse(request.body);
		if (!parse.success) return clientError(reply, 400, "Invalid chat request", request.id);

		const { task, messages, mode } = parse.data;
		if (task && SAFETY_TASKS.has(task)) {
			// Design invariant: these never go to the network.
			return clientError(
				reply,
				400,
				"SAFETY_TASK_FORBIDDEN: safety judgement must run on-device",
				request.id,
			);
		}

		const upstream = process.env.DEEPSEEK_API_KEY
			? { base: "https://api.deepseek.com/v1", key: process.env.DEEPSEEK_API_KEY, model: "deepseek-chat" }
			: process.env.GLM_API_KEY
				? { base: "https://open.bigmodel.cn/api/paas/v4", key: process.env.GLM_API_KEY, model: "glm-4-flash" }
				: process.env.GROQ_API_KEY
					? { base: "https://api.groq.com/openai/v1", key: process.env.GROQ_API_KEY, model: "openai/gpt-oss-120b" }
					: null;

		if (!upstream) {
			return clientError(reply, 502, "No upstream LLM key configured", request.id);
		}

		const systemByMode: Record<string, string> = {
			intent: "Classify the user's intent in one short line. Answer with the intent only.",
			translate: "Translate the user's text faithfully. Return only the translation.",
			interpret: "Interpret what the user is looking at, concisely.",
			chat: "You are a concise assistant on AR glasses. Answer in two sentences at most.",
		};

		try {
			const res = await fetch(`${upstream.base}/chat/completions`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					authorization: `Bearer ${upstream.key}`,
				},
				body: JSON.stringify({
					model: upstream.model,
					messages: [{ role: "system", content: systemByMode[mode] }, ...messages],
					max_tokens: 512,
				}),
				signal: AbortSignal.timeout(20_000),
			});
			if (!res.ok) {
				return clientError(reply, 502, `Upstream returned ${res.status}`, request.id);
			}
			const data = (await res.json()) as {
				choices?: Array<{ message?: { content?: string } }>;
			};
			const content = data.choices?.[0]?.message?.content ?? "";
			return { mode, deviceId: device.deviceId, reply: content, model: upstream.model };
		} catch {
			return clientError(reply, 502, "Upstreams error", request.id);
		}
	});

	// POST /llm/vision — a single consenting still, never continuous frames.
	app.post(`${base}/llm/vision`, async (request, reply) => {
		const device = authenticate(request);
		if (!device) return unauthorized(reply, request.id);

		const parse = VisionSchema.safeParse(request.body);
		if (!parse.success) {
			return clientError(
				reply,
				400,
				"Invalid vision request (consent: true required)",
				request.id,
			);
		}

		const b64 = parse.data.image.replace(/^data:image\/[a-z]+;base64,/, "");
		const bytes = Buffer.byteLength(b64, "base64");
		if (bytes > MAX_IMAGE_BYTES) {
			return clientError(reply, 413, `Image exceeds ${MAX_IMAGE_BYTES} bytes`, request.id);
		}

		// Vision needs a multimodal upstream. None is configured here, so this is
		// reported honestly rather than silently degrading to a text model.
		return clientError(
			reply,
			502,
			"No vision-capable upstream configured",
			request.id,
		);
	});

	// POST /telemetry — metrics only. Raw media is rejected by the schema.
	app.post(`${base}/telemetry`, async (request, reply) => {
		const device = authenticate(request);
		if (!device) return unauthorized(reply, request.id);
		const body = (request.body ?? {}) as Record<string, unknown>;
		if ("audio" in body || "frames" in body) {
			return clientError(reply, 400, "Raw media is not accepted", request.id);
		}
		return { ok: true, deviceId: device.deviceId, receivedAt: new Date().toISOString() };
	});
}

function unauthorized(reply: FastifyReply, requestId: string) {
	return clientError(reply, 401, "Valid device token required", requestId);
}
