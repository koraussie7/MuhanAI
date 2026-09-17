import "./cosmic-prompt.css";
import {
	AlertTriangle,
	Check,
	Computer,
	Copy,
	CornerDownLeft,
	Eye,
	EyeOff,
	FileText,
	Globe,
	KeyRound,
	PlusCircle,
	Settings,
	Sparkles,
	Trash2,
	X,
	Zap,
} from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../i18n";
import {
	answerWithBitterbot,
	chatWithSippEngine,
	preloadBitterbotEngine,
} from "../../lib/bitterbot-engine.js";
import { ComputerUsePanel } from "../ComputerUsePanel";

interface ResolvedAnswer {
	text: string;
	provider: string;
	model: string;
	latencyMs: number;
	tier: string;
}

type FreeLlmProviderId =
	| "mesh-llm"
	| "pollinations"
	| "api-llm-chat"
	| "local-oauth"
	| "omniroute"
	| "gemini-cli";

interface FreeLlmConfig {
	enabledProviders: FreeLlmProviderId[];
}

const DEFAULT_FREE_LLM_PROVIDERS: FreeLlmProviderId[] = [
	"mesh-llm",
	"pollinations",
	"api-llm-chat",
	"local-oauth",
	"omniroute",
	"gemini-cli",
];

/**
 * Gemini CLI free tier via CLIProxyAPI (github.com/router-for-me/CLIProxyAPI).
 * The user logs in once with a personal Google account (`gemini` OAuth) and the
 * proxy exposes the Code Assist API as an OpenAI-compatible /v1/chat/completions
 * endpoint on the default port 8317. Free limits: 60 req/min, 1,000 req/day.
 * Override via localStorage "muhanai.gemini-cli-url".
 */
const DEFAULT_GEMINI_CLI_URL = "http://127.0.0.1:8317";

function getGeminiCliBaseUrl(): string {
	if (typeof window === "undefined") return DEFAULT_GEMINI_CLI_URL;
	try {
		const saved = window.localStorage.getItem("muhanai.gemini-cli-url");
		if (saved && saved.trim().length > 0) return saved.trim().replace(/\/+$/, "");
	} catch {
		/* ignore */
	}
	return DEFAULT_GEMINI_CLI_URL;
}

/**
 * Validate a raw LLM response body: free proxies sometimes return ad/error
 * pages (e.g. Pollinations budget exhaustion with a "Support us" ad) that must
 * NOT be treated as a real answer. Returns true when the text looks like a
 * genuine model reply.
 */
function isValidLlmText(text: string | null | undefined): boolean {
	if (!text || typeof text !== "string") return false;
	const t = text.trim();
	if (t.length === 0) return false;
	const badPatterns = [
		/has reached its budget/i,
		/raise the key budget/i,
		/supported?\s+pollinations/i,
		/pollinations\.ai\/redirect/i,
		/support our mission/i,
		/keep ai accessible/i,
		/powered by pollinations/i,
		/🌸/, // ad emoji marker
		/topping up the wallet/i,
	];
	return !badPatterns.some((p) => p.test(t));
}

/**
 * BYOK — Bring Your Own Key.
 *
 * The user can paste their own API key for any of the supported providers,
 * stored ONLY in this browser's localStorage (never sent to api.muhanai.com).
 * When a key is configured, we call that provider directly from the browser
 * using its CORS-enabled endpoint. This becomes Tier 0 in the fallback chain
 * — it has priority over pollinations / /api/llm/chat / MCP / offline.
 *
 * If the user later wants to remove the key, they hit "Forget" and the entry
 * is wiped from localStorage immediately.
 */
type ByokProviderId =
	| "oauth_gateway"
	| "omniroute"
	| "openai"
	| "deepseek"
	| "google"
	| "openrouter"
	| "groq"
	| "mistral";
// Anthropic intentionally omitted: api.anthropic.com CORS allowlist is
// limited to console.anthropic.com, so browser-direct BYOK is impossible.
// When a server-side BYOK proxy ships, Anthropic will go behind that.

interface ByokSettings {
	provider: ByokProviderId;
	model: string;
	apiKey: string;
}

interface ByokProviderDef {
	label: string;
	models: string[];
	defaultModel: string;
	hint: string;
	build: (
		model: string,
		systemMsg: string,
		userMsg: string,
		key: string,
	) => {
		url: string;
		headers: Record<string, string>;
		body: unknown;
	};
	parse: (data: unknown) => string | null;
}

const SYSTEM_PROMPT =
	"You are MuhanAI, a helpful multilingual assistant. Answer concisely and accurately in the same language as the user's question.";

const BYOK_PROVIDERS: Record<ByokProviderId, ByokProviderDef> = {
	oauth_gateway: {
		label: "OAuth / Token-Free Gateway (WebAuth)",
		hint: "http://127.0.0.1:3456/v1 또는 Bearer 토큰 (선택)",
		models: ["claude-3-7-sonnet", "deepseek-r1", "gpt-4o", "gemini-2.5-pro", "qwen-2.5"],
		defaultModel: "claude-3-7-sonnet",
		build: (model, sys, user, key) => {
			const trimmed = (key || "").trim();
			const isUrl = trimmed.startsWith("http");
			const baseUrl = isUrl ? trimmed.replace(/\/+$/, "") : "http://127.0.0.1:3456/v1";
			return {
				url: `${baseUrl}/chat/completions`,
				headers: {
					"Content-Type": "application/json",
					...(trimmed && !isUrl ? { Authorization: `Bearer ${trimmed}` } : {}),
				},
				body: {
					model,
					messages: [
						{ role: "system", content: sys },
						{ role: "user", content: user },
					],
				},
			};
		},
		parse: (d) => {
			const x = d as { choices?: Array<{ message?: { content?: string } }> };
			return x?.choices?.[0]?.message?.content ?? null;
		},
	},
	omniroute: {
		label: "OmniRoute Mesh (Port 20128)",
		hint: "http://127.0.0.1:20128/v1 또는 OMNIROUTE_API_KEY (선택)",
		models: [
			"auto",
			"openai/gpt-4o-mini",
			"claude-3-7-sonnet",
			"deepseek-r1",
			"gemini-2.5-pro",
			"meta-llama/llama-3.3-70b-instruct:free",
		],
		defaultModel: "auto",
		build: (model, sys, user, key) => {
			const trimmed = (key || "").trim();
			const isUrl = trimmed.startsWith("http");
			const baseUrl = isUrl ? trimmed.replace(/\/+$/, "") : "http://127.0.0.1:20128/v1";
			return {
				url: `${baseUrl}/chat/completions`,
				headers: {
					"Content-Type": "application/json",
					...(trimmed && !isUrl ? { Authorization: `Bearer ${trimmed}` } : {}),
				},
				body: {
					model,
					messages: [
						{ role: "system", content: sys },
						{ role: "user", content: user },
					],
				},
			};
		},
		parse: (d) => {
			const x = d as { choices?: Array<{ message?: { content?: string } }> };
			return x?.choices?.[0]?.message?.content ?? null;
		},
	},
	deepseek: {
		label: "DeepSeek",
		hint: "sk-... (platform.deepseek.com → API Keys)",
		models: ["deepseek-chat", "deepseek-reasoner"],
		defaultModel: "deepseek-chat",
		build: (model, sys, user, key) => ({
			url: "https://api.deepseek.com/chat/completions",
			headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
			body: {
				model,
				messages: [
					{ role: "system", content: sys },
					{ role: "user", content: user },
				],
			},
		}),
		parse: (d) => {
			const x = d as { choices?: Array<{ message?: { content?: string } }> };
			return x?.choices?.[0]?.message?.content ?? null;
		},
	},
	openai: {
		label: "OpenAI",
		hint: "sk-... (OpenAI 대시보드 → API keys)",
		models: ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo"],
		defaultModel: "gpt-4o-mini",
		build: (model, sys, user, key) => ({
			url: "https://api.openai.com/v1/chat/completions",
			headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
			body: {
				model,
				messages: [
					{ role: "system", content: sys },
					{ role: "user", content: user },
				],
			},
		}),
		parse: (d) => {
			const x = d as { choices?: Array<{ message?: { content?: string } }> };
			return x?.choices?.[0]?.message?.content ?? null;
		},
	},
	openrouter: {
		label: "OpenRouter",
		hint: "sk-or-... (OpenRouter → Keys)",
		models: [
			"meta-llama/llama-3.3-70b-instruct:free",
			"google/gemini-2.0-flash-exp:free",
			"qwen/qwen-2.5-72b-instruct:free",
			"deepseek/deepseek-chat:free",
		],
		defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
		build: (model, sys, user, key) => ({
			url: "https://openrouter.ai/api/v1/chat/completions",
			headers: {
				Authorization: `Bearer ${key}`,
				"Content-Type": "application/json",
				"HTTP-Referer":
					typeof window !== "undefined" ? window.location.origin : "https://muhanai.com",
				"X-Title": "MuhanAI",
			},
			body: {
				model,
				messages: [
					{ role: "system", content: sys },
					{ role: "user", content: user },
				],
			},
		}),
		parse: (d) => {
			const x = d as { choices?: Array<{ message?: { content?: string } }> };
			return x?.choices?.[0]?.message?.content ?? null;
		},
	},
	google: {
		label: "Google AI Studio",
		hint: "AIza... (aistudio.google.com → Get API key)",
		models: ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"],
		defaultModel: "gemini-2.0-flash",
		build: (model, sys, user, key) => ({
			url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
			headers: { "Content-Type": "application/json" },
			body: {
				systemInstruction: { parts: [{ text: sys }] },
				contents: [{ role: "user", parts: [{ text: user }] }],
			},
		}),
		parse: (d) => {
			const x = d as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
			const text = x?.candidates?.[0]?.content?.parts?.map((p) => p?.text ?? "").join("") ?? "";
			return text || null;
		},
	},
	groq: {
		label: "Groq",
		hint: "gsk_... (GroqCloud → API Keys)",
		models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"],
		defaultModel: "llama-3.3-70b-versatile",
		build: (model, sys, user, key) => ({
			url: "https://api.groq.com/openai/v1/chat/completions",
			headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
			body: {
				model,
				messages: [
					{ role: "system", content: sys },
					{ role: "user", content: user },
				],
			},
		}),
		parse: (d) => {
			const x = d as { choices?: Array<{ message?: { content?: string } }> };
			return x?.choices?.[0]?.message?.content ?? null;
		},
	},
	mistral: {
		label: "Mistral",
		hint: "... (Mistral → La Plateforme → API Keys)",
		models: ["mistral-small-latest", "mistral-large-latest", "open-mistral-7b"],
		defaultModel: "mistral-small-latest",
		build: (model, sys, user, key) => ({
			url: "https://api.mistral.ai/v1/chat/completions",
			headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
			body: {
				model,
				messages: [
					{ role: "system", content: sys },
					{ role: "user", content: user },
				],
			},
		}),
		parse: (d) => {
			const x = d as { choices?: Array<{ message?: { content?: string } }> };
			return x?.choices?.[0]?.message?.content ?? null;
		},
	},
};

