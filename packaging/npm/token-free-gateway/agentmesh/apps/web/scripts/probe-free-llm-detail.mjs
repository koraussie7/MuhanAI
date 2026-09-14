// Detailed probe: capture response BODY for the ambiguous endpoints.
const PROMPT = "Reply with exactly the single word OK";

async function show(name, url, init) {
  const start = Date.now();
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(25000) });
    const body = await res.text().catch(() => "(no body)");
    console.log(`\n=== ${name} ===`);
    console.log(`HTTP ${res.status} (${Date.now() - start}ms)`);
    console.log(`content-type: ${res.headers.get("content-type")}`);
    console.log(`body[0:400]: ${body.slice(0, 400)}`);
  } catch (err) {
    console.log(`\n=== ${name} ===`);
    console.log(`ERR: ${err?.name}: ${err?.message}`);
  }
}

await show(
  "openrouter-free (no key)",
  "https://openrouter.ai/api/v1/chat/completions",
  { method: "POST", headers: { "Content-Type": "application/json", "HTTP-Referer": "https://muhanai.com", "X-Title": "MuhanAI" }, body: JSON.stringify({ model: "meta-llama/llama-3.3-70b-instruct:free", messages: [{ role: "user", content: PROMPT }], max_tokens: 8 }) },
);

await show(
  "openrouter-free (with dummy key)",
  "https://openrouter.ai/api/v1/chat/completions",
  { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer sk-or-v1-dummy", "HTTP-Referer": "https://muhanai.com" }, body: JSON.stringify({ model: "meta-llama/llama-3.3-70b-instruct:free", messages: [{ role: "user", content: PROMPT }], max_tokens: 8 }) },
);

await show(
  "pollinations-post (budget detail)",
  "https://text.pollinations.ai/v1/chat/completions",
  { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "openai-fast", messages: [{ role: "user", content: PROMPT }], max_tokens: 8 }) },
);

await show(
  "pollinations GET (short)",
  "https://text.pollinations.ai/prompt/OK?model=openai-fast",
  { method: "GET" },
);

await show(
  "cloudflare-wr-ai detail",
  "https://api.cloudflare.com/client/v4/ai/run",
  { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "@cf/meta/llama-3.2-3b-instruct", messages: [{ role: "user", content: PROMPT }] }) },
);

await show(
  "hf-inference Qwen detail",
  "https://api-inference.huggingface.co/models/Qwen/Qwen2.5-0.5B-Instruct",
  { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inputs: `[INST] ${PROMPT} [/INST]` }) },
);