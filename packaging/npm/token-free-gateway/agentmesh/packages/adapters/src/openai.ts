import type { AgentRequest, AgentResult, AgentHealth } from "@agentmesh/core";
import { BaseAdapter } from "./base.js";

export interface OpenAICompatibleConfig {
  baseUrl: string;
  apiKey?: string;
  model?: string;
}

export class OpenAICompatibleAdapter extends BaseAdapter {
  readonly id: string;
  private config: OpenAICompatibleConfig;

  constructor(id: string, config: OpenAICompatibleConfig) {
    super();
    this.id = id;
    this.config = config;
  }

  override capabilities(): string[] {
    return ["answer", "chat", "streaming"];
  }

  override async health(): Promise<AgentHealth> {
    const started = Date.now();
    try {
      const res = await fetch(`${this.config.baseUrl}/v1/models`, {
        headers: this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {},
        signal: AbortSignal.timeout(3000),
      });
      return { online: res.ok, latency: Date.now() - started, checkedAt: Date.now() };
    } catch {
      return { online: false, latency: Date.now() - started, checkedAt: Date.now() };
    }
  }

  async execute(request: AgentRequest): Promise<AgentResult> {
    const started = Date.now();
    const messages = [
      { role: "system" as const, content: "You are a helpful AI agent in the AgentMesh network." },
      { role: "user" as const, content: request.question },
    ];

    const res = await fetch(`${this.config.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: this.config.model ?? "auto",
        messages,
        temperature: 0.7,
        max_tokens: 2048,
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "Unknown error");
      return this.result(request, `Gateway error: ${err}`, started, 0);
    }

    const data = await res.json();
    const answer = data.choices?.[0]?.message?.content ?? "No response";
    return this.result(request, answer, started, 0.8);
  }
}