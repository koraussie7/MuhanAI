// Probe all free LLM endpoints referenced in the codebase.
import { fileURLToPath } from "node:url";

const PROMPT = "Reply with exactly the single word OK";
const SYSTEM = "You are a concise assistant.";

const endpoints = [
	{
		name: "omniroute-localhost:20128 (vite default)",
		fetch: () =>
			fetch(`${process.env.OMNIROUTE_BASE_URL ?? "http://localhost:20128/v1"}/chat/completions`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: process.env.OMNIROUTE_API_KEY
						? `Bearer ${process.env.OMNIROUTE_API_KEY}`
						: `Bearer ${process.env.OPENROUTER_API_KEY ?? "local"}`,
				},
				body: JSON.stringify({
					model: process.env.OMNIROUTE_MODEL ?? "auto",
					messages: [{ role: "user", content: PROMPT }],
					temperature: 0.2,
					max_tokens: 16,
				}),
				signal: AbortSignal.timeout(15000),
			}),
		parse: async (res) => (await res.json()).choices?.[0]?.message?.content ?? "",
	},
	{
		name: "oauth-gateway:3456 (oauth-gateway free)",
		fetch: () =>
			fetch("http://127.0.0.1:3456/v1/chat/completions", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					model: "claude-3-7-sonnet",
					messages: [{ role: "user", content: PROMPT }],
				}),
				signal: AbortSignal.timeout(8000),
			}),
		parse: async (res) => (await res.json()).choices?.[0]?.message?.content ?? "",
	},
	{
		name: "openrouter-free: llama-3.3-70b:free",
		fetch: () =>
			fetch("https://openrouter.ai/api/v1/chat/completions", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"HTTP-Referer": "https://muhanai.com",
					"X-Title": "MuhanAI Token-Free Gateway",
				},
				body: JSON.stringify({
					model: "meta-llama/llama-3.3-70b-instruct:free",
					messages: [{ role: "user", content: PROMPT }],
					max_tokens: 16,
				}),
				signal: AbortSignal.timeout(20000),
			}),
		parse: async (res) => (await res.json()).choices?.[0]?.message?.content ?? "",
	},
	{
		name: "pollinations-post: openai-fast",
		fetch: () =>
			fetch("https://text.pollinations.ai/v1/chat/completions", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					model: "openai-fast",
					messages: [
						{ role: "system", content: SYSTEM },
						{ role: "user", content: PROMPT },
					],
					stream: false,
					max_tokens: 16,
				}),
				signal: AbortSignal.timeout(20000),
			}),
		parse: async (res) => (await res.json()).choices?.[0]?.message?.content ?? "",
	},
	{
		name: "pollinations-get",
		fetch: () =>
			fetch(
				`https://text.pollinations.ai/prompt/${encodeURIComponent(`${SYSTEM}\n\n${PROMPT}`)}?model=openai-fast`,
				{ method: "GET", signal: AbortSignal.timeout(20000) },
			),
		parse: async (res) => res.text(),
	},
	{
		name: "hf-inference: Qwen2.5-0.5B",
		fetch: () =>
			fetch("https://api-inference.huggingface.co/models/Qwen/Qwen2.5-0.5B-Instruct", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					inputs: `<|im_start|>user\n${PROMPT}<|im_end|>\n<|im_start|>assistant\n`,
					options: { wait_for_model: true },
				}),
				signal: AbortSignal.timeout(25000),
			}),
		parse: async (res) => (await res.json())[0]?.generated_text ?? "",
	},
	{
		name: "cloudflare-wr-ai",
		fetch: () =>
			fetch("https://api.cloudflare.com/client/v4/ai/run", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					model: "@cf/meta/llama-3.2-3b-instruct",
					messages: [{ role: "user", content: PROMPT }],
				}),
				signal: AbortSignal.timeout(15000),
			}),
		parse: async (res) => (await res.json()).result?.response ?? "",
	},
];

let anyOk = false;
for (const ep of endpoints) {
	const start = Date.now();
	try {
		const res = await ep.fetch();
		const status = res.status;
		let text = "";
		try {
			text = (await ep.parse(res)).trim().slice(0, 120);
		} catch {
			text = "(parse failed)";
		}
		const ms = Date.now() - start;
		if (status >= 200 && status < 300 && text) {
			anyOk = true;
			console.log(`[OK]   ${ep.name}: HTTP ${status} (${ms}ms): "${text}"`);
		} else {
			console.log(`[WARN] ${ep.name}: HTTP ${status} (${ms}ms)`);
		}
	} catch (err) {
		console.log(`[FAIL] ${ep.name}: ${err?.name ?? "Error"}: ${err?.message ?? err}`);
	}
}
console.log(
	anyOk
		? "\n=> At least one free LLM path is LIVE."
		: "\n=> No free LLM path responded successfully.",
);
