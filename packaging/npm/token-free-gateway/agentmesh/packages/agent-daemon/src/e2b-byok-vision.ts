/**
 * BYOK vision providers for the ComputerUseLoop.
 *
 * Each provider wraps a third-party vision API (OpenAI Chat Completions,
 * Anthropic Messages, Google Gemini) behind the `VisionClient` interface
 * used by E2bBrowserAdapter and the agent loop. The keys are user-supplied
 * via the existing BYOK UI — they live in localStorage and are sent
 * straight to the provider, never to the MuhanAI gateway.
 *
 * We chose CORS-open endpoints so this can run from the browser as well
 * as from the daemon. Anthropic is intentionally omitted from `provider`
 * because `api.anthropic.com` rejects all non-console Origins.
 *
 * `planAction()` is intentionally a separate method from `locate()` so
 * the same provider can use a strong model (claude-3-5-sonnet /
 * gpt-4o) for agent planning and a cheap model (claude-3-haiku /
 * gpt-4o-mini) for selector grounding — same pattern open-computer-use
 * uses internally.
 */

import type { ComputerUseAction, ComputerUseStep } from "./e2b-computer-use.js";
import type { VisionClient } from "./e2b-adapter.js";

export type ByokProviderId = "openai" | "google" | "groq" | "openrouter";

export interface CreateByokVisionProviderOptions {
	provider: ByokProviderId;
	apiKey: string;
	/** Override the planning model (default varies by provider). */
	planModel?: string;
	/** Override the grounding model. Defaults to a cheap fast model. */
	locateModel?: string;
	/** Endpoint override — used by tests. */
	endpoint?: string;
	/** AbortSignal plumbed through fetch. */
	signal?: AbortSignal;
}

export interface PlanActionFn {
	(opts: {
		goal: string;
		imageBase64: string;
		history: ReadonlyArray<ComputerUseStep>;
	}): Promise<ComputerUseAction>;
}

export interface ByokVisionProvider extends VisionClient {
	planAction: PlanActionFn;
	readonly provider: ByokProviderId;
	readonly planModel: string;
	readonly locateModel: string;
}

const DEFAULT_PLANS: Record<ByokProviderId, { plan: string; locate: string }> = {
	openai: { plan: "gpt-4o", locate: "gpt-4o-mini" },
	google: { plan: "gemini-2.0-flash-exp", locate: "gemini-2.0-flash-exp" },
	groq: { plan: "llama-3.2-90b-vision-preview", locate: "llama-3.2-11b-vision-preview" },
	openrouter: { plan: "anthropic/claude-3.5-sonnet", locate: "openai/gpt-4o-mini" },
};

const PROVIDER_ENDPOINTS: Record<ByokProviderId, { chat: string; messages?: string }> = {
	openai: { chat: "https://api.openai.com/v1/chat/completions" },
	google: {
		chat: "https://generativelanguage.googleapis.com/v1beta/models",
		messages: "https://generativelanguage.googleapis.com/v1beta/models",
	},
	groq: { chat: "https://api.groq.com/openai/v1/chat/completions" },
	openrouter: { chat: "https://openrouter.ai/api/v1/chat/completions" },
};

export function createByokVisionProvider(opts: CreateByokVisionProviderOptions): ByokVisionProvider {
	if (!opts.apiKey) {
		throw new Error("createByokVisionProvider: apiKey is required");
	}
	if (!(opts.provider in DEFAULT_PLANS)) {
		throw new Error(`createByokVisionProvider: unknown provider "${opts.provider}"`);
	}
	const defaults = DEFAULT_PLANS[opts.provider];
	const planModel = opts.planModel ?? defaults.plan;
	const locateModel = opts.locateModel ?? defaults.locate;
	if (opts.provider === "openai" || opts.provider === "groq" || opts.provider === "openrouter") {
		return createOpenAiCompatible({ ...opts, planModel, locateModel });
	}
	if (opts.provider === "google") {
		return createGoogleVision({ ...opts, planModel, locateModel });
	}
	throw new Error(`createByokVisionProvider: unknown provider "${opts.provider}"`);
}