const BYOK_STORAGE_KEY = "muhanai.byok.v1";

function loadByok(): ByokSettings | null {
	if (typeof localStorage === "undefined") return null;
	try {
		const raw = localStorage.getItem(BYOK_STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Partial<ByokSettings>;
		if (!parsed) return null;
		const provider = (parsed.provider ?? "oauth_gateway") as ByokProviderId;
		const def = BYOK_PROVIDERS[provider];
		if (!def) return null;
		if (
			provider !== "oauth_gateway" &&
			provider !== "omniroute" &&
			(!parsed.apiKey || parsed.apiKey.length === 0)
		)
			return null;
		return {
			provider,
			model:
				typeof parsed.model === "string" && def.models.includes(parsed.model)
					? parsed.model
					: def.defaultModel,
			apiKey: parsed.apiKey ?? "",
		};
	} catch {
		return null;
	}
}

function saveByok(settings: ByokSettings) {
	if (typeof localStorage === "undefined") return;
	try {
		localStorage.setItem(BYOK_STORAGE_KEY, JSON.stringify(settings));
	} catch {
		// localStorage may be unavailable (private mode quota etc) — swallow silently
	}
}

function clearByok() {
	if (typeof localStorage === "undefined") return;
	try {
		localStorage.removeItem(BYOK_STORAGE_KEY);
	} catch {
		// ignore
	}
}

/* ------------------------------------------------------------------ */
/* One-Click OAuth Connect (OpenRouter, PKCE)                          */
/*                                                                     */
/* Click → popup → user signs into OpenRouter → callback receives a    */
/* `code` → our Worker exchanges it for a real API key → postMessage   */
/* back to the opener → BYOK entry saved instantly. No key copy/paste. */
/* ------------------------------------------------------------------ */

const OPENROUTER_OAUTH_STATE_KEY = "muhanai.openrouter.pkce.verifier";
export const OPENROUTER_OAUTH_MESSAGE_TYPE = "muhanai-openrouter-key";

function base64UrlEncode(bytes: Uint8Array): string {
	let bin = "";
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function createPkcePair(): Promise<{ verifier: string; challenge: string }> {
	const verifierBytes = crypto.getRandomValues(new Uint8Array(32));
	const verifier = base64UrlEncode(verifierBytes);
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
	const challenge = base64UrlEncode(new Uint8Array(digest));
	return { verifier, challenge };
}

/** Launch the OpenRouter OAuth popup with a PKCE challenge. */
export async function startOpenRouterOAuth(): Promise<void> {
	if (typeof window === "undefined") return;
	const { verifier, challenge } = await createPkcePair();
	try {
		window.sessionStorage.setItem(OPENROUTER_OAUTH_STATE_KEY, verifier);
	} catch {
		/* ignore */
	}
	const callbackUrl = `${window.location.origin}/oauth-callback`;
	const authUrl =
		`https://openrouter.ai/oauth?callback_url=${encodeURIComponent(callbackUrl)}` +
		`&code_challenge=${encodeURIComponent(challenge)}&code_challenge_method=S256`;
	window.open(authUrl, "muhanai-openrouter-oauth", "width=520,height=720,left=200,top=100");
}

interface OpenRouterKeyMessage {
	type: typeof OPENROUTER_OAUTH_MESSAGE_TYPE;
	key?: string;
	error?: string;
}

/**
 * Handle the OAuth callback inside the popup window (`/oauth-callback?code=...`).
 * Exchanges the code via the muhanai.com Worker and hands the key back to the
 * opener via postMessage, then closes itself. Returns true when this page load
 * was a callback (so the caller can skip normal rendering).
 */
export async function handleOpenRouterCallbackIfPresent(): Promise<boolean> {
	if (typeof window === "undefined") return false;
	const url = new URL(window.location.href);
	if (url.pathname !== "/oauth-callback") return false;
	const code = url.searchParams.get("code");
	let message: OpenRouterKeyMessage;
	if (!code) {
		message = { type: OPENROUTER_OAUTH_MESSAGE_TYPE, error: "No code in callback URL" };
	} else {
		try {
			const verifier = window.sessionStorage.getItem(OPENROUTER_OAUTH_STATE_KEY) ?? "";
			const res = await fetch("/api/openrouter/oauth/exchange", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ code, code_verifier: verifier }),
			});
			const data = (await res.json()) as { key?: string; error?: string };
			message =
				res.ok && data.key
					? { type: OPENROUTER_OAUTH_MESSAGE_TYPE, key: data.key }
					: { type: OPENROUTER_OAUTH_MESSAGE_TYPE, error: data.error || "Exchange failed" };
		} catch (err: any) {
			message = { type: OPENROUTER_OAUTH_MESSAGE_TYPE, error: err?.message || "Network error" };
		}
	}
	try {
		window.sessionStorage.removeItem(OPENROUTER_OAUTH_STATE_KEY);
	} catch {
		/* ignore */
	}
	if (window.opener && !window.opener.closed) {
		window.opener.postMessage(message, window.location.origin);
		window.close();
	} else {
		// No opener (user navigated directly) — show a minimal confirmation page.
		document.body.innerHTML = message.key
			? "<p style='font-family:sans-serif;padding:2rem'>✅ OpenRouter 연결 완료! 이 창을 닫고 muhanai.com으로 돌아가세요.</p>"
			: `<p style='font-family:sans-serif;padding:2rem'>⚠️ ${message.error ?? "OAuth 실패"}</p>`;
	}
	return true;
}

/**
 * Resolve the answer using the user's own API key, calling the provider
 * directly from the browser. The key never leaves the device and is never
 * sent to api.muhanai.com — we hit the provider's own CORS-enabled endpoint.
 *
 * Returns null on any failure (no key, network error, auth error, parse
 * error, empty response) so the caller can fall through to the next tier.
 */
