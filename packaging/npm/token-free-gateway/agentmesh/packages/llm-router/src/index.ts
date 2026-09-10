import { p2pNodeRegistry } from "./p2p-node-registry.js";

export type LLMProvider = "openai" | "anthropic" | "google" | "local" | "p2p";

export interface LLMRequest {
	system?: string;
	prompt: string;
	model?: string;
	temperature?: number;
	maxTokens?: number;
	provider?: LLMProvider;
	stream?: boolean;
}

export interface LLMResponse {
	text: string;
	provider: LLMProvider;
	model: string;
	usage?: { inputTokens: number; outputTokens: number };
	latencyMs: number;
}

export class LLMRouter {
	private openai: any = null;
	private anthropic: any = null;
	private google: any = null;
	private getOpenAI(): any {
		if (this.openai) return this.openai;
		if (!process.env.OPENAI_API_KEY) return null;
		try {
			const OpenAI = require("openai").default;
			const baseURL = process.env.OPENAI_BASE_URL ?? process.env.OMNIROUTE_BASE_URL;
			const config: Record<string, string> = { apiKey: process.env.OPENAI_API_KEY };
			if (baseURL) config.baseURL = baseURL;
			this.openai = new OpenAI(config);
			return this.openai;
		} catch {
			return null;
		}
	}

	private getAnthropic(): any {
		if (this.anthropic) return this.anthropic;
		if (!process.env.ANTHROPIC_API_KEY) return null;
		try {
			const Anthropic = require("@anthropic-ai/sdk").default;
			this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
			return this.anthropic;
		} catch {
			return null;
		}
	}

	private getGoogle(): any {
		if (this.google) return this.google;
		if (!process.env.GOOGLE_API_KEY) return null;
		try {
			const { GoogleGenerativeAI } = require("@google/generative-ai");
			this.google = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
			return this.google;
		} catch {
			return null;
		}
	}

	getAvailableProviders(): LLMProvider[] {
		const providers: LLMProvider[] = [];
		if (process.env.OPENAI_API_KEY) providers.push("openai");
		if (process.env.ANTHROPIC_API_KEY) providers.push("anthropic");
		if (process.env.GOOGLE_API_KEY) providers.push("google");
		if (process.env.LLM_LOCAL_ENDPOINT) providers.push("local");
		if (p2pNodeRegistry.getHealthyNodes().length > 0) providers.push("p2p");
		return providers.length > 0 ? providers : ["local"];
	}

	async generate(req: LLMRequest): Promise<LLMResponse> {
		const start = Date.now();
		const requestedProvider =
			req.provider ?? (process.env.LLM_DEFAULT_PROVIDER as LLMProvider) ?? "openai";
		try {
			const response = await this.generateWithProvider(requestedProvider, req);
			return { ...response, latencyMs: Date.now() - start };
		} catch (err) {
			const llmErr = this.normalizeError(err, requestedProvider);
			if (llmErr.retryable) {
				const fallback = await this.tryFallbacks(req, [requestedProvider]);
				if (fallback) return { ...fallback, latencyMs: Date.now() - start };
			}
			throw llmErr;
		}
	}

	private async generateWithProvider(provider: LLMProvider, req: LLMRequest): Promise<LLMResponse> {
		switch (provider) {
			case "openai":
				return this.generateOpenAI(req);
			case "anthropic":
				return this.generateAnthropic(req);
			case "google":
				return this.generateGoogle(req);
			case "local":
				return this.generateLocal(req);
			case "p2p":
				return this.generateP2P(req);
			default:
				throw new Error(`Unknown provider: ${provider}`);
		}
	}

	private async generateOpenAI(req: LLMRequest): Promise<LLMResponse> {
		const client = this.getOpenAI();
		if (!client) return this.generateMock("openai", req);
		const messages: Array<{ role: string; content: string }> = [];
		if (req.system) messages.push({ role: "system", content: req.system });
		messages.push({ role: "user", content: req.prompt });
		const defaultModel = process.env.OPENAI_DEFAULT_MODEL ?? "gpt-4-turbo-preview";
		const response = await client.chat.completions.create({
			model: req.model ?? defaultModel,
			messages: messages as any,
			temperature: req.temperature ?? 0.3,
			max_tokens: req.maxTokens ?? 4096,
		});
		return {
			text: response.choices[0]?.message?.content ?? "",
			provider: "openai",
			model: response.model,
			usage: {
				inputTokens: response.usage?.prompt_tokens ?? 0,
				outputTokens: response.usage?.completion_tokens ?? 0,
			},
			latencyMs: 0,
		};
	}

	private async generateAnthropic(req: LLMRequest): Promise<LLMResponse> {
		const client = this.getAnthropic();
		if (!client) return this.generateMock("anthropic", req);
		const response = await client.messages.create({
			model: req.model ?? "claude-3-5-sonnet-20241022",
			max_tokens: req.maxTokens ?? 4096,
			system: req.system,
			messages: [{ role: "user", content: req.prompt }],
			temperature: req.temperature ?? 0.3,
		});
		const text = response.content
			.filter((b: any) => b.type === "text")
			.map((b: any) => b.text)
			.join("");
		return {
			text,
			provider: "anthropic",
			model: response.model,
			usage: {
				inputTokens: response.usage?.input_tokens ?? 0,
				outputTokens: response.usage?.output_tokens ?? 0,
			},
			latencyMs: 0,
		};
	}

