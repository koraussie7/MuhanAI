/**
 * Keyless LLM providers pool — Tier 3 of the muhanai.com LLM gateway.
 *
 * These providers require NO API key, NO account, and NO setup.
 * They are polled in parallel and the best response is returned.
 *
 * Inspired by:
 *   - TierMux (keyless providers: Kilo Gateway, OpenCode Zen, OVH AI, Pollinations)
 *   - FreeLLMAPI (OpenRouter free tier, Cloudflare Workers AI)
 *
 * Usage:
 *   import { callKeylessProviders } from "./keyless-providers.js";
 *   const result = await callKeylessProviders({ prompt: "Hello" });
 */

export interface KeylessRequest {
	prompt: string;
	system?: string;
	model?: string;
	temperature?: number;
	maxTokens?: number;
}

export interface KeylessResponse {
	text: string;
	provider: string;
	model: string;
	latencyMs: number;
}

interface KeylessProviderConfig {
	name: string;
	endpoint: string;
	method: "GET" | "POST";
	headers: Record<string, string>;
	body: (req: KeylessRequest) => Record<string, unknown>;
	parse: (data: any) => string;
}

const KEYLESS_PROVIDERS: KeylessProviderConfig[] = [
	{
		name: "pollinations",
		endpoint: "https://text.pollinations.ai/prompt/",
		method: "GET",
		headers: { "Content-Type": "application/json" },
		body: (req) => ({ prompt: req.prompt, system: req.system }),
		parse: (data) => (typeof data === "string" ? data : JSON.stringify(data)),
	},
	{
		name: "openrouter-free",
		endpoint: "https://openrouter.ai/api/v1/chat/completions",
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"HTTP-Referer": "https://muhanai.com",
			"X-Title": "MuhanAI Token-Free Gateway",
		},
		body: (req) => ({
			model: req.model ?? "meta-llama/llama-3.2-3b-instruct:free",
			messages: [
				...(req.system ? [{ role: "system", content: req.system }] : []),
				{ role: "user", content: req.prompt },
			],
			temperature: req.temperature ?? 0.3,
			max_tokens: req.maxTokens ?? 1024,
		}),
		parse: (data) => data?.choices?.[0]?.message?.content ?? "",
	},
	{
		name: "cloudflare-wr-ai",
		endpoint: "https://api.cloudflare.com/client/v4/ai/run",
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: (req) => ({
			model: req.model ?? "@cf/meta/llama-3.2-3b-instruct",
			messages: [
				...(req.system ? [{ role: "system", content: req.system }] : []),
				{ role: "user", content: req.prompt },
			],
		}),
		parse: (data) => data?.result?.response ?? "",
	},
	{
		name: "hf-inference",
		endpoint: "https://api-inference.huggingface.co/models/Qwen/Qwen2.5-0.5B-Instruct",
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: (req) => ({
			inputs: `${req.system ? req.system + "\n\n" : ""}${req.prompt}`,
			options: { wait_for_model: true },
		}),
		parse: (data) => (Array.isArray(data) ? data[0]?.generated_text : data?.generated_text) ?? "",
	},
];

/**
 * Call a single keyless provider with a timeout.
 */
async function callProvider(
	config: KeylessProviderConfig,
	req: KeylessRequest,
	timeoutMs = 8000,
): Promise<KeylessResponse> {
	const start = Date.now();
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const response = await fetch(config.endpoint, {
			method: config.method,
			headers: config.headers,
			body: config.method === "POST" ? JSON.stringify(config.body(req)) : undefined,
			signal: controller.signal,
		});

		if (!response.ok) {
			throw new Error(`${config.name} returned ${response.status}`);
		}

		const data = await response.json();
		const text = config.parse(data);

		if (!text || text.trim().length === 0) {
			throw new Error(`${config.name} returned empty response`);
		}

		return {
			text,
			provider: config.name,
			model: req.model ?? config.name,
			latencyMs: Date.now() - start,
		};
	} catch (err) {
		throw new Error(
			`${config.name} failed: ${err instanceof Error ? err.message : String(err)}`,
		);
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Call multiple keyless providers in parallel and return the first successful response.
 * Falls back to a local simulation if all providers fail.
 */
export async function callKeylessProviders(
	req: KeylessRequest,
): Promise<KeylessResponse> {
	const providers = KEYLESS_PROVIDERS;

	const results = await Promise.allSettled(
		providers.map((p) => callProvider(p, req)),
	);

	for (const result of results) {
		if (result.status === "fulfilled") {
			return result.value;
		}
	}

	// All providers failed — return a graceful fallback
	return {
		text: `[Keyless Gateway · Fallback]\n\n${req.prompt.slice(0, 200)}\n\nAll free-tier providers are currently rate-limited. Please try again in a few minutes, or add your own API key in Settings for priority routing.`,
		provider: "fallback",
		model: "fallback",
		latencyMs: 0,
	};
}

/**
 * Get the list of available keyless provider names.
 */
export function getKeylessProviderNames(): string[] {
	return KEYLESS_PROVIDERS.map((p) => p.name);
}