function createOpenAiCompatible(opts: CreateByokVisionProviderOptions & {
	planModel: string;
	locateModel: string;
}): ByokVisionProvider {
	const endpoint = opts.endpoint ?? PROVIDER_ENDPOINTS[opts.provider].chat;
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		Authorization: `Bearer ${opts.apiKey}`,
	};
	if (opts.provider === "openrouter") {
		// OpenRouter requires identifying the calling site
		headers["HTTP-Referer"] = "https://muhanai.com";
		headers["X-Title"] = "MuhanAI Computer Use";
	}
	return {
		provider: opts.provider,
		planModel: opts.planModel,
		locateModel: opts.locateModel,
		async locate({ imageBase64, prompt }) {
			const body = {
				model: opts.locateModel,
				messages: [
					{
						role: "user",
						content: [
							{ type: "text", text: prompt },
							{ type: "image_url", image_url: { url: `data:image/png;base64,${imageBase64}` } },
						],
					},
				],
				response_format: { type: "json_object" },
				max_tokens: 200,
			};
			const res = await fetch(endpoint, {
				method: "POST",
				headers,
				body: JSON.stringify(body),
				signal: opts.signal,
			});
			if (!res.ok) {
				throw new Error(`${opts.provider} locate ${res.status}: ${await res.text()}`);
			}
			const json = (await res.json()) as {
				choices?: Array<{ message?: { content?: string } }>;
			};
			const content = json.choices?.[0]?.message?.content ?? "{}";
			return parseCoords(content);
		},
		async planAction({ goal, imageBase64, history }) {
			const actionSpec = `Reply with JSON only. One of:
{"type":"click","x":<int>,"y":<int>}
{"type":"click_selector","selector":"<describe the UI element>"}
{"type":"type","text":"<string>"}
{"type":"press","key":"<key name>"}
{"type":"navigate","url":"<url>"}
{"type":"done","reason":"<why the goal is met>"}`;
			const historyText = history
				.map((s) => `Step ${s.index}: ${JSON.stringify(s.action)}`)
				.join("\n");
			const prompt = `Goal: ${goal}\n\nPast actions:\n${historyText || "(none yet)"}\n\n${actionSpec}`;
			const body = {
				model: opts.planModel,
				messages: [
					{
						role: "user",
						content: [
							{ type: "text", text: prompt },
							{ type: "image_url", image_url: { url: `data:image/png;base64,${imageBase64}` } },
						],
					},
				],
				response_format: { type: "json_object" },
				max_tokens: 400,
			};
			const res = await fetch(endpoint, {
				method: "POST",
				headers,
				body: JSON.stringify(body),
				signal: opts.signal,
			});
			if (!res.ok) {
				throw new Error(`${opts.provider} planAction ${res.status}: ${await res.text()}`);
			}
			const json = (await res.json()) as {
				choices?: Array<{ message?: { content?: string } }>;
			};
			const content = json.choices?.[0]?.message?.content ?? "{}";
			return parseAction(content);
		},
	};
}

