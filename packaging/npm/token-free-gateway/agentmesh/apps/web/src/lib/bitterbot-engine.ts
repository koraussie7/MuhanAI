import { AIEngineFactory } from "@agentmesh/ai-engine/factory";
import type { SippEngine } from "@agentmesh/ai-engine";

export type BitterbotRole = "system" | "user" | "assistant";

export interface BitterbotMessage {
	id: string;
	role: BitterbotRole;
	content: string;
	createdAt: number;
}

export interface BitterbotResponse {
	text: string;
	provider: string;
	model: string;
	tier: string;
	latencyMs: number;
}

export interface BitterbotChatOptions {
	signal?: AbortSignal;
	temperature?: number;
	maxTokens?: number;
	allowOffline?: boolean;
}

const HISTORY_KEY = "muhanai.bitterbot.history.v1";
const SYSTEM_PROMPT =
	"You are Bitterbot, a helpful multilingual local agent. Answer accurately and concisely in the same language as the user.";

let sippEngine: SippEngine | null = null;
let sippInit: Promise<SippEngine | null> | null = null;

function validText(text: unknown): text is string {
	return typeof text === "string" && text.trim().length > 0;
}

function now(): number {
	return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function abortIfNeeded(signal?: AbortSignal): void {
	if (signal?.aborted) throw new DOMException("The request was aborted", "AbortError");
}

async function fetchJson(url: string, body: unknown, options: BitterbotChatOptions = {}): Promise<any> {
	abortIfNeeded(options.signal);
	const controller = new AbortController();
	const onAbort = () => controller.abort();
	options.signal?.addEventListener("abort", onAbort, { once: true });
	const timer = setTimeout(() => controller.abort(), 12_000);
	try {
	const response = await fetch(url, {
	method: "POST",
		headers: { "Content-Type": "application/json" },
	body: JSON.stringify(body),
		signal: controller.signal,
	});
	if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}`);
	return await response.json();
	} finally {
	clearTimeout(timer);
	options.signal?.removeEventListener("abort", onAbort);
	}
}

async function getSippEngine(): Promise<SippEngine | null> {
	if (sippEngine) return sippEngine;
	if (sippInit) return sippInit;
	sippInit = (async () => {
	try {
	const engine = AIEngineFactory.createDefault();
	await engine.init();
	await engine.loadModel("phi-3-mini-q4"); // 2.3GB — 첫 자동 다운로드가 빠른 기본 모델
		sippEngine = engine;
	return engine;
	} catch {
	return null;
	} finally {
		sippInit = null;
	}
	})();
	return sippInit;
}

function offlineResponse(messages: BitterbotMessage[]): BitterbotResponse {
	const last = [...messages].reverse().find((message) => message.role === "user");
	const query = last?.content ?? "your request";
	return {
	text: `Bitterbot is ready to help with “${query}”. Local inference providers are currently unavailable, so this is an offline response. Start SippEngine/WebGPU or a local OpenAI-compatible runtime to receive a model-generated answer.`,
	provider: "bitterbot-offline",
	model: "offline-fallback",
		tier: "offline",
	latencyMs: 0,
	};
}

export function loadBitterbotHistory(): BitterbotMessage[] {
	if (typeof localStorage === "undefined") return [];
	try {
	const value = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]") as BitterbotMessage[];
	return Array.isArray(value) ? value.filter((item) => item && validText(item.content)) : [];
	} catch {
	return [];
	}
}

export function saveBitterbotHistory(history: BitterbotMessage[]): void {
	try {
	localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-40)));
	} catch {
	// Storage can be unavailable in private or embedded contexts.
	}
}

export function clearBitterbotHistory(): void {
	try {
	localStorage.removeItem(HISTORY_KEY);
	} catch {
	// Ignore storage failures.
	}
}

export async function answerWithBitterbot(
	messages: BitterbotMessage[],
	options: BitterbotChatOptions = {},
): Promise<BitterbotResponse | null> {
	const started = now();
	const promptMessages = [{ role: "system", content: SYSTEM_PROMPT }, ...messages].map(({ role, content }) => ({ role, content }));
	abortIfNeeded(options.signal);

	try {
	if (typeof navigator !== "undefined" && "gpu" in navigator) {
	const engine = await getSippEngine();
	if (engine) {
	const lastUser = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
	const text = await engine.chat(lastUser, { stream: false });
	if (validText(text)) {
	return { text, provider: "bitterbot-webgpu", model: "phi-3-mini-q4", tier: "local-webgpu", latencyMs: Math.round(now() - started) };
	}
	}
	}
	} catch {
	// Continue through local providers.
	}

	for (const endpoint of ["http://127.0.0.1:8080/v1/chat/completions", "http://127.0.0.1:3456/v1/chat/completions", "/api/llm/chat"]) {
	try {
	const body = endpoint === "/api/llm/chat"
	? { prompt: messages.at(-1)?.content ?? "", system: SYSTEM_PROMPT }
	: { model: "local", messages: promptMessages, temperature: options.temperature ?? 0.7, max_tokens: options.maxTokens ?? 512 };
	const data = await fetchJson(endpoint, body, options);
	const text = data?.choices?.[0]?.message?.content ?? data?.text;
	if (validText(text)) {
	return { text, provider: data.provider ?? (endpoint.includes("8080") ? "nanos-local" : "bitterbot-local"), model: data.model ?? "local", tier: endpoint.includes("8080") ? "nanos-local" : "local", latencyMs: Math.round(now() - started) };
	}
	} catch {
	// Try the next local provider.
	}
	}

	if (options.allowOffline === false) return null;
	return offlineResponse(messages);
}

/** WebGPU 엔진을 미리 초기화/다운로드한다. 앱 마운트 시 호출하면 첫 질의 응답 지연이 사라진다. */
export function preloadBitterbotEngine(): void {
	void getSippEngine();
}

/** 로컬 SippEngine으로 직접 채팅한다. 엔진이 없거나 실패하면 null을 반환한다.
 *  CosmicPromptBar의 Multi-Agent Quorum이 동일 엔진을 재사용하도록 export한다. */
export async function chatWithSippEngine(message: string): Promise<string | null> {
	const engine = await getSippEngine();
	if (!engine) return null;
	try {
		const text = await engine.chat(message, { stream: false });
		return validText(text) ? text : null;
	} catch {
		return null;
	}
}