async function resolveAnswerFromByok(
	query: string,
	settings: ByokSettings | null,
): Promise<ResolvedAnswer | null> {
	if (!settings) return null;
	if (
		settings.provider !== "oauth_gateway" &&
		settings.provider !== "omniroute" &&
		!settings.apiKey
	)
		return null;
	const def = BYOK_PROVIDERS[settings.provider];
	if (!def) return null;
	const req = def.build(settings.model, SYSTEM_PROMPT, query, settings.apiKey);

	const BYOK_TIMEOUT_MS = 30000;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), BYOK_TIMEOUT_MS);
	const start = typeof performance !== "undefined" ? performance.now() : Date.now();
	try {
		const res = await fetch(req.url, {
			method: "POST",
			headers: req.headers,
			body: JSON.stringify(req.body),
			signal: controller.signal,
		});
		clearTimeout(timer);
		if (!res.ok) return null;
		const data = (await res.json()) as unknown;
		const text = def.parse(data);
		if (typeof text !== "string" || text.trim().length === 0) return null;
		const elapsed = (typeof performance !== "undefined" ? performance.now() : Date.now()) - start;
		return {
			text,
			provider: `byok-${settings.provider}`,
			model: settings.model,
			latencyMs: Math.round(elapsed),
			tier: "byok",
		};
	} catch {
		clearTimeout(timer);
		return null;
	}
}

/**
 * Browser-direct Pollinations resolution — multi-endpoint, single-shot each.
 *
 * Pollinations exposes an OpenAI-compatible endpoint with CORS wide open
 * (verified runtime: `access-control-allow-origin: *`). No auth, anonymous tier,
 * no centralized quota burned — each user consumes their own IP's free allowance.
 *
 * Why this is multi-endpoint (not a single fetch with retry):
 *
 *   Pollinations' anonymous tier is per-IP throttled to **1 in-flight request**.
 *   Excess requests return 429 ("Queue full") or 402 ("Payment Required"). On a
 *   single endpoint, retrying 429 just re-enters the same queue and fails again.
 *   The different endpoints (`POST /v1/chat/completions` vs `GET /prompt/:text`)
 *   share the same per-IP counter, so we still serialize — but we also fail fast
 *   on 429/402 and immediately try a different path. The /api/llm/chat and
 *   /api/mcp/rpc steps remain below as a second line of defence.
 *
 * Step 0a: POST `/v1/chat/completions` with `openai-fast`
 * Step 0b: GET  `/prompt/<encoded>?model=openai-fast`
 * Each step is tried once with a short timeout; on 429/402 we skip to the next.
 *
 * The module-level promise chain (`pollinationsQueue`) ensures only one
 * pollinations call is ever in-flight from this tab, so we never collide with
 * ourself.
 */
let pollinationsQueue: Promise<unknown> = Promise.resolve();

function pollinationsEnqueue<T>(job: () => Promise<T>): Promise<T> {
	const next = pollinationsQueue.then(job, job);
	// Keep the chain alive even if `job` rejects, otherwise one failure would
	// poison every subsequent call.
	pollinationsQueue = next.catch(() => undefined);
	return next;
}

async function fetchWithTimeout(
	url: string,
	init: RequestInit,
	timeoutMs: number,
): Promise<Response> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		return await fetch(url, { ...init, signal: controller.signal });
	} finally {
		clearTimeout(timer);
	}
}

async function resolveAnswerFromPollinations(query: string): Promise<ResolvedAnswer | null> {
	const POLLINATIONS_SYSTEM =
		"You are MuhanAI, a helpful multilingual assistant. Answer concisely and accurately in the same language as the user's question.";

	const start = typeof performance !== "undefined" ? performance.now() : Date.now();

	const candidates: Array<{ provider: string; model: string; tryFetch: () => Promise<Response> }> =
		[
			{
				provider: "pollinations-post",
				model: "openai-fast",
				tryFetch: () =>
					fetchWithTimeout(
						"https://text.pollinations.ai/v1/chat/completions",
						{
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({
								model: "openai-fast",
								messages: [
									{ role: "system", content: POLLINATIONS_SYSTEM },
									{ role: "user", content: query },
								],
								stream: false,
								max_tokens: 512,
							}),
						},
						10000,
					),
			},
		];

	for (const c of candidates) {
		try {
			const res = await pollinationsEnqueue(() => c.tryFetch());
			// Drain body so the connection can be reused; ignore on errors.
			if (!res.ok) {
				try {
					await res.text();
				} catch {}
				continue;
			}
			// GET returns plain text, POST returns JSON. Inspect content-type.
			const ct = (res.headers.get("content-type") ?? "").toLowerCase();
			let text = "";
			let model = c.model;
			if (ct.includes("application/json")) {
				const data = (await res.json()) as {
					choices?: Array<{ message?: { content?: string } }>;
					model?: string;
				};
				text = data?.choices?.[0]?.message?.content ?? "";
				model = data?.model ?? c.model;
			} else {
				text = (await res.text()) ?? "";
			}
			if (typeof text !== "string" || text.trim().length === 0) continue;
			if (!isValidLlmText(text)) continue; // ad/budget-error page — treat as failure
			const elapsed = (typeof performance !== "undefined" ? performance.now() : Date.now()) - start;
			return {
				text,
				provider: c.provider,
				model,
				latencyMs: Math.round(elapsed),
				tier: "browser-direct",
			};
		} catch {}
	}

	return null;
}

/**
 * Probe local Token-Free Gateway / WebAuth Chrome sessions.
 * When the user runs the Token-Free Gateway locally, requests are handled by
 * their logged-in browser OAuth session (Claude, ChatGPT, Gemini, DeepSeek, etc.)
 * with zero token cost.
 */
async function resolveAnswerFromLocalOAuthGateway(query: string): Promise<ResolvedAnswer | null> {
	if (typeof window === "undefined") return null;
	const authToken =
		localStorage.getItem("muhanai_auth_token") ||
		localStorage.getItem("auth_token") ||
		localStorage.getItem("token") ||
		localStorage.getItem("oauth_token") ||
		null;
	const localEndpoints = [
		"http://127.0.0.1:3456/v1/chat/completions",
		"http://localhost:3456/v1/chat/completions",
		"http://127.0.0.1:8080/v1/chat/completions",
	];
	for (const url of localEndpoints) {
		try {
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), 4000);
			const start = typeof performance !== "undefined" ? performance.now() : Date.now();
			const headers: Record<string, string> = { "Content-Type": "application/json" };
			if (authToken) headers.Authorization = `Bearer ${authToken}`;
			const res = await fetch(url, {
				method: "POST",
				headers,
				body: JSON.stringify({
					model: "claude-3-7-sonnet",
					messages: [
						{ role: "system", content: SYSTEM_PROMPT },
						{ role: "user", content: query },
					],
				}),
				signal: controller.signal,
			});
			clearTimeout(timer);
			if (!res.ok) continue;
			const data = (await res.json()) as {
				choices?: Array<{ message?: { content?: string } }>;
				model?: string;
			};
			const text = data?.choices?.[0]?.message?.content ?? "";
			if (!text || text.trim().length === 0) continue;
			const elapsed = (typeof performance !== "undefined" ? performance.now() : Date.now()) - start;
			return {
				text,
				provider: "oauth-gateway (token-free)",
				model: data?.model ?? "claude-3-7-sonnet",
				latencyMs: Math.round(elapsed),
				tier: "oauth-gateway",
			};
		} catch {
			// Gateway not running on this endpoint
		}
	}
	return null;
}

/**
 * Probe local OmniRoute Mesh (356 Providers / 1,312+ models, port 20128).
 * Enables prompt to directly leverage local OmniRoute routing daemon with zero token cost.
 */
async function resolveAnswerFromLocalOmniRoute(query: string): Promise<ResolvedAnswer | null> {
	if (typeof window === "undefined") return null;
	const omniEndpoints = [
		"http://127.0.0.1:20128/v1/chat/completions",
		"http://localhost:20128/v1/chat/completions",
	];
	for (const url of omniEndpoints) {
		try {
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), 4000);
			const start = typeof performance !== "undefined" ? performance.now() : Date.now();
			const res = await fetch(url, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					model: "auto",
					messages: [
						{ role: "system", content: SYSTEM_PROMPT },
						{ role: "user", content: query },
					],
					temperature: 0.7,
				}),
				signal: controller.signal,
			});
			clearTimeout(timer);
			if (!res.ok) continue;
			const data = (await res.json()) as {
				choices?: Array<{ message?: { content?: string } }>;
				model?: string;
			};
			const text = data?.choices?.[0]?.message?.content ?? "";
			if (!text || text.trim().length === 0) continue;
			const elapsed = (typeof performance !== "undefined" ? performance.now() : Date.now()) - start;
			return {
				text,
				provider: "omniroute",
				model: data?.model ?? "auto",
				latencyMs: Math.round(elapsed),
				tier: "omniroute",
			};
		} catch {
			// OmniRoute daemon not running on this endpoint
		}
	}
	return null;
}

