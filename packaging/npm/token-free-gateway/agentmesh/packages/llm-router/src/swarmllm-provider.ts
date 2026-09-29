/**
 * SwarmLLM's OpenAI-compatible provider adapter.
 *
 * The adapter is intentionally transport-agnostic: the router owns retries and
 * fallback policy, while this module only normalizes the endpoint, headers, and
 * chat-completions request shape.
 */

export interface SwarmLlmRequest {
	prompt: string;
	system?: string;
	model?: string;
	temperature?: number;
	maxTokens?: number;
}

export interface SwarmLlmProviderConfig {
	name: "swarmllm-local";
	endpoint: string;
	headers: Record<string, string>;
	body: (request: SwarmLlmRequest) => Record<string, unknown>;
	parse: (data: unknown) => string;
}

/** Resolve a SwarmLLM base URL to `/v1/chat/completions`. */
export function getSwarmLlmEndpoint(baseUrl = process.env.SWARMLLM_BASE_URL): string | null {
	if (!baseUrl?.trim()) return null;
	const trimmed = baseUrl.trim().replace(/\/+$/, "");
	if (trimmed.endsWith("/chat/completions")) return trimmed;

	try {
		const path = trimmed.endsWith("/v1") ? "chat/completions" : "v1/chat/completions";
		return new URL(path, `${trimmed}/`).toString();
	} catch {
		return null;
	}
}

/** Build the normalized provider configuration from environment settings. */
export function createSwarmLlmProvider(): SwarmLlmProviderConfig | null {
	const endpoint = getSwarmLlmEndpoint();
	if (!endpoint) return null;

	const apiKey = process.env.SWARMLLM_KEY?.trim();
	return {
		name: "swarmllm-local",
		endpoint,
		headers: {
			"Content-Type": "application/json",
			...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
		},
		body: (request) => ({
			messages: [
				...(request.system ? [{ role: "system", content: request.system }] : []),
				{ role: "user", content: request.prompt },
			],
			model: request.model ?? process.env.SWARMLLM_MODEL ?? "auto",
			temperature: request.temperature ?? 0.3,
			max_tokens: request.maxTokens ?? 4096,
			stream: false,
		}),
		parse: (data) => {
			if (!data || typeof data !== "object") return "";
			const choices = (data as { choices?: Array<{ message?: { content?: unknown } }> }).choices;
			const content = choices?.[0]?.message?.content;
			return typeof content === "string" ? content : "";
		},
	};
}
