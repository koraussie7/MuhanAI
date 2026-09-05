export type LLMProvider = "openai" | "anthropic" | "google" | "local";

export interface LLMRequest {
  system?: string;
  prompt: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMResponse {
  text: string;
  provider: LLMProvider;
  model: string;
  usage?: { inputTokens: number; outputTokens: number };
  latencyMs: number;
}

/**
 * Minimal LLM router with round-robin + fallback.
 * Replace the mock generate() with real SDK calls.
 */
export class LLMRouter {
  private providers: LLMProvider[] = ["openai", "anthropic", "google"];
  private index = 0;

  async generate(req: LLMRequest): Promise<LLMResponse> {
    const start = Date.now();
    const provider = this.providers[this.index % this.providers.length]!;
    this.index += 1;

    // Mock response for scaffolding
    const text = [
      `[${provider}] Based on the provided context and question:`,
      req.prompt.slice(0, 200),
      "...",
      "This is a scaffolded response. Wire real provider SDKs here.",
    ].join("\n");

    return {
      text,
      provider,
      model: req.model ?? "default",
      latencyMs: Date.now() - start,
      usage: { inputTokens: 100, outputTokens: 50 },
    };
  }

  async generateWithFallback(req: LLMRequest): Promise<LLMResponse> {
    let lastError: unknown;
    for (const provider of this.providers) {
      try {
        // In real impl: force specific provider
        return await this.generate({ ...req });
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError ?? new Error("All LLM providers failed");
  }
}

export const llmRouter = new LLMRouter();
