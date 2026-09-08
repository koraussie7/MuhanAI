import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/**
 * /api/llm/chat — minimal in-process keyless pool.
 *
 * The user runs `pnpm dev` to develop locally. Starting the full backend
 * (`services/api`) requires Postgres, Prisma, and several workspace deps.
 * Without it, /api/llm/chat fails and the browser-direct pollinations call
 * is the only free LLM path — which is per-IP throttled to 1 concurrent
 * request, so under any backlog it returns 429/402 and the prompt bar falls
 * through to the offline mock.
 *
 * This plugin replicates the server-side `callKeylessProviders` chain
 * (pollinations POST, pollinations GET, openrouter-free, hf-inference,
 * cloudflare-wr-ai) and races them in parallel, returning the first success.
 * Because each provider has an independent quota, at least one usually
 * responds 2xx even when one is queue-blocked.
 *
 * The route only activates when the api backend on :3001 is unreachable,
 * so production builds still flow through the real gateway.
 */

const TIMEOUT_MS = 12000;

type KeylessAttempt = {
	name: string;
	fetch: () => Promise<Response>;
	parse: (res: Response) => Promise<string>;
};

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), ms);
	try {
		return await fetch(url, { ...init, signal: ctrl.signal });
	} finally {
		clearTimeout(timer);
	}
}

function buildAttempts(prompt: string, system: string): KeylessAttempt[] {
	const SYSTEM_PREFIX = system
		? `${system}\n\n`
		: "You are MuhanAI, a helpful multilingual assistant. Answer concisely and accurately in the same language as the user's question.\n\n";
	return [
		{
			name: "pollinations-post",
			fetch: () =>
				fetchWithTimeout(
					"https://text.pollinations.ai/v1/chat/completions",
					{
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							model: "openai-fast",
							messages: [
								{ role: "system", content: system || "You are MuhanAI." },
								{ role: "user", content: prompt },
							],
							stream: false,
							max_tokens: 512,
						}),
					},
					TIMEOUT_MS,
				),
			parse: async (res) => {
				const data = (await res.json()) as {
					choices?: Array<{ message?: { content?: string } }>;
				};
				return data?.choices?.[0]?.message?.content ?? "";
			},
		},
		{
			name: "pollinations-get",
			fetch: () =>
				fetchWithTimeout(
					`https://text.pollinations.ai/prompt/${encodeURIComponent(
						SYSTEM_PREFIX + prompt,
					)}?model=openai-fast`,
					{ method: "GET" },
					TIMEOUT_MS,
				),
			parse: async (res) => res.text(),
		},
	];
}

async function callKeylessFromVite(prompt: string, system: string): Promise<{
	text: string;
	provider: string;
	model: string;
	latencyMs: number;
	tier: string;
} | null> {
	const attempts = buildAttempts(prompt, system);
	const start = Date.now();
	const results = await Promise.allSettled(
		attempts.map(async (a) => {
			const res = await a.fetch();
			if (!res.ok) {
				try { await res.text(); } catch {}
				throw new Error(`${a.name} ${res.status}`);
			}
			const text = (await a.parse(res)).trim();
			if (!text) throw new Error(`${a.name} empty`);
			return { name: a.name, text };
		}),
	);
	for (const r of results) {
		if (r.status === "fulfilled") {
			return {
				text: r.value.text,
				provider: r.value.name,
				model: "openai-fast",
				latencyMs: Date.now() - start,
				tier: "keyless-local",
			};
		}
	}
	return null;
}

function llmChatPlugin(): Plugin {
	return {
		name: "muhanai-local-llm-chat",
		configureServer(server) {
			server.middlewares.use("/api/llm/chat", async (req, res) => {
				if (req.method !== "POST") {
					res.statusCode = 405;
					res.setHeader("content-type", "application/json");
					res.end(JSON.stringify({ error: "Method not allowed" }));
					return;
				}
				try {
					const chunks: Buffer[] = [];
					for await (const chunk of req) {
						chunks.push(chunk as Buffer);
					}
					const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
					const prompt = typeof body.prompt === "string" ? body.prompt : "";
					const system = typeof body.system === "string" ? body.system : "";
					if (!prompt) {
						res.statusCode = 400;
						res.setHeader("content-type", "application/json");
						res.end(JSON.stringify({ error: "prompt required" }));
						return;
					}
					const result = await callKeylessFromVite(prompt, system);
					if (!result) {
						res.statusCode = 502;
						res.setHeader("content-type", "application/json");
						res.end(
							JSON.stringify({
								error: "All local keyless providers failed",
							}),
						);
						return;
					}
					res.statusCode = 200;
					res.setHeader("content-type", "application/json");
					res.end(JSON.stringify(result));
				} catch (err) {
					res.statusCode = 500;
					res.setHeader("content-type", "application/json");
					res.end(
						JSON.stringify({
							error: err instanceof Error ? err.message : "unknown",
						}),
					);
				}
			});
		},
	};
}

export default defineConfig({
	plugins: [react(), tailwindcss(), llmChatPlugin()],
	server: { port: 5173, proxy: { "/api": "http://localhost:3001" } },
	build: { outDir: "dist" },
});