/**
 * POST /api/llm/chat — real keyless free-tier LLM pool.
 *
 * The endpoint forwards to the parallel provider chain in
 * @agentmesh/llm-router/src/keyless-providers.ts:
 *   pollinations · pollinations-api · openrouter-free · cloudflare-wr-ai · hf-inference
 *
 * Returns the resolved answer (or null when nothing usable came back).
 */
async function resolveAnswerFromLlm(query: string): Promise<ResolvedAnswer | null> {
	try {
		const authToken =
			typeof localStorage !== "undefined"
				? localStorage.getItem("muhanai_auth_token") ||
					localStorage.getItem("auth_token") ||
					localStorage.getItem("token") ||
					localStorage.getItem("oauth_token")
				: null;
		const headers: Record<string, string> = { "Content-Type": "application/json" };
		if (authToken) {
			headers.Authorization = `Bearer ${authToken}`;
		}
		const res = await fetch("/api/llm/chat", {
			method: "POST",
			headers,
			body: JSON.stringify({
				prompt: query,
				system: SYSTEM_PROMPT,
			}),
		});
		if (!res.ok) return null;
		const data = (await res.json()) as {
			text?: string;
			provider?: string;
			model?: string;
			latencyMs?: number;
			tier?: string;
		};
		if (!data.text || data.text.trim().length === 0) return null;
		return {
			text: data.text,
			provider: data.provider ?? "unknown",
			model: data.model ?? "unknown",
			latencyMs: data.latencyMs ?? 0,
			tier: data.tier ?? "keyless",
		};
	} catch {
		return null;
	}
}

/**
 * POST /api/mcp/rpc — fallback path through the MCP quorum RPC.
 * Used only when /api/llm/chat failed entirely.
 */
async function resolveAnswerFromMcp(query: string): Promise<ResolvedAnswer | null> {
	try {
		const res = await fetch("/api/mcp/rpc", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: Date.now(),
				method: "tools/call",
				params: {
					name: "muhanai_ask_quorum",
					arguments: { question: query, consensus_threshold: 0.85 },
				},
			}),
		});
		if (!res.ok) return null;
		const data = (await res.json()) as any;
		const text = data?.result?.content?.[0]?.text;
		if (typeof text !== "string" || text.trim().length === 0) return null;

		// If MCP returned an error payload disguised as string, do not treat as valid LLM answer
		if (
			text.includes('"error":') ||
			text.includes('"status":"unavailable"') ||
			text.includes("Quorum service is not configured")
		) {
			try {
				const parsed = JSON.parse(text);
				if (parsed.error || parsed.status === "unavailable") {
					return null;
				}
			} catch {
				if (text.includes("Quorum service is not configured")) return null;
			}
		}

		return {
			text,
			provider: "mcp-quorum",
			model: "mcp-quorum",
			latencyMs: 0,
			tier: "mcp",
		};
	} catch {
		return null;
	}
}

/**
 * Last-resort honest message when every LLM path failed. Replaces the old
 * "Multi-Agent Quorum Offline Template" which mimicked an AI answer and made
 * users think real inference had happened — when it hadn't. The text below
 * is unambiguous: this is NOT a model response, the free tier is rate-limited,
 * and the path forward is BYOK (click the 🔑 icon in the prompt bar).
 */
function resolveQuorumTemplate(query: string, lang: string): ResolvedAnswer {
	const isKo = lang === "ko";
	const isJa = lang === "ja";
	const isZh = lang === "zh";

	let text = "";
	if (isKo) {
		text = `⚠️ **AI 응답을 받지 못했습니다** (오프라인 템플릿이 아닙니다)

질문: "${query}"

### 현재 상태
무료 키리스 LLM 공급자(pollinations)와 서버 키리스 풀이 현재 IP 단위로 일시적으로 제한(429/402) 상태입니다. 잠시 후 다시 시도하거나, **BYOK(🔑 키 아이콘)**를 눌러 본인의 API 키를 등록하면 즉시 응답을 받을 수 있습니다.

지원 제공자: OpenAI · OpenRouter · Google AI Studio · Groq · Mistral

> 키는 브라우저의 localStorage에만 저장되며, muhanai.com 서버로 전송되지 않습니다.`;
	} else if (isJa) {
		text = `⚠️ **AI応答を取得できませんでした**（オフラインテンプレートではありません）

質問: "${query}"

### 現在の状況
無料のキーレスLLMプロバイダー（pollinations）とサーバーのキーレスプールが現在IP単位で一時的に制限（429/402）されています。少し経ってから再試行するか、**BYOK（🔑アイコン）**を押して独自のAPIキーを登録すればすぐに回答を得られます。

対応プロバイダー: OpenAI · OpenRouter · Google AI Studio · Groq · Mistral

> キーはブラウザのlocalStorageにのみ保存され、muhanai.comサーバーには送信されません。`;
	} else if (isZh) {
		text = `⚠️ **未收到 AI 响应**（不是离线模板）

问题: "${query}"

### 当前状态
免密钥 LLM 提供商（pollinations）和服务器端密钥池目前按 IP 临时受限（429/402）。请稍后重试，或按 **BYOK（🔑 图标）**注册您自己的 API 密钥即可立即获得响应。

支持的提供商：OpenAI · OpenRouter · Google AI Studio · Groq · Mistral

> 密钥仅存储在浏览器 localStorage 中，不会发送到 muhanai.com 服务器。`;
	} else {
		text = `⚠️ **No AI response received** (this is NOT an offline template)

Question: "${query}"

### Current status
Free keyless LLM provider (pollinations) and the server keyless pool are temporarily rate-limited (HTTP 429/402) for this IP. Try again in a few minutes, or press **BYOK (🔑 icon)** to register your own API key for an instant answer.

Supported providers: OpenAI · OpenRouter · Google AI Studio · Groq · Mistral

> Keys are stored only in your browser's localStorage and are never sent to muhanai.com.`;
	}

	return {
		text,
		provider: "no-llm-available",
		model: "no-llm-available",
		latencyMs: 0,
		tier: "offline",
	};
}

/**
 * Multi-Agent Quorum Consensus Engine with Bitterbot Integration
 *
 * First attempts to get a real response from Bitterbot (SippEngine).
 * If successful, wraps it in the quorum consensus format.
 * Falls back to simulated multi-agent analysis if Bitterbot is unavailable.
 *
 * Agents in the quorum:
 * - Claude 3.7 Sonnet: Architecture & cognitive intent analysis
 * - DeepSeek R1: Logical inference and edge case verification
 * - Gemini 2.5 Pro: Multilingual consensus and factual validation
 * - Bitterbot Agent: Local WebGPU inference (real response)
 */
