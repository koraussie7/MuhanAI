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
import { ComputerUsePanel } from "../ComputerUsePanel";

interface ResolvedAnswer {
	text: string;
	provider: string;
	model: string;
	latencyMs: number;
	tier: string;
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
type ByokProviderId = "openai" | "google" | "openrouter" | "groq" | "mistral";
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
	build: (model: string, systemMsg: string, userMsg: string, key: string) => {
		url: string;
		headers: Record<string, string>;
		body: unknown;
	};
	parse: (data: unknown) => string | null;
}

const SYSTEM_PROMPT =
	"You are MuhanAI, a helpful multilingual assistant. Answer concisely and accurately in the same language as the user's question.";

const BYOK_PROVIDERS: Record<ByokProviderId, ByokProviderDef> = {
	openai: {
		label: "OpenAI",
		hint: "sk-... (OpenAI 대시보드 → API keys)",
		models: ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo"],
		defaultModel: "gpt-4o-mini",
		build: (model, sys, user, key) => ({
			url: "https://api.openai.com/v1/chat/completions",
			headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
			body: { model, messages: [{ role: "system", content: sys }, { role: "user", content: user }] },
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
				"HTTP-Referer": typeof window !== "undefined" ? window.location.origin : "https://muhanai.com",
				"X-Title": "MuhanAI",
			},
			body: { model, messages: [{ role: "system", content: sys }, { role: "user", content: user }] },
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
			body: { model, messages: [{ role: "system", content: sys }, { role: "user", content: user }] },
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
			body: { model, messages: [{ role: "system", content: sys }, { role: "user", content: user }] },
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
		if (!parsed || typeof parsed.apiKey !== "string" || parsed.apiKey.length === 0) return null;
		const provider = (parsed.provider ?? "openai") as ByokProviderId;
		const def = BYOK_PROVIDERS[provider];
		if (!def) return null;
		return {
			provider,
			model: typeof parsed.model === "string" && def.models.includes(parsed.model)
				? parsed.model
				: def.defaultModel,
			apiKey: parsed.apiKey,
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

/**
 * Resolve the answer using the user's own API key, calling the provider
 * directly from the browser. The key never leaves the device and is never
 * sent to api.muhanai.com — we hit the provider's own CORS-enabled endpoint.
 *
 * Returns null on any failure (no key, network error, auth error, parse
 * error, empty response) so the caller can fall through to the next tier.
 */
async function resolveAnswerFromByok(query: string, settings: ByokSettings | null): Promise<ResolvedAnswer | null> {
	if (!settings || !settings.apiKey) return null;
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

	const start = (typeof performance !== "undefined" ? performance.now() : Date.now());

	const candidates: Array<{ provider: string; model: string; tryFetch: () => Promise<Response> }> = [
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
		{
			provider: "pollinations-get",
			model: "openai-fast",
			tryFetch: () => {
				// GET /prompt/:text — URL-encoded prompt. The system prompt is folded
				// into the user turn because the GET endpoint is single-string.
				const promptText = `${POLLINATIONS_SYSTEM}\n\n${query}`;
				const url = `https://text.pollinations.ai/prompt/${encodeURIComponent(
					promptText,
				)}?model=openai-fast`;
				return fetchWithTimeout(url, { method: "GET" }, 10000);
			},
		},
	];

	for (const c of candidates) {
		try {
			const res = await pollinationsEnqueue(() => c.tryFetch());
			// Drain body so the connection can be reused; ignore on errors.
			if (!res.ok) {
				try { await res.text(); } catch {}
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
			const elapsed =
				(typeof performance !== "undefined" ? performance.now() : Date.now()) - start;
			return {
				text,
				provider: c.provider,
				model,
				latencyMs: Math.round(elapsed),
				tier: "browser-direct",
			};
		} catch {
			// Network/abort/parse — try the next candidate.
			continue;
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
		const res = await fetch("/api/llm/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				prompt: query,
				system:
					"You are MuhanAI, a helpful multilingual assistant. Answer concisely and accurately in the same language as the user's question.",
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
		//   0. BYOK (browser → provider with user's own API key; key never leaves device)
		//   1. browser → pollinations (CORS, anonymous tier, no centralized quota burned)
		//   2. /api/llm/chat  → server-proxied keyless pool (pollinations, openrouter-free, hf-inference, …)
		//   3. /api/mcp/rpc   → MCP quorum RPC
		//   4. quorum template → offline fallback so the UI never hangs
		let resolved = await resolveAnswerFromByok(query, byokSettings);
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
			setByokError("API 키를 입력해 주세요");
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
			case "pollinations-direct":
				return "Pollinations Direct";
			case "pollinations-post":
				return "Pollinations · POST";
			case "pollinations-get":
				return "Pollinations · GET";
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
			case "fallback-template":
			case "no-llm-available":
				return "No LLM Available";
			default:
				return name;
		}
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
						title="Computer Use (e2b Desktop) — BYOK 비전 모델로 데스크톱 자동 조종"
						aria-label="Computer Use 열기"
					>
						<Computer size={13} className={showComputerUsePanel ? "text-cyan-300" : "text-slate-400"} />
					</button>
					<button
						type="button"
						className={`prompt-byok-toggle ${byokSettings ? "active" : ""} ${showByokPanel ? "open" : ""}`}
						onClick={() => {
							setShowByokPanel((v) => !v);
							setShowComputerUsePanel(false);
						}}
						title={byokSettings ? "BYOK 활성화됨 — 클릭하여 설정 변경" : "BYOK 설정 — 자신의 API 키 사용"}
						aria-label="BYOK 설정 열기"
					>
						<KeyRound size={13} className={byokSettings ? "text-amber-300" : "text-slate-400"} />
						{byokSettings && <span className="prompt-byok-dot" />}
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
			{showComputerUsePanel && (
				<ComputerUsePanel onClose={() => setShowComputerUsePanel(false)} />
			)}

			{/* BYOK Settings Panel — Bring Your Own Key (client-only, never sent to server) */}
			{showByokPanel && (
				<div className="cosmic-byok-panel" role="dialog" aria-label="BYOK 설정">
					<div className="cosmic-byok-header">
						<div className="flex items-center gap-2">
							<KeyRound size={14} className="text-amber-300" />
							<span className="cosmic-byok-title">Bring Your Own Key (BYOK)</span>
							{byokSettings && <span className="cosmic-byok-status-pill">활성</span>}
						</div>
						<button
							type="button"
							className="text-slate-400 hover:text-white p-1"
							onClick={() => setShowByokPanel(false)}
							title="패널 닫기"
							aria-label="BYOK 패널 닫기"
						>
							<X size={14} />
						</button>
					</div>

					<div className="cosmic-byok-body">
						<div className="cosmic-byok-warning">
							<AlertTriangle size={12} className="text-amber-400 flex-shrink-0 mt-0.5" />
							<span>
								API 키는 이 브라우저의 <code>localStorage</code>에만 저장되며, 절대 muhanai.com 서버로
								전송되지 않습니다. 키를 직접 provider(OpenAI, Anthropic, Google 등)에 보내 추론합니다.
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
									title={showByokKey ? "키 숨기기" : "키 표시"}
									aria-label={showByokKey ? "API 키 숨기기" : "API 키 표시"}
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
								<span>{byokSettings ? "키 저장 / 갱신" : "키 저장하고 활성화"}</span>
							</button>
							{byokSettings && (
								<button
									type="button"
									className="cosmic-byok-forget-btn"
									onClick={handleByokForget}
									title="localStorage에서 키 삭제"
								>
									<Trash2 size={12} />
									<span>키 삭제 (Forget)</span>
								</button>
							)}
						</div>

						{byokSettings && (
							<div className="cosmic-byok-current">
								<span className="text-slate-500">현재 사용 중:</span>{" "}
								<span className="text-slate-300">
									{BYOK_PROVIDERS[byokSettings.provider].label} · {byokSettings.model}
								</span>
							</div>
						)}
					</div>
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
									? ((t.ui as Record<string, string> | undefined)?.aiOfflineTitle || "⚠ No LLM Available · BYOK 추가 필요")
									: (t.ui?.aiQuorumTitle || "MuhanAI Multi-Agent Quorum Consensus")}
							</span>
						</div>
						<div className="cosmic-ai-quorum-models">
							<span className="cosmic-ai-model-pill">{providerDisplay(answerMeta.provider)}</span>
							{answerMeta.tier === "keyless" && (
								<span className="cosmic-ai-model-pill">Zero-Token</span>
							)}
							{answerMeta.tier === "browser-direct" && (
								<span className="cosmic-ai-model-pill">Browser-Direct</span>
							)}
							{answerMeta.tier === "byok" && (
								<span className="cosmic-ai-model-pill cosmic-byok-tier-pill">BYOK · Your Key</span>
							)}
							{answerMeta.tier === "offline" && (
								<span className="cosmic-ai-model-pill cosmic-offline-tier-pill">⚠ Rate-Limited · BYOK 권장</span>
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
									No LLM · BYOK 추가 필요
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
								title="Canvas에 Obsidian 노드로 영구 발행"
							>
								{isPublished ? (
									<>
										<Check size={12} className="text-emerald-400" />
										<span>발행 완료</span>
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
								title="답변 복사"
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
