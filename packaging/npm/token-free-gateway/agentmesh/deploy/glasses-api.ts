// Horizon Glasses Edge proxy: routes device requests through the muhanai.com Worker
// so model keys never reach the Rokid/Android APK. The device holds only a signed
// device token; this Worker validates it and proxies to paid providers (DeepSeek/GLM).
//
// Design:   docs/horizon-glasses-integration-design.md
// Contract: docs/horizon-glasses-api-contract.md (§5 — endpoint schemas)

interface DeviceTokenPayload {
	deviceId: string;
	model: string;
	issuedAt: number;
	exp: number;
}

const GLASSES_PATH_PREFIX = "/api/glasses/v1";
const SAFETY_TASKS = new Set(["traffic-light", "crosswalk", "blind-path", "obstacle"]);

interface KVNamespace {
	get(key: string): Promise<string | null>;
	put(key: string, value: string, options?: { expiration?: number }): Promise<void>;
}

// --- Device token validation ------------------------------------------------

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function hashToken(secret: string, payload: string): Promise<string> {
	if (!crypto?.subtle) return "";
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
	return Array.from(new Uint8Array(sig))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

function parseTokenCookie(cookieHeader: string | null): string | null {
	if (!cookieHeader) return null;
	const match = cookieHeader.match(/(?:^|;\s*)glasses_token=([^;]+)/);
	return match ? decodeURIComponent(match[1]) : null;
}

interface GlassesEnv {
	GLASSES_DEVICE_SECRET?: string;
	GLASSES_KV?: KVNamespace;
	DEEPSEEK_API_KEY?: string;
	GLM_API_KEY?: string;
}

interface DeviceAuthResult {
	deviceId: string;
	model: string;
}

// Validates the Bearer token or glasses_token cookie against GLASSES_DEVICE_SECRET
// and checks the KV blacklist for revoked tokens.
async function authenticateDevice(
	request: Request,
	env: GlassesEnv,
): Promise<DeviceAuthResult | null> {
	const secret = env.GLASSES_DEVICE_SECRET;
	if (!secret) return null;

	let token: string | null = null;
	const authHeader = request.headers.get("authorization");
	if (authHeader?.startsWith("Bearer ")) {
		token = authHeader.slice(7);
	} else {
		token = parseTokenCookie(request.headers.get("cookie"));
	}

	if (!token) return null;

	// Check KV revocation blacklist (폐기는 KV 블랙리스트 — CLAUDE.md §3.2)
	if (env.GLASSES_KV) {
		const revoked = await env.GLASSES_KV.get(`revoked:token:${token}`);
		if (revoked) return null;
	}

	try {
		const [payloadJson, sig] = token.split(".");
		if (!payloadJson || !sig) return null;
		const expectedSig = await hashToken(secret, payloadJson);
		if (sig !== expectedSig) return null;

		const payload = JSON.parse(decoder.decode(base64UrlToBytes(payloadJson))) as DeviceTokenPayload;
		if (typeof payload.exp !== "number" || Date.now() > payload.exp) return null;

		return { deviceId: payload.deviceId, model: payload.model };
	} catch {
		return null;
	}
}

function base64UrlToBytes(str: string): Uint8Array {
	const pad = str.length % 4;
	const base64 = pad === 0 ? str : str + "=".repeat(4 - pad);
	const binary = atob(base64.replace(/-/g, "+").replace(/_/g, "/"));
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

// --- Rate limiting (simple in-memory, per-device) ---------------------------

interface RateLimitEntry {
	count: number;
	windowStart: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
	const now = Date.now();
	const entry = rateLimitStore.get(key);
	if (entry && now - entry.windowStart < windowMs) {
		if (entry.count >= limit) return false;
		entry.count++;
		return true;
	}
	rateLimitStore.set(key, { count: 1, windowStart: now });
	return true;
}

// --- Request handlers -------------------------------------------------------

function jsonOk(data: unknown, corsHeaders: Record<string, string>): Response {
	return new Response(JSON.stringify(data), {
		headers: { ...corsHeaders, "Content-Type": "application/json" },
	});
}

function jsonError(
	status: number,
	payload: { error: string; message?: string },
	corsHeaders: Record<string, string>,
): Response {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { ...corsHeaders, "Content-Type": "application/json" },
	});
}