	private async generateGoogle(req: LLMRequest): Promise<LLMResponse> {
		const client = this.getGoogle();
		if (!client) return this.generateMock("google", req);
		const model = client.getGenerativeModel({
			model: req.model ?? "gemini-1.5-pro",
		});
		const prompt = req.system ? `${req.system}\n\n${req.prompt}` : req.prompt;
		const result = await model.generateContent({
			contents: [{ role: "user", parts: [{ text: prompt }] }],
			generationConfig: {
				temperature: req.temperature ?? 0.3,
				maxOutputTokens: req.maxTokens ?? 4096,
			},
		});
		return {
			text: result.response.text(),
			provider: "google",
			model: req.model ?? "gemini-1.5-pro",
			usage: {
				inputTokens: result.response.usageMetadata?.tokenCount ?? 0,
				outputTokens: 0,
			},
			latencyMs: 0,
		};
	}

	private async generateLocal(req: LLMRequest): Promise<LLMResponse> {
		const endpoint = process.env.LLM_LOCAL_ENDPOINT;
		if (!endpoint) return this.generateMock("local", req);
		try {
			const res = await fetch(`${endpoint}/api/generate`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					model: req.model ?? "llama3",
					prompt: req.system ? `${req.system}\n\n${req.prompt}` : req.prompt,
					stream: false,
					options: {
						temperature: req.temperature ?? 0.3,
						num_predict: req.maxTokens ?? 4096,
					},
				}),
			});
			if (!res.ok) throw new Error(`Local LLM error: ${res.status}`);
			const data = (await res.json()) as { response?: string };
			return {
				text: data.response ?? "",
				provider: "local",
				model: req.model ?? "llama3",
				usage: { inputTokens: 0, outputTokens: 0 },
				latencyMs: 0,
			};
		} catch {
			return this.generateMock("local", req);
		}
	}

	private async generateP2P(req: LLMRequest): Promise<LLMResponse> {
		const { p2pLoadBalancer } = await import("./p2p-load-balancer.js");
		const node = p2pLoadBalancer.selectNode({
			id: `req_${Date.now()}`,
			model: req.model ?? "default",
			messages: [
				...(req.system ? [{ role: "system" as const, content: req.system }] : []),
				{ role: "user" as const, content: req.prompt },
			],
			temperature: req.temperature,
			maxTokens: req.maxTokens,
			stream: req.stream,
		});

		if (!node) {
			throw new Error("No healthy P2P nodes available for model: " + req.model);
		}

		const start = Date.now();
		try {
			const res = await fetch(`http://${node.host}:${node.port}/inference`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					model: req.model,
					messages: [
						...(req.system ? [{ role: "system", content: req.system }] : []),
						{ role: "user", content: req.prompt },
					],
					temperature: req.temperature ?? 0.3,
					max_tokens: req.maxTokens ?? 4096,
					stream: false,
				}),
			});

			if (!res.ok) {
				throw new Error(`P2P node ${node.id} returned ${res.status}`);
			}

			const data = (await res.json()) as {
				text?: string;
				usage?: { prompt_tokens?: number; completion_tokens?: number };
			};

			return {
				text: data.text ?? "",
				provider: "p2p",
				model: req.model ?? "p2p-model",
				usage: {
					inputTokens: data.usage?.prompt_tokens ?? 0,
					outputTokens: data.usage?.completion_tokens ?? 0,
				},
				latencyMs: Date.now() - start,
			};
		} catch (err) {
			const nodeErr = err instanceof Error ? err : new Error(String(err));
			p2pNodeRegistry.updateNode(node.id, { status: "degraded" });
			throw nodeErr;
		}
	}

	private generateMock(provider: LLMProvider, req: LLMRequest): LLMResponse {
		const keyVar = `${provider.toUpperCase()}_API_KEY`;
		const lines = [
			`[${provider} - Mock Mode]`,
			"",
			"This is a mock response because no API key is configured.",
			`Set ${keyVar} in your .env file to enable real responses.`,
			"",
			"---",
			"",
			`Your prompt: "${req.prompt.slice(0, 100)}${req.prompt.length > 100 ? "..." : ""}"`,
		];
		return {
			text: lines.join("\n"),
			provider,
			model: req.model ?? `${provider}-mock`,
			usage: { inputTokens: 0, outputTokens: 0 },
			latencyMs: 0,
		};
	}

	private async tryFallbacks(req: LLMRequest, exclude: LLMProvider[]): Promise<LLMResponse | null> {
		const available = this.getAvailableProviders().filter((p) => !exclude.includes(p));
		for (const provider of available) {
			try {
				return await this.generateWithProvider(provider, req);
			} catch {}
		}
		return this.generateMock("local", req);
	}

	private normalizeError(
		err: unknown,
		provider: LLMProvider,
	): Error & { provider: LLMProvider; retryable: boolean } {
		const baseErr = err instanceof Error ? err : new Error(String(err));
		return Object.assign(baseErr, {
			provider,
			retryable: baseErr.message.toLowerCase().match(/rate limit|timeout|503|502|429/) !== null,
		});
	}

	async generateWithFallback(req: LLMRequest): Promise<LLMResponse> {
		const start = Date.now();
		const available = this.getAvailableProviders();
		for (const provider of available) {
			try {
				const response = await this.generateWithProvider(provider, req);
				return { ...response, latencyMs: Date.now() - start };
			} catch {}
		}
		return {
			...this.generateMock("local", req),
			latencyMs: Date.now() - start,
		};
	}
}

export const llmRouter = new LLMRouter();

export { p2pNodeRegistry, P2pNodeRegistry, type P2pNodesChangeCallback } from "./p2p-node-registry.js";
export { p2pLoadBalancer, P2pLoadBalancer } from "./p2p-load-balancer.js";
export type {
	DeviceNodeInfo,
	DeviceCapabilities,
	DeviceMetrics,
	ClusterConfig,
	LoadBalancingStrategy,
	InferenceResult,
} from "@agentmesh/peer-mesh";