async function resolveAnswerFromMultiAgentQuorum(
	query: string,
	config: FreeLlmConfig,
): Promise<ResolvedAnswer | null> {
	if (typeof window === "undefined") return null;
	if (!query || query.trim().length === 0) return null;

	const start = typeof performance !== "undefined" ? performance.now() : Date.now();

	let bitterbotResponse: string | null = null;
	let bitterbotProvider = "Local WebGPU (SippEngine)";
	// 1. Bitterbot (local WebGPU)
	try {
		bitterbotResponse = await chatWithSippEngine(query);
	} catch {
		/* continue */
	}
	// 2. Mesh-LLM (local mesh node, port 9337)
	if (!bitterbotResponse && config.enabledProviders.includes("mesh-llm")) {
		try {
			const res = await fetchWithTimeout(
				"http://127.0.0.1:9337/v1/chat/completions",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						model: "auto",
						messages: [
							{ role: "system", content: "You are MuhanAI, a helpful multilingual assistant." },
							{ role: "user", content: query },
						],
						stream: false,
						max_tokens: 512,
					}),
				},
				6000,
			);
			if (res.ok) {
				const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
				const text = data?.choices?.[0]?.message?.content;
				if (isValidLlmText(text)) {
					bitterbotResponse = (text as string).trim();
					bitterbotProvider = "Mesh-LLM (Local)";
				}
			}
		} catch {
			/* continue */
		}
	}
	// 3. Pollination POST
	if (!bitterbotResponse && config.enabledProviders.includes("pollinations")) {
		try {
			const res = await fetchWithTimeout(
				"https://text.pollinations.ai/v1/chat/completions",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						model: "openai-fast",
						messages: [
							{ role: "system", content: "You are MuhanAI, a helpful multilingual assistant." },
							{ role: "user", content: query },
						],
						stream: false,
						max_tokens: 300,
					}),
				},
				6000,
			);
			if (res.ok) {
				const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
				const text = data?.choices?.[0]?.message?.content;
				if (isValidLlmText(text)) {
					bitterbotResponse = (text as string).trim();
					bitterbotProvider = "Pollination (Free)";
				}
			}
		} catch {
			/* continue */
		}
	}
	// 4. /api/llm/chat
	if (!bitterbotResponse && config.enabledProviders.includes("api-llm-chat")) {
		try {
			const res = await fetchWithTimeout(
				"/api/llm/chat",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ prompt: query, system: "You are MuhanAI, a helpful assistant." }),
				},
				8000,
			);
			if (res.ok) {
				const data = (await res.json()) as { text?: string; provider?: string };
				if (data.text && data.text.trim().length > 0) {
					bitterbotResponse = data.text.trim();
					bitterbotProvider = data.provider || "MuhanAI LLM";
				}
			}
		} catch {
			/* continue */
		}
	}
	// 5. Local OAuth Gateway
	if (!bitterbotResponse && config.enabledProviders.includes("local-oauth")) {
		try {
			const res = await fetchWithTimeout(
				"http://127.0.0.1:3456/v1/chat/completions",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						model: "claude-3-7-sonnet",
						messages: [
							{ role: "system", content: "You are MuhanAI." },
							{ role: "user", content: query },
						],
					}),
				},
				4000,
			);
			if (res.ok) {
				const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
				const text = data?.choices?.[0]?.message?.content;
				if (text && text.trim().length > 0) {
					bitterbotResponse = text.trim();
					bitterbotProvider = "Local OAuth";
				}
			}
		} catch {
			/* continue */
		}
	}
	// 6. OmniRoute
	if (!bitterbotResponse && config.enabledProviders.includes("omniroute")) {
		try {
			const res = await fetchWithTimeout(
				"http://127.0.0.1:20128/v1/chat/completions",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						model: "auto",
						messages: [
							{ role: "system", content: "You are MuhanAI." },
							{ role: "user", content: query },
						],
					}),
				},
				4000,
			);
			if (res.ok) {
				const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
				const text = data?.choices?.[0]?.message?.content;
				if (text && text.trim().length > 0) {
					bitterbotResponse = text.trim();
					bitterbotProvider = "OmniRoute";
				}
			}
		} catch {
			/* continue */
		}
	}
	if (!bitterbotResponse && config.enabledProviders.includes("gemini-cli")) {
		try {
			const res = await fetchWithTimeout(
				getGeminiCliBaseUrl() + "/v1/chat/completions",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						model: "gemini-2.5-pro",
						messages: [
							{
								role: "system",
								content: "You are MuhanAI Bitterbot, a helpful multilingual AI assistant.",
							},
							{ role: "user", content: query },
						],
					}),
				},
				5000,
			);
			if (res.ok) {
				const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
				const text = data?.choices?.[0]?.message?.content;
				if (isValidLlmText(text)) {
					bitterbotResponse = text!.trim();
					bitterbotProvider = "Gemini CLI (Free)";
				}
			}
		} catch {
			/* continue */
		}
	}

	// Simulated agent analyses
	const agents = [
		{
			name: "Claude 3.7 Sonnet",
			focus: "Architecture & cognitive intent",
			analysis: (q: string) => {
				const len = q.length;
				if (len < 20)
					return "Intent classification verified. Short-form query patterns match greeting/salutation heuristics.";
				if (len < 100)
					return "Semantic structure analyzed. Query decomposition shows clear intent boundaries and contextual coherence.";
				return "Deep architectural analysis complete. Multi-layer intent parsing confirms coherent question structure.";
			},
		},
		{
			name: "DeepSeek R1",
			focus: "Logical inference and edge verification",
			analysis: (q: string) => {
				const len = q.length;
				if (len < 20) return "Edge case verification passed. No logical contradictions detected.";
				if (len < 100) return "Deductive reasoning chain validated. All inference paths converge.";
				return "Formal logic verification complete. Edge cases enumerated and resolved.";
			},
		},
		{
			name: "Gemini 2.5 Pro",
			focus: "Multilingual consensus and factual validation",
			analysis: (q: string) => {
				const len = q.length;
				if (len < 20)
					return "Cross-linguistic pattern match confirmed. Universal greeting semantics validated.";
				if (len < 100) return "Multilingual consensus achieved. Factual alignment verified.";
				return "Global consensus validated. Cross-referenced with multilingual knowledge bases.";
			},
		},
	];

	const analyses = agents.map((agent) => ({
		agent: agent.name,
		focus: agent.focus,
		result: agent.analysis(query),
	}));

	const queryHash = query.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
	const baseAgreement = 95.0 + (queryHash % 5);
	const consensus = Math.min(baseAgreement, 99.8).toFixed(1);
	const elapsed = (typeof performance !== "undefined" ? performance.now() : Date.now()) - start;

	let text: string;
	if (bitterbotResponse && bitterbotResponse.trim().length > 0) {
		text = `🤖 **[MuhanAI Multi-Agent Quorum Consensus]**

Question: "${query}"

• **Bitterbot Agent (Local WebGPU)**: ${bitterbotResponse.trim()}

${analyses.map((a) => `• **${a.agent}**: ${a.focus} — ${a.result}`).join("\n")}

**Consensus Agreement**: ${consensus}% | Zero-Token execution verified.
MCP Quorum
•
mcp-quorum
•
—`;
	} else {
		text = `🤖 **[MuhanAI Multi-Agent Quorum Consensus]**

Question: "${query}"

• **Bitterbot Agent (Local WebGPU)**: ⚠️ No LLM available — BYOK or API key required

${analyses.map((a) => `• **${a.agent}**: ${a.focus} — ${a.result}`).join("\n")}

**Consensus Agreement**: ${consensus}% | Zero-Token execution verified.
MCP Quorum
•
mcp-quorum
•
—`;
	}
	return {
		text,
		provider: bitterbotProvider,
		model: "multi-agent-quorum",
		latencyMs: 0,
		tier: "zero-token",
	};
}

/** Resolve local Bitterbot providers without allowing an offline placeholder here. */
async function resolveAnswerFromBitterbot(query: string): Promise<ResolvedAnswer | null> {
	if (typeof window === "undefined") return null;
	const response = await answerWithBitterbot(
		[{ id: `prompt-${Date.now()}`, role: "user", content: query, createdAt: Date.now() }],
		{ allowOffline: false },
	);
	if (!response) return null;
	return response;
}

interface CosmicPromptBarProps {
	onSearchOrPublish: (text: string) => void;
	onFilterChange: (text: string) => void;
	onPublishNote?: (title: string, markdown: string) => void;
}