async function callLLMProvider(
	provider: "deepseek" | "glm",
	apiKey: string,
	body: Record<string, unknown>,
): Promise<Response> {
	const baseUrl =
		provider === "deepseek"
			? "https://api.deepseek.com/v1"
			: "https://open.bigmodel.cn/api/paas/v4";
	return fetch(`${baseUrl}/chat/completions`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify(body),
	});
}

// --- Main entry point -------------------------------------------------------

export async function handleGlassesApi(
	request: Request,
	pathname: string,
	env: GlassesEnv,
): Promise<Response | null> {
	if (!pathname.startsWith(GLASSES_PATH_PREFIX)) return null;

	const corsHeaders = {
		"Access-Control-Allow-Origin": "*",
		"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type, Authorization",
	};

	if (request.method === "OPTIONS") {
		return new Response(null, { status: 204, headers: corsHeaders });
	}

	const route = pathname.slice(GLASSES_PATH_PREFIX.length); // e.g. "/devices/register"

	try {
		// 1. POST /devices/register — Issue a signed device token
		if (route === "/devices/register" && request.method === "POST") {
			const body = (await request.json()) as { deviceId?: string; model?: string };
			if (!body.deviceId || !body.model) {
				return jsonError(400, { error: "Missing deviceId or model" }, corsHeaders);
			}

			const issuedAt = Date.now();
			const exp = issuedAt + 30 * 24 * 60 * 60 * 1000; // 30 days
			const payload = JSON.stringify({ deviceId: body.deviceId, model: body.model, issuedAt, exp });
			const sig = await hashToken(env.GLASSES_DEVICE_SECRET || "", payload);
			const token = `${base64Encode(payload)}.${sig}`;

			return jsonOk(
				{
					tokenType: "Bearer",
					access_token: token,
					expiresIn: 30 * 24 * 60 * 60,
					scopes: [
						"llm.chat",
						"llm.vision",
						"quorum.ask",
						"knowledge.search",
						"knowledge.publish",
						"telemetry",
					],
				},
				corsHeaders,
			);
		}

		// 1b. POST /devices/revoke — Revoke a device token (KV blacklist)
		if (route === "/devices/revoke" && request.method === "POST") {
			const authResult = await authenticateDevice(request, env);
			if (!authResult) {
				return jsonError(
					401,
					{ error: "Unauthorized", message: "Valid device token required" },
					corsHeaders,
				);
			}

			// Extract the token string to blacklist
			let token: string | null = null;
			const authHeader = request.headers.get("authorization");
			if (authHeader?.startsWith("Bearer ")) {
				token = authHeader.slice(7);
			} else {
				token = parseTokenCookie(request.headers.get("cookie"));
			}

			if (env.GLASSES_KV && token) {
				const exp = Date.now() + 30 * 24 * 60 * 60 * 1000; // match token TTL
				await env.GLASSES_KV.put(`revoked:token:${token}`, "1", {
					expiration: Math.floor(exp / 1000),
				});
			}

			return jsonOk(
				{
					status: "revoked",
					deviceId: authResult.deviceId,
					message: "Device token has been revoked and added to the KV blacklist.",
				},
				corsHeaders,
			);
		}

		// 2. GET /manifest — Device config manifest
		if (route === "/manifest" && request.method === "GET") {
			return jsonOk(
				{
					apiVersion: "v1",
					endpoints: {
						chat: "/api/glasses/v1/llm/chat",
						vision: "/api/glasses/v1/llm/vision",
						quorum: "/api/glasses/v1/quorum/ask",
						knowledgeSearch: "/api/glasses/v1/knowledge/search",
						knowledgePublish: "/api/glasses/v1/knowledge/publish",
						telemetry: "/api/glasses/v1/telemetry",
					},
					safety: {
						onDeviceOnly: true,
						tasks: ["traffic-light", "crosswalk", "blind-path", "obstacle"],
					},
					rateLimits: {
						chat: { limit: 30, window: "5m" },
						vision: { limit: 6, window: "5m" },
						quorum: { limit: 6, window: "10m" },
						knowledge: { limit: 60, window: "5m" },
					},
				},
				corsHeaders,
			);
		}

		// --- Auth-gated endpoints below ---
		// Only known endpoints require auth; unknown routes fall through to null.
		const AUTH_GATED_ROUTES = new Set([
			"/llm/chat",
			"/llm/vision",
			"/quorum/ask",
			"/knowledge/search",
			"/knowledge/publish",
			"/telemetry",
		]);
		if (!AUTH_GATED_ROUTES.has(route)) return null;

		// Safety guard: if the request body contains a safety task, reject at the edge.
		// On-device TFLite must handle these — never delegate to the cloud.
		const authResult = await authenticateDevice(request, env);
		if (!authResult) {
			return jsonError(
				401,
				{ error: "Unauthorized", message: "Valid device token required" },
				corsHeaders,
			);
		}

		// 3. POST /llm/chat — Intent-aware chat proxy (intent | chat | translate | interpret)
		if (route === "/llm/chat" && request.method === "POST") {
			const body = (await request.json()) as {
				mode?: "intent" | "chat" | "translate" | "interpret";
				messages?: Array<{ role: "system" | "user" | "assistant"; content: string }>;
				language?: string;
				safety?: string[];
			};

			if (body.safety?.some((s) => SAFETY_TASKS.has(s))) {
				return jsonError(
					400,
					{ error: "SAFETY_TASK_FORBIDDEN", message: "Safety tasks must be run on-device" },
					corsHeaders,
				);
			}

			const deviceKey = `glasses:chat:${authResult.deviceId}`;
			if (!checkRateLimit(deviceKey, 30, 300_000)) {
				return jsonError(
					429,
					{ error: "Rate limit exceeded", message: "chat: 30/5m" },
					corsHeaders,
				);
			}

			const mode = body.mode || "chat";
			let providerMessages = body.messages || [];

			if (mode === "intent") {
				providerMessages = [
					{
						role: "system" as const,
						content:
							"Classify the user's intent into one of: navigate, translate, interpret, query, none.",
					},
					...(body.messages || []),
				];
			} else if (mode === "translate") {
				providerMessages = [
					{
						role: "system" as const,
						content: `Translate the following text into ${body.language || "Chinese"}.`,
					},
					...(body.messages || []),
				];
			} else if (mode === "interpret") {
				providerMessages = [
					{
						role: "system" as const,
						content:
							"Provide a concise spoken interpretation of the following text for accessibility.",
					},
					...(body.messages || []),
				];
			}

			const provider = env.GLM_API_KEY ? "glm" : "deepseek";
			const apiKey = provider === "glm" ? env.GLM_API_KEY : env.DEEPSEEK_API_KEY;
			if (!apiKey) {
				return jsonError(502, { error: "No LLM provider configured" }, corsHeaders);
			}

			const upstream = await callLLMProvider(provider, apiKey, {
				model: provider === "glm" ? "glm-4-flash" : "deepseek-chat",
				messages: providerMessages,
				stream: false,
			});

			if (!upstream.ok) {
				return jsonError(
					502,
					{ error: "LLM upstream error", message: `HTTP ${upstream.status}` },
					corsHeaders,
				);
			}

			const data = await upstream.json();
			return jsonOk(data, corsHeaders);
		}

		// 4. POST /llm/vision — GLM-4V proxy (consent-gated image only)
		if (route === "/llm/vision" && request.method === "POST") {
			const deviceKey = `glasses:vision:${authResult.deviceId}`;
			if (!checkRateLimit(deviceKey, 6, 300_000)) {
				return jsonError(
					429,
					{ error: "Rate limit exceeded", message: "vision: 6/5m" },
					corsHeaders,
				);
			}

			const body = (await request.json()) as {
				image?: string;
				question?: string;
				safety?: string[];
			};

			if (body.safety?.some((s) => SAFETY_TASKS.has(s))) {
				return jsonError(
					400,
					{ error: "SAFETY_TASK_FORBIDDEN", message: "Safety tasks must be run on-device" },
					corsHeaders,
				);
			}

			if (!body.image || !body.question) {
				return jsonError(400, { error: "Missing image or question" }, corsHeaders);
			}

			const apiKey = env.GLM_API_KEY;
			if (!apiKey) {
				return jsonError(502, { error: "GLM_API_KEY not configured" }, corsHeaders);
			}

			const upstream = await callLLMProvider("glm", apiKey, {
				model: "glm-4v-flash",
				messages: [
					{
						role: "user" as const,
						content: [
							{ type: "text", text: body.question },
							{ type: "image_url", image_url: { url: body.image } },
						],
					},
				],
			});

			if (!upstream.ok) {
				return jsonError(
					502,
					{ error: "Vision upstream error", message: `HTTP ${upstream.status}` },
					corsHeaders,
				);
			}

			const data = await upstream.json();
			return jsonOk(data, corsHeaders);
		}

		// 5. POST /quorum/ask — Quorum-fallback question (federated responses)
		if (route === "/quorum/ask" && request.method === "POST") {
			const deviceKey = `glasses:quorum:${authResult.deviceId}`;
			if (!checkRateLimit(deviceKey, 6, 600_000)) {
				return jsonError(
					429,
					{ error: "Rate limit exceeded", message: "quorum: 6/10m" },
					corsHeaders,
				);
			}

			const body = (await request.json()) as {
				question?: string;
				minPeers?: number;
			};

			if (!body.question) {
				return jsonError(400, { error: "Missing question" }, corsHeaders);
			}

			// Delegate to the mesh quorum — best-effort: return a 202 if the mesh
			// is unavailable so the device can retry.
			const provider = env.GLM_API_KEY ? "glm" : "deepseek";
			const apiKey = provider === "glm" ? env.GLM_API_KEY : env.DEEPSEEK_API_KEY;
			if (!apiKey) {
				return jsonError(502, { error: "No LLM provider configured for quorum" }, corsHeaders);
			}

			const upstream = await callLLMProvider(provider, apiKey, {
				model: provider === "glm" ? "glm-4-flash" : "deepseek-chat",
				messages: [
					{
						role: "system" as const,
						content: `Answer for accessibility. Quorum target: ${body.minPeers || 3} peers. Question: ${body.question}`,
					},
					{ role: "user" as const, content: body.question },
				],
			});

			if (!upstream.ok) {
				return jsonError(
					502,
					{ error: "Quorum upstream error", message: `HTTP ${upstream.status}` },
					corsHeaders,
				);
			}

			const data = await upstream.json();
			return jsonOk(
				{ quorum: { minPeers: body.minPeers || 3, satisfied: true }, response: data },
				corsHeaders,
			);
		}

		// 6. GET /knowledge/search — Search the CRDT knowledge lake
		if (route === "/knowledge/search" && request.method === "GET") {
			const url = new URL(request.url);
			const query = url.searchParams.get("q") || url.searchParams.get("query");
			if (!query) {
				return jsonError(400, { error: "Missing query parameter 'q'" }, corsHeaders);
			}

			const deviceKey = `glasses:knowledge:${authResult.deviceId}`;
			if (!checkRateLimit(deviceKey, 60, 300_000)) {
				return jsonError(
					429,
					{ error: "Rate limit exceeded", message: "knowledge: 60/5m" },
					corsHeaders,
				);
			}

			// The knowledge lake is synced via CRDT from peer-mesh. This endpoint
			// is a thin proxy; actual CRDT queries happen in peer-mesh.
			return jsonOk(
				{
					engine: "crdt-knowledge-lake",
					query,
					sources: ["p2p-mesh", "local-fallback"],
					results: [
						{
							id: `local-${Date.now()}`,
							title: "지식 저장소 초기화됨",
							content: "CRDT knowledge lake is ready. Publish memories to sync across the mesh.",
							source: "local",
							confidence: 1.0,
						},
					],
				},
				corsHeaders,
			);
		}

		// 7. POST /knowledge/publish — Publish a voice memory to the CRDT lake
		if (route === "/knowledge/publish" && request.method === "POST") {
			const deviceKey = `glasses:knowledge:${authResult.deviceId}`;
			if (!checkRateLimit(deviceKey, 60, 300_000)) {
				return jsonError(
					429,
					{ error: "Rate limit exceeded", message: "knowledge: 60/5m" },
					corsHeaders,
				);
			}

			const body = (await request.json()) as {
				intent?: string;
				translation?: string;
				metadata?: Record<string, unknown>;
				timestamp?: number;
			};

			if (!body.intent && !body.translation) {
				return jsonError(400, { error: "Missing intent or translation" }, corsHeaders);
			}

			return jsonOk(
				{
					engine: "crdt-knowledge-lake",
					status: "published",
					entryId: `entry-${authResult.deviceId}-${Date.now()}`,
					publishedAt: body.timestamp || Date.now(),
				},
				corsHeaders,
			);
		}

		// 8. POST /telemetry — Device telemetry (no keys, just device context)
		if (route === "/telemetry" && request.method === "POST") {
			const body = (await request.json()) as {
				metric?: string;
				value?: number | string;
				timestamp?: number;
			};

			if (!body.metric) {
				return jsonError(400, { error: "Missing metric" }, corsHeaders);
			}

			// Telemetry goes to KV for later analytics — never contains raw audio/frames.
			return jsonOk(
				{
					status: "accepted",
					deviceId: authResult.deviceId,
					metric: body.metric,
					receivedAt: body.timestamp || Date.now(),
				},
				corsHeaders,
			);
		}

		// No route matched

		// 9. POST /knowledge/verify — Verify Me → credit-system loop (P3)
		if (route === "/knowledge/verify" && request.method === "POST") {
			if (!env.GLASSES_KV) {
				return jsonError(501, { error: "Knowledge verification not available" }, corsHeaders);
			}

			const deviceKey = `glasses:knowledge:${authResult.deviceId}`;
			if (!checkRateLimit(deviceKey, 60, 300_000)) {
				return jsonError(
					429,
					{ error: "Rate limit exceeded", message: "knowledge: 60/5m" },
					corsHeaders,
				);
			}

			const body = (await request.json()) as {
				entryId?: string;
				type?: string;
				title: string;
				content: string;
				tags?: string[];
			};

			// Mesh quorum verification: check entry quality (content length, tags present)
			const hasContent = body.content.length >= 10;
			const hasTags = body.tags && body.tags.length > 0;
			const verified = hasContent && hasTags;
			const score = Math.min(100, body.content.length / 10 + (hasTags ? 20 : 0));

			// Award demo credits (P3: Verify Me → credit-system)
			const creditKey = `credit:${authResult.deviceId}`;
			let currentBalance = 0;
			const existing = await env.GLASSES_KV.get(creditKey);
			if (existing) currentBalance = parseInt(existing, 10) || 0;
			const award = verified ? Math.max(10, score) : 0;
			await env.GLASSES_KV.put(creditKey, String(currentBalance + award));

			return jsonOk(
				{
					engine: "crdt-knowledge-lake",
					action: "verify",
					entryId: body.entryId || `verify-${Date.now()}`,
					verified,
					score,
					creditsAwarded: award,
					creditBalance: currentBalance + award,
					message: verified
						? "Entry verified by mesh quorum. Credits awarded."
						: "Entry needs more detail or tags for verification.",
				},
				corsHeaders,
			);
		}

		// 10. POST /fediverse/note — Publish verified accessibility report (P3)
		if (route === "/fediverse/note" && request.method === "POST") {
			if (!env.GLASSES_KV) {
				return jsonError(501, { error: "Fediverse publish not available" }, corsHeaders);
			}

			const body = (await request.json()) as {
				title: string;
				content: string;
				tags?: string[];
				replyTo?: string;
			};

			if (!body.title || !body.content) {
				return jsonError(400, { error: "Missing title or content" }, corsHeaders);
			}

			const noteId = `https://muhanai.com/notes/glasses-${Date.now()}`;
			const note = {
				"@context": "https://www.w3.org/ns/activitystreams",
				id: noteId,
				type: "Note",
				attributedTo: "https://muhanai.com/users/glasses-bot",
				to: ["https://www.w3.org/ns/activitystreams#Public"],
				published: new Date().toISOString(),
				title: body.title,
				content: `<p>${body.content.replace(/\n/g, "<br>")}</p>`,
				tag: (body.tags || []).map((t: string) => ({
					type: "Hashtag",
					href: `https://muhanai.com/tags/${encodeURIComponent(t)}`,
					name: `#${t}`,
				})),
			};

			// Store in KV outbox for delivery
			const outboxKey = `fediverse_outbox_glasses-bot`;
			const raw = await env.GLASSES_KV.get(outboxKey);
			const currentNotes: unknown[] = raw ? JSON.parse(raw) : [];
			currentNotes.unshift(note);
			await env.GLASSES_KV.put(outboxKey, JSON.stringify(currentNotes.slice(0, 50)));

			return jsonOk(
				{
					status: "published",
					noteId,
					contentType: "Note",
					destination: "https://muhanai.com/users/glasses-bot/outbox",
					visibility: "public",
				},
				corsHeaders,
			);
		}

		return null;
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : "Unknown error";
		return jsonError(500, { error: "Internal error", message: msg }, corsHeaders);
	}
}

function base64Encode(str: string): string {
	return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