function createGoogleVision(opts: CreateByokVisionProviderOptions & {
	planModel: string;
	locateModel: string;
}): ByokVisionProvider {
	const endpoint = opts.endpoint ?? PROVIDER_ENDPOINTS.google.chat;
	const urlFor = (model: string) =>
		`${endpoint}/${model}:generateContent?key=${encodeURIComponent(opts.apiKey)}`;
	return {
		provider: "google",
		planModel: opts.planModel,
		locateModel: opts.locateModel,
		async locate({ imageBase64, prompt }) {
			const body = {
				contents: [
					{
						parts: [
							{ text: prompt },
							{ inline_data: { mime_type: "image/png", data: imageBase64 } },
						],
					},
				],
				generationConfig: { response_mime_type: "application/json" },
			};
			const res = await fetch(urlFor(opts.locateModel), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
				signal: opts.signal,
			});
			if (!res.ok) {
				throw new Error(`google locate ${res.status}: ${await res.text()}`);
			}
			const json = (await res.json()) as {
				candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
			};
			const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
			return parseCoords(text);
		},
		async planAction({ goal, imageBase64, history }) {
			const actionSpec = `Reply with JSON only. One of:
{"type":"click","x":<int>,"y":<int>}
{"type":"click_selector","selector":"<describe the UI element>"}
{"type":"type","text":"<string>"}
{"type":"press","key":"<key name>"}
{"type":"navigate","url":"<url>"}
{"type":"done","reason":"<why the goal is met>"}`;
			const historyText = history
				.map((s) => `Step ${s.index}: ${JSON.stringify(s.action)}`)
				.join("\n");
			const prompt = `Goal: ${goal}\n\nPast actions:\n${historyText || "(none yet)"}\n\n${actionSpec}`;
			const body = {
				contents: [
					{
						parts: [
							{ text: prompt },
							{ inline_data: { mime_type: "image/png", data: imageBase64 } },
						],
					},
				],
				generationConfig: { response_mime_type: "application/json" },
			};
			const res = await fetch(urlFor(opts.planModel), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
				signal: opts.signal,
			});
			if (!res.ok) {
				throw new Error(`google planAction ${res.status}: ${await res.text()}`);
			}
			const json = (await res.json()) as {
				candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
			};
			const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
			return parseAction(text);
		},
	};
}

function parseCoords(raw: string): { x: number; y: number } | null {
	try {
		const parsed = JSON.parse(stripFences(raw)) as { x?: unknown; y?: unknown };
		if (typeof parsed.x !== "number" || typeof parsed.y !== "number") return null;
		if (parsed.x < 0 || parsed.y < 0) return null;
		return { x: Math.round(parsed.x), y: Math.round(parsed.y) };
	} catch {
		return null;
	}
}

function parseAction(raw: string): ComputerUseAction {
	const cleaned = stripFences(raw);
	let parsed: Record<string, unknown> = {};
	try {
		parsed = JSON.parse(cleaned) as Record<string, unknown>;
	} catch {
		return { type: "done", reason: `model returned unparseable action: ${cleaned.slice(0, 80)}` };
	}
	const type = parsed.type;
	switch (type) {
		case "click":
			if (
				typeof parsed.x === "number" &&
				typeof parsed.y === "number" &&
				parsed.x >= 0 &&
				parsed.y >= 0
			) {
				return { type: "click", x: Math.round(parsed.x), y: Math.round(parsed.y) };
			}
			return { type: "done", reason: "click action missing valid x,y" };
		case "click_selector":
			if (typeof parsed.selector === "string" && parsed.selector.length > 0) {
				return { type: "click_selector", selector: parsed.selector };
			}
			return { type: "done", reason: "click_selector action missing selector" };
		case "type":
			if (typeof parsed.text === "string") {
				return { type: "type", text: parsed.text };
			}
			return { type: "done", reason: "type action missing text" };
		case "press":
			if (typeof parsed.key === "string") {
				return { type: "press", key: parsed.key };
			}
			return { type: "done", reason: "press action missing key" };
		case "navigate":
			if (typeof parsed.url === "string") {
				return { type: "navigate", url: parsed.url };
			}
			return { type: "done", reason: "navigate action missing url" };
		case "done":
			return { type: "done", reason: typeof parsed.reason === "string" ? parsed.reason : "done" };
		default:
			return { type: "done", reason: `unknown action type: ${String(type)}` };
	}
}

function stripFences(s: string): string {
	let out = s.trim();
	if (out.startsWith("```")) {
		out = out.replace(/^```(?:json)?/i, "").trim();
		if (out.endsWith("```")) out = out.slice(0, -3).trim();
	}
	return out;
}