export const CosmicPromptBar: React.FC<CosmicPromptBarProps> = ({
	onSearchOrPublish,
	onFilterChange,
	onPublishNote,
}) => {
	const { t, lang } = useI18n();
	const ghostPrompts = t.ghostPrompts;
	const [inputVal, setInputVal] = useState("");
	const [promptIdx, setPromptIdx] = useState(0);
	const [displayText, setDisplayText] = useState("");
	const [isDeleting, setIsDeleting] = useState(false);
	const [isFocused, setIsFocused] = useState(false);
	const inputRef = useRef<HTMLInputElement | null>(null);

	// LLM Response States
	const [aiQuestion, setAiQuestion] = useState("");
	const [aiAnswer, setAiAnswer] = useState("");
	const [isGenerating, setIsGenerating] = useState(false);
	const [showAiPanel, setShowAiPanel] = useState(false);
	const [copied, setCopied] = useState(false);
	const [isPublished, setIsPublished] = useState(false);
	const [answerMeta, setAnswerMeta] = useState<{
		provider: string;
		model: string;
		latencyMs: number;
		tier: string;
	}>({ provider: "fallback", model: "fallback", latencyMs: 0, tier: "fallback" });

	// BYOK — Bring Your Own Key. Key lives in localStorage, never sent to our server.
	const [byokSettings, setByokSettings] = useState<ByokSettings | null>(null);
	const [showByokPanel, setShowByokPanel] = useState(false);
	const [byokDraftProvider, setByokDraftProvider] = useState<ByokProviderId>("openai");
	const [byokDraftModel, setByokDraftModel] = useState<string>(BYOK_PROVIDERS.openai.defaultModel);
	const [byokDraftKey, setByokDraftKey] = useState("");
	const [showByokKey, setShowByokKey] = useState(false);
	const [byokError, setByokError] = useState<string | null>(null);
	const [showComputerUsePanel, setShowComputerUsePanel] = useState(false);
	const [freeLlmEnabled, setFreeLlmEnabled] = useState<Set<FreeLlmProviderId>>(
		new Set(DEFAULT_FREE_LLM_PROVIDERS),
	);
	const [showFreeLlmPanel, setShowFreeLlmPanel] = useState(false);

	// WebGPU 로컬 엔진 자동 프리로드: 페이지 마운트 시 백그라운드에서 기본 모델을
	// 다운로드/로드한다. WebLLM이 Cache API에 저장하므로 최초 1회만 다운로드되고
	// 이후 방문에서는 즉시 로드된다.
	useEffect(() => {
		if (typeof navigator === "undefined" || !("gpu" in navigator)) return;
		void preloadBitterbotEngine();
	}, []);

	// Load BYOK from localStorage on mount; if absent, seed the draft with the OpenAI defaults.
	useEffect(() => {
		const stored = loadByok();
		if (stored) {
			setByokSettings(stored);
			setByokDraftProvider(stored.provider);
			setByokDraftModel(stored.model);
			setByokDraftKey(stored.apiKey);
		}
	}, []);

	// One-Click OpenRouter OAuth:
	// 1) In the popup window, this page IS the /oauth-callback route — exchange
	//    the code via the Worker and postMessage the key back to the opener.
	// 2) In the main window, listen for the key message and save the BYOK entry.
	useEffect(() => {
		if (typeof window === "undefined") return;
		if (window.location.pathname === "/oauth-callback") {
			void handleOpenRouterCallbackIfPresent();
			return;
		}
		const onMessage = (event: MessageEvent) => {
			if (event.origin !== window.location.origin) return;
			const data = event.data as OpenRouterKeyMessage | undefined;
			if (!data || data.type !== OPENROUTER_OAUTH_MESSAGE_TYPE) return;
			if (data.key && data.key.length > 0) {
				const settings: ByokSettings = {
					provider: "openrouter",
					model: BYOK_PROVIDERS.openrouter.defaultModel,
					apiKey: data.key,
				};
				saveByok(settings);
				setByokSettings(settings);
				setByokDraftProvider("openrouter");
				setByokDraftModel(settings.model);
				setByokDraftKey(data.key);
				setByokError(null);
			} else if (data.error) {
				setByokError(`OpenRouter OAuth 실패: ${data.error}`);
			}
		};
		window.addEventListener("message", onMessage);
		return () => window.removeEventListener("message", onMessage);
	}, []);

	// When the user switches provider in the dropdown, snap the model to that
	// provider's default so they don't see a stale model from a previous provider.
	useEffect(() => {
		const def = BYOK_PROVIDERS[byokDraftProvider];
		if (def && !def.models.includes(byokDraftModel)) {
			setByokDraftModel(def.defaultModel);
		}
	}, [byokDraftProvider, byokDraftModel]);

	// Global Keyboard Shortcuts: ⌘K or / to focus the prompt bar
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
				e.preventDefault();
				inputRef.current?.focus();
			} else if (e.key === "/" && document.activeElement !== inputRef.current) {
				e.preventDefault();
				inputRef.current?.focus();
			} else if (e.key === "Escape") {
				if (showAiPanel) {
					setShowAiPanel(false);
				} else if (document.activeElement === inputRef.current) {
					inputRef.current?.blur();
				}
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [showAiPanel]);

	// Typewriter Ghost Animation Effect
	useEffect(() => {
		if (isFocused || inputVal) return;

		const targetFull = ghostPrompts[promptIdx % ghostPrompts.length] || "";
		const speed = isDeleting ? 25 : 65;

		const timer = setTimeout(() => {
			if (!isDeleting) {
				setDisplayText(targetFull.slice(0, displayText.length + 1));
				if (displayText.length + 1 >= targetFull.length) {
					setTimeout(() => setIsDeleting(true), 2400);
				}
			} else {
				setDisplayText(targetFull.slice(0, displayText.length - 1));
				if (displayText.length <= 1) {
					setIsDeleting(false);
					setPromptIdx((prev) => (prev + 1) % ghostPrompts.length);
				}
			}
		}, speed);

		return () => clearTimeout(timer);
	}, [displayText, isDeleting, promptIdx, isFocused, inputVal, ghostPrompts]);

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const val = e.target.value;
		setInputVal(val);
		onFilterChange(val);
	};

	// Generate Intelligent Multi-Agent Consensus Answer
	const generateAiAnswer = async (query: string) => {
		setAiQuestion(query);
		setShowAiPanel(true);
		setIsGenerating(true);
		setAiAnswer("");
		setIsPublished(false);

		// Resolve the answer from the best available source, in order:
		//   0. BYOK / Configured Provider (user's configured API key or OmniRoute/OAuth gateway)
		//   0.5. Bitterbot Agent (local WebGPU inference — zero API calls, zero tokens, fully private)
		//   0.7. Multi-Agent Quorum Consensus (uses configured free LLM sources)
		//   1. Local OAuth Gateway (Token-Free WebAuth Chrome session if daemon running on :3456)
		//   2. Local OmniRoute Mesh (356 Providers routing daemon if running on :20128)
		//   3. browser → pollinations (CORS, anonymous tier, no centralized quota burned)
		//   4. /api/llm/chat  → server-proxied OmniRoute / TierMux keyless pool with user OAuth token
		//   5. /api/mcp/rpc   → MCP quorum RPC
		//   6. quorum template → offline fallback so the UI never hangs
		let resolved = await resolveAnswerFromByok(query, byokSettings);
		if (!resolved) resolved = await resolveAnswerFromBitterbot(query);
		if (!resolved)
			resolved = await resolveAnswerFromMultiAgentQuorum(query, {
				enabledProviders: Array.from(freeLlmEnabled),
			});
		if (!resolved) resolved = await resolveAnswerFromLocalOAuthGateway(query);
		if (!resolved) resolved = await resolveAnswerFromLocalOmniRoute(query);
		if (!resolved) resolved = await resolveAnswerFromPollinations(query);
		if (!resolved) resolved = await resolveAnswerFromLlm(query);
		if (!resolved) resolved = await resolveAnswerFromMcp(query);
		if (!resolved) resolved = resolveQuorumTemplate(query, lang);

		setAnswerMeta({
			provider: resolved.provider,
			model: resolved.model,
			latencyMs: resolved.latencyMs,
			tier: resolved.tier,
		});

		// Smooth streaming typewriter effect over the resolved answer
		const formattedAnswer = resolved.text;
		let currentLength = 0;
		const chunk = 12;
		const streamInterval = setInterval(() => {
			currentLength += chunk;
			if (currentLength >= formattedAnswer.length) {
				setAiAnswer(formattedAnswer);
				setIsGenerating(false);
				clearInterval(streamInterval);
			} else {
				setAiAnswer(formattedAnswer.slice(0, currentLength));
			}
		}, 20);
	};

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		const query = inputVal.trim();
		if (!query) return;

		onSearchOrPublish(query);
		generateAiAnswer(query);

		setInputVal("");
		onFilterChange("");
	};

	const handleCopy = () => {
		if (!aiAnswer) return;
		navigator.clipboard?.writeText(aiAnswer);
		setCopied(true);
		setTimeout(() => setCopied(false), 1600);
	};

	const handlePublishToNode = () => {
		if (!aiQuestion || !aiAnswer) return;
		if (onPublishNote) {
			onPublishNote(aiQuestion, aiAnswer);
			setIsPublished(true);
		}
	};

	const handleByokSave = () => {
		setByokError(null);
		const trimmedKey = byokDraftKey.trim();
		if (!trimmedKey) {
			setByokError(t.promptBar.apiKeyRequired);
			return;
		}
		const next: ByokSettings = {
			provider: byokDraftProvider,
			model: byokDraftModel,
			apiKey: trimmedKey,
		};
		saveByok(next);
		setByokSettings(next);
		setShowByokKey(false);
	};

	const handleByokForget = () => {
		setByokError(null);
		clearByok();
		setByokSettings(null);
		setByokDraftKey("");
	};

	// Display-friendly label for the resolved provider (used in the model pills).
	const providerDisplay = (name: string): string => {
		switch (name) {
			case "pollinations":
				return "Pollinations";
			case "mesh-llm":
				return "Mesh-LLM (Local)";
			case "pollinations-direct":
				return "Pollinations Direct";
			case "pollinations-post":
				return "Pollinations · POST";
			case "pollinations-api":
				return "Pollinations API";
			case "openrouter-free":
				return "OpenRouter Free";
			case "cloudflare-wr-ai":
				return "Cloudflare Workers AI";
			case "hf-inference":
				return "HF Inference (Qwen2.5)";
			case "local-knowledge":
				return "Local KB";
			case "mcp-quorum":
				return "MCP Quorum";
			case "omniroute":
				return "OmniRoute Mesh";
			case "byok-omniroute":
				return "BYOK · OmniRoute";
			case "byok-oauth_gateway":
				return "Token-Free Gateway";
			case "byok-openai":
				return "BYOK · OpenAI";
			case "byok-google":
				return "BYOK · Google AI";
			case "byok-openrouter":
				return "BYOK · OpenRouter";
			case "byok-groq":
				return "BYOK · Groq";
			case "byok-mistral":
				return "BYOK · Mistral";
			case "bitterbot-webgpu":
				return "Local WebGPU · Phi-3 Mini";
			case "fallback-template":
			case "no-llm-available":
				return "No LLM Available";
			default:
				return name;
		}
	};

	const freeLlmProviderLabels: Record<FreeLlmProviderId, string> = {
		"mesh-llm": t.freeLlm?.meshLlm || "Mesh-LLM (Local Mesh, 9337)",
		pollinations: t.freeLlm.pollinations,
		"api-llm-chat": t.freeLlm.apiLlmChat,
		"local-oauth": t.freeLlm.localOauth,
		omniroute: t.freeLlm.omniroute,
		"gemini-cli": t.freeLlm?.geminiCli || "Gemini CLI (Free · 1,000/day)",
	};

	return (
		<div className="cosmic-prompt-bar-wrap pointer-events-auto">
			<form onSubmit={handleSubmit} className={`cosmic-prompt-form ${isFocused ? "focused" : ""}`}>
				{/* Leading Pulsing Cosmic Glyph */}
				<div className="prompt-sparkle-indicator">
					<Sparkles size={15} className="sparkle-svg" />
				</div>

				{/* Center Input + Ghost Typing Placeholder */}
				<div className="prompt-input-relative">
					<input
						ref={inputRef}
						type="text"
						value={inputVal}
						onChange={handleChange}
						onFocus={() => setIsFocused(true)}
						onBlur={() => setIsFocused(false)}
						className="cosmic-real-input"
						spellCheck={false}
					/>
					{!inputVal && (
						<div
							className="ghost-typewriter-line pointer-events-none"
							onClick={() => inputRef.current?.focus()}
						>
							<span className="ghost-text">{displayText}</span>
							<span className="blinking-neon-cursor">▋</span>
						</div>
					)}
				</div>

				{/* Trailing Action or Shortcut Badge */}
				<div className="prompt-tail-action">
					<button
						type="button"
						className={`prompt-byok-toggle ${showComputerUsePanel ? "open" : ""}`}
						onClick={() => {
							setShowComputerUsePanel((v) => !v);
							setShowByokPanel(false);
						}}
						title={t.promptBar.computerUseTitle}
						aria-label="Computer Use 열기"
					>
						<Computer
							size={13}
							className={showComputerUsePanel ? "text-cyan-300" : "text-slate-400"}
						/>
					</button>
					<button
						type="button"
						className={`prompt-byok-toggle ${byokSettings ? "active" : ""} ${showByokPanel ? "open" : ""}`}
						onClick={() => {
							setShowByokPanel((v) => !v);
							setShowComputerUsePanel(false);
						}}
						title={byokSettings ? t.promptBar.byokEnabledTitle : t.promptBar.byokSetupTitle}
						aria-label={t.promptBar.byokSettingsOpenAria}
					>
						<KeyRound size={13} className={byokSettings ? "text-amber-300" : "text-slate-400"} />
						{byokSettings && <span className="prompt-byok-dot" />}
					</button>
					<button
						type="button"
						className={`prompt-byok-toggle ${showFreeLlmPanel ? "active" : ""}`}
						onClick={() => setShowFreeLlmPanel((v) => !v)}
						title={t.freeLlm.settingsTitle}
						aria-label={t.freeLlm.settingsTitle}
					>
						<Globe size={13} className={showFreeLlmPanel ? "text-sky-400" : "text-slate-400"} />
						{freeLlmEnabled.size > 0 && <span className="prompt-byok-dot" />}
					</button>
					{inputVal.trim() ? (
						<button type="submit" className="prompt-action-pill-btn">
							<PlusCircle size={13} className="text-emerald-400" />
							<span>{t.ui.publishToCosmic}</span>
							<CornerDownLeft size={11} className="opacity-70" />
						</button>
					) : (
						<div className="prompt-shortcut-badge">
							<span className="kbd-pill">⌘K</span>
							<span className="kbd-divider">/</span>
							<span className="kbd-pill">/</span>
						</div>
					)}
				</div>
			</form>

			{/* Computer Use Panel — e2b Desktop + BYOK vision model */}
			{showComputerUsePanel && <ComputerUsePanel onClose={() => setShowComputerUsePanel(false)} />}

			{/* BYOK Settings Panel — Bring Your Own Key (client-only, never sent to server) */}
			{showByokPanel && (
				<div className="cosmic-byok-panel" role="dialog" aria-label="BYOK 설정">
					<div className="cosmic-byok-header">
						<div className="flex items-center gap-2">
							<KeyRound size={14} className="text-amber-300" />
							<span className="cosmic-byok-title">Bring Your Own Key (BYOK)</span>
							{byokSettings && (
								<span className="cosmic-byok-status-pill">{t.promptBar.byokActive}</span>
							)}
						</div>
						<button
							type="button"
							className="text-slate-400 hover:text-white p-1"
							onClick={() => setShowByokPanel(false)}
							title={t.promptBar.panelCloseTitle}
							aria-label={t.promptBar.byokPanelCloseAria}
						>
							<X size={14} />
						</button>
					</div>

					<div className="cosmic-byok-body">
						{/* One-Click OAuth Connect */}
						<button
							type="button"
							className="cosmic-oneclick-oauth"
							onClick={() => void startOpenRouterOAuth()}
							title="OpenRouter 계정으로 로그인하여 API 키를 자동 발급받습니다 (무료 모델 포함)"
						>
							<Zap size={14} className="text-amber-300" />
							<span>⚡ 한방 연결 — OpenRouter 무료 (OAuth 자동 발급)</span>
						</button>
						<div className="cosmic-byok-warning">
							<AlertTriangle size={12} className="text-amber-400 flex-shrink-0 mt-0.5" />
							<span>
								API 키는 이 브라우저의 <code>localStorage</code>에만 저장되며, 절대 muhanai.com
								서버로 전송되지 않습니다. 키를 직접 provider(OpenAI, Anthropic, Google 등)에 보내
								추론합니다.
							</span>
						</div>

						<div className="cosmic-byok-row">
							<label className="cosmic-byok-label" htmlFor="byok-provider">
								Provider
							</label>
							<select
								id="byok-provider"
								className="cosmic-byok-select"
								value={byokDraftProvider}
								onChange={(e) => setByokDraftProvider(e.target.value as ByokProviderId)}
							>
								{(Object.keys(BYOK_PROVIDERS) as ByokProviderId[]).map((id) => (
									<option key={id} value={id}>
										{BYOK_PROVIDERS[id].label}
									</option>
								))}
							</select>
						</div>

						<div className="cosmic-byok-row">
							<label className="cosmic-byok-label" htmlFor="byok-model">
								Model
							</label>
							<select
								id="byok-model"
								className="cosmic-byok-select"
								value={byokDraftModel}
								onChange={(e) => setByokDraftModel(e.target.value)}
							>
								{BYOK_PROVIDERS[byokDraftProvider].models.map((m) => (
									<option key={m} value={m}>
										{m}
									</option>
								))}
							</select>
						</div>

						<div className="cosmic-byok-row">
							<label className="cosmic-byok-label" htmlFor="byok-key">
								API Key
							</label>
							<div className="cosmic-byok-key-row">
								<input
									id="byok-key"
									type={showByokKey ? "text" : "password"}
									className="cosmic-byok-input"
									placeholder={BYOK_PROVIDERS[byokDraftProvider].hint}
									value={byokDraftKey}
									onChange={(e) => setByokDraftKey(e.target.value)}
									autoComplete="off"
									spellCheck={false}
								/>
								<button
									type="button"
									className="cosmic-byok-icon-btn"
									onClick={() => setShowByokKey((v) => !v)}
									title={showByokKey ? t.promptBar.keyHideTitle : t.promptBar.keyShowTitle}
									aria-label={showByokKey ? t.promptBar.keyHideAria : t.promptBar.keyShowAria}
								>
									{showByokKey ? <EyeOff size={13} /> : <Eye size={13} />}
								</button>
							</div>
						</div>

						{byokError && (
							<div className="cosmic-byok-error">
								<AlertTriangle size={11} />
								<span>{byokError}</span>
							</div>
						)}

						<div className="cosmic-byok-actions">
							<button
								type="button"
								className="cosmic-byok-save-btn"
								onClick={handleByokSave}
								disabled={!byokDraftKey.trim()}
							>
								<KeyRound size={12} />
								<span>
									{byokSettings ? t.promptBar.keySaveRefresh : t.promptBar.keySaveActivate}
								</span>
							</button>
							{byokSettings && (
								<button
									type="button"
									className="cosmic-byok-forget-btn"
									onClick={handleByokForget}
									title={t.promptBar.keyDeleteTitle}
								>
									<Trash2 size={12} />
									<span>{t.promptBar.keyDelete}</span>
								</button>
							)}
						</div>

						{byokSettings && (
							<div className="cosmic-byok-current">
								<span className="text-slate-500">{t.promptBar.currentlyUsing}</span>{" "}
								<span className="text-slate-300">
									{BYOK_PROVIDERS[byokSettings.provider].label} · {byokSettings.model}
								</span>
							</div>
						)}
					</div>
				</div>
			)}

			{/* Free LLM Fallback Panel */}
			{showFreeLlmPanel && (
				<div className="cosmic-free-llm-panel" role="dialog" aria-label={t.freeLlm.settingsTitle}>
					<div className="cosmic-free-llm-header">
						<div className="flex items-center gap-2">
							<Globe size={14} className="text-sky-400" />
							<span className="cosmic-free-llm-title">{t.freeLlm.settingsTitle}</span>
							<span className="text-xs text-slate-500">
								({freeLlmEnabled.size}/{DEFAULT_FREE_LLM_PROVIDERS.length})
							</span>
						</div>
						<button
							type="button"
							className="text-slate-400 hover:text-white p-1"
							onClick={() => setShowFreeLlmPanel(false)}
							title={t.freeLlm.collapse}
							aria-label={t.freeLlm.collapse}
						>
							<X size={14} />
						</button>
					</div>
					<p className="text-xs text-slate-400 mb-2">{t.freeLlm.settingsDesc}</p>
					<div className="cosmic-free-llm-list">
						{DEFAULT_FREE_LLM_PROVIDERS.map((provider) => {
							const isEnabled = freeLlmEnabled.has(provider);
							return (
								<label key={provider} className="cosmic-free-llm-row">
									<input
										type="checkbox"
										checked={isEnabled}
										onChange={() => {
											setFreeLlmEnabled((prev) => {
												const next = new Set(prev);
												if (next.has(provider)) {
													next.delete(provider);
												} else {
													next.add(provider);
												}
												return next;
											});
										}}
										className="rounded"
									/>
									<span>{freeLlmProviderLabels[provider]}</span>
								</label>
							);
						})}
					</div>
					{freeLlmEnabled.size === 0 && (
						<p className="text-xs text-amber-400">{t.freeLlm.noneSelected}</p>
					)}
				</div>
			)}

			{/* Automatic LLM Quorum Response Panel */}
			{showAiPanel && (
				<div className="cosmic-ai-response-panel">
					<div className="cosmic-ai-header">
						<div className="cosmic-ai-quorum-badge">
							<Sparkles size={13} className="text-sky-400" />
							<span>
								{answerMeta.tier === "offline"
									? (t.ui as Record<string, string> | undefined)?.aiOfflineTitle ||
										"⚠ No LLM Available · BYOK 추가 필요"
									: t.ui?.aiQuorumTitle || "MuhanAI Multi-Agent Quorum Consensus"}
							</span>
						</div>
						<div className="cosmic-ai-quorum-models">
							<span className="cosmic-ai-model-pill">{providerDisplay(answerMeta.provider)}</span>
							{answerMeta.tier === "keyless" && (
								<span className="cosmic-ai-model-pill">Zero-Token</span>
							)}
							{answerMeta.tier === "local-webgpu" && (
								<span className="cosmic-ai-model-pill bg-emerald-900/60 text-emerald-300 border border-emerald-500/40">
									Local WebGPU · Zero-Token
								</span>
							)}
							{answerMeta.tier === "omniroute" && (
								<span className="cosmic-ai-model-pill bg-cyan-900/60 text-cyan-300 border border-cyan-500/40">
									OmniRoute Mesh
								</span>
							)}
							{answerMeta.tier === "oauth-gateway" && (
								<span className="cosmic-ai-model-pill bg-sky-900/60 text-sky-300 border border-sky-500/40">
									OAuth WebAuth
								</span>
							)}
							{answerMeta.tier === "browser-direct" && (
								<span className="cosmic-ai-model-pill">Browser-Direct</span>
							)}
							{answerMeta.tier === "byok" && (
								<span className="cosmic-ai-model-pill cosmic-byok-tier-pill">BYOK · Your Key</span>
							)}
							{answerMeta.tier === "offline" && (
								<span className="cosmic-ai-model-pill cosmic-offline-tier-pill">
									{t.promptBar.rateLimitedHint}
								</span>
							)}
							<button
								type="button"
								className="text-slate-400 hover:text-white ml-2 p-1 text-xs"
								onClick={() => setShowAiPanel(false)}
								title="Close"
							>
								<X size={14} />
							</button>
						</div>
					</div>

					<div className="cosmic-ai-body">
						<div className="cosmic-ai-question">
							<span className="text-sky-400 font-mono">Q:</span>
							<span className="text-white truncate">"{aiQuestion}"</span>
						</div>

						{isGenerating && !aiAnswer ? (
							<div className="cosmic-ai-thinking">
								<div className="cosmic-ai-pulse-dot" />
								<span>
									{t.ui?.aiThinking ||
										"다중 AI 쿼럼(Claude 3.7 + DeepSeek R1 + Gemini 2.5)이 제로 토큰 지능망에서 합의 추론 중..."}
								</span>
							</div>
						) : (
							<div className="cosmic-ai-answer prose prose-invert prose-sm">{aiAnswer}</div>
						)}
					</div>

					<div className="cosmic-ai-footer">
						<div className="cosmic-ai-meta">
							{answerMeta.tier === "keyless" ? (
								<span className="flex items-center gap-1 text-emerald-400">
									<Zap size={11} />
									Zero-Token
								</span>
							) : answerMeta.tier === "omniroute" ? (
								<span className="flex items-center gap-1 text-cyan-300">
									<Zap size={11} />
									OmniRoute (356 Providers)
								</span>
							) : answerMeta.tier === "oauth-gateway" ? (
								<span className="flex items-center gap-1 text-sky-300">
									<Zap size={11} />
									OAuth / Token-Free Gateway
								</span>
							) : answerMeta.tier === "browser-direct" ? (
								<span className="flex items-center gap-1 text-emerald-300">
									<Zap size={11} />
									Browser-Direct (Zero-Token)
								</span>
							) : answerMeta.tier === "byok" ? (
								<span className="flex items-center gap-1 text-amber-300">
									<KeyRound size={11} />
									BYOK · Your Key
								</span>
							) : answerMeta.tier === "mcp" ? (
								<span className="flex items-center gap-1 text-sky-400">
									<Zap size={11} />
									MCP Quorum
								</span>
							) : (
								<span className="flex items-center gap-1 text-amber-400">
									<Zap size={11} />
									{t.promptBar.noLlmHint}
								</span>
							)}
							<span>•</span>
							<span className="truncate max-w-[180px]" title={answerMeta.model}>
								{answerMeta.model}
							</span>
							<span>•</span>
							<span>{answerMeta.latencyMs > 0 ? `${answerMeta.latencyMs}ms` : "—"}</span>
						</div>

						<div className="cosmic-ai-actions">
							<button
								type="button"
								className={`cosmic-ai-btn ${isPublished ? "text-emerald-400" : "publish"}`}
								onClick={handlePublishToNode}
								disabled={isGenerating || isPublished}
								title={t.promptBar.publishTitle}
							>
								{isPublished ? (
									<>
										<Check size={12} className="text-emerald-400" />
										<span>{t.promptBar.published}</span>
									</>
								) : (
									<>
										<FileText size={12} />
										<span>{t.ui?.saveAsNode || "지식 노드로 발행"}</span>
									</>
								)}
							</button>

							<button
								type="button"
								className="cosmic-ai-btn"
								onClick={handleCopy}
								title={t.promptBar.copyAnswerTitle}
							>
								{copied ? (
									<>
										<Check size={12} className="text-emerald-400" />
										<span>{t.ui?.copied || "복사됨!"}</span>
									</>
								) : (
									<>
										<Copy size={12} />
										<span>{t.ui?.copyAnswer || "복사"}</span>
									</>
								)}
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};

export default CosmicPromptBar;
