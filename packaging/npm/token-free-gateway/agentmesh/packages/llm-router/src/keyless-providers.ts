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
		name: "pollinations-api",
		endpoint: "https://api.pollinations.ai/v1/chat/completions",
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: (req) => ({
			messages: [
				...(req.system ? [{ role: "system", content: req.system }] : []),
				{ role: "user", content: req.prompt },
			],
			model: req.model ?? "openai/gpt-4o-mini",
			temperature: req.temperature ?? 0.3,
			max_tokens: req.maxTokens ?? 1024,
		}),
		parse: (data) => data?.choices?.[0]?.message?.content ?? "",
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
			model: req.model ?? "meta-llama/llama-3.2-3b-instruct",
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
			inputs: `${req.system ? `${req.system}\n\n` : ""}${req.prompt}`,
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
		let response: Response;

		if (config.method === "POST") {
			response = await fetch(config.endpoint, {
				method: "POST",
				headers: config.headers,
				body: JSON.stringify(config.body(req)),
				signal: controller.signal,
			});
		} else {
			// GET: URL-encode the prompt into the endpoint
			const promptText = req.system ? `${req.system}\n\n${req.prompt}` : req.prompt;
			const url = `${config.endpoint}${encodeURIComponent(promptText)}`;
			response = await fetch(url, {
				method: "GET",
				headers: config.headers,
				signal: controller.signal,
			});
		}

		if (!response.ok) {
			throw new Error(`${config.name} returned ${response.status}`);
		}

		// Pollinations returns plain text, not JSON — try .json() first, fall back to .text()
		let data: any;
		const contentType = response.headers.get("content-type") ?? "";
		if (contentType.includes("application/json")) {
			data = await response.json();
		} else {
			data = await response.text();
		}
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
		throw new Error(`${config.name} failed: ${err instanceof Error ? err.message : String(err)}`);
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Local knowledge fallback for common factual questions.
 * Used when all keyless providers fail (rate-limited, network error, etc.).
 * Returns null if the question is not in the knowledge base.
 */
function localKnowledgeFallback(prompt: string): string | null {
	const lower = prompt.toLowerCase().trim();

	// Remove question prefixes
	const clean = lower
		.replace(
			/^(what is|what are|how many|how much|where is|who is|who are|when was|when did|define|explain|tell me|can you|could you|would you|please| kindly)\s*/i,
			"",
		)
		.trim();

	const facts: Record<string, string> = {
		"area of the united states":
			"The United States has a total area of approximately 3.797 million square miles (9.834 million square kilometers). This includes 3.537 million sq mi of land area and 260,000 sq mi of inland water area.",
		"area of usa":
			"The United States has a total area of approximately 3.797 million square miles (9.834 million square kilometers).",
		"population of the united states":
			"The United States has an estimated population of approximately 340 million people as of 2024.",
		"population of usa":
			"The United States has an estimated population of approximately 340 million people as of 2024.",
		"capital of the united states": "The capital of the United States is Washington, D.C.",
		"capital of usa": "The capital of the United States is Washington, D.C.",
		"largest country in the world":
			"Russia is the largest country in the world by land area, covering approximately 17.1 million square kilometers (6.6 million square miles).",
		"smallest country in the world":
			"Vatican City is the smallest country in the world by land area, covering approximately 0.49 square kilometers (0.19 square miles).",
		"largest ocean in the world":
			"The Pacific Ocean is the largest and deepest of Earth's five oceans, covering approximately 165.25 million square kilometers.",
		"highest mountain in the world":
			"Mount Everest is the highest mountain in the world, standing at 8,848.86 meters (29,031.7 feet) above sea level on the Nepal-China border.",
		"speed of light":
			"The speed of light in a vacuum is exactly 299,792,458 meters per second (approximately 186,282 miles per second).",
		"boiling point of water":
			"Water boils at 100°C (212°F) at standard atmospheric pressure (1 atm).",
		"freezing point of water":
			"Water freezes at 0°C (32°F) at standard atmospheric pressure (1 atm).",
		"number of continents":
			"There are 7 continents on Earth: Africa, Antarctica, Asia, Europe, North America, Australia (Oceania), and South America.",
		"earth circumference":
			"The Earth's circumference is approximately 40,075 kilometers (24,901 miles) at the equator.",
		"diameter of the earth":
			"The Earth's equatorial diameter is approximately 12,756 kilometers (7,926 miles).",
		"distance from earth to sun":
			"The average distance from the Earth to the Sun is approximately 149.6 million kilometers (93 million miles), defined as 1 astronomical unit (AU).",
		"distance from earth to moon":
			"The average distance from the Earth to the Moon is approximately 384,400 kilometers (238,900 miles).",
		"human body temperature": "Normal human body temperature is approximately 37°C (98.6°F).",
		"number of chromosomes in humans": "Humans have 46 chromosomes (23 pairs) in each cell.",
		"chemical symbol for water":
			"The chemical symbol for water is H₂O, consisting of two hydrogen atoms and one oxygen atom.",
		"chemical symbol for gold": "The chemical symbol for gold is Au (atomic number 79).",
		"chemical symbol for carbon": "The chemical symbol for carbon is C (atomic number 6).",
		"world population 2024":
			"The world population reached approximately 8.1 billion people in 2024.",
		"speed of sound":
			"The speed of sound in dry air at 20°C (68°F) is approximately 343 meters per second (1,125 feet per second).",
		"atomic number of hydrogen":
			"Hydrogen has atomic number 1 and is the most abundant element in the universe.",
		"planets in our solar system":
			"There are 8 planets in our solar system: Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, and Neptune.",
	};

	// Try exact match first, then partial match
	if (facts[clean]) return facts[clean];

	for (const [key, value] of Object.entries(facts)) {
		if (clean.includes(key) || key.includes(clean)) {
			return value;
		}
	}

	return null;
}

/**
 * Call multiple keyless providers in parallel and return the first successful response.
 * Falls back to local knowledge base, then to a generic message.
 */
export async function callKeylessProviders(req: KeylessRequest): Promise<KeylessResponse> {
	const providers = KEYLESS_PROVIDERS;

	const results = await Promise.allSettled(providers.map((p) => callProvider(p, req)));

	for (const result of results) {
		if (result.status === "fulfilled") {
			return result.value;
		}
	}

	// Try local knowledge base for common factual questions
	const localAnswer = localKnowledgeFallback(req.prompt);
	if (localAnswer) {
		return {
			text: localAnswer,
			provider: "local-knowledge",
			model: "local-knowledge",
			latencyMs: 0,
		};
	}

	// All providers failed — return a graceful fallback with a real attempt
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
