/**
 * Service worker — bridges content scripts to MuhanAI API.
 * NEVER forwards cookies or passwords.
 */
import { getApiBase } from "./shared/config.js";

const PROVIDER_WHITELIST = new Set(["chatgpt", "claude", "gemini-web", "gemini"]);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "MUAN_PING") {
    sendResponse({ ok: true, role: "background" });
    return false;
  }
  if (message?.type === "IMPORT_TO_MUHANAI" || message?.type === "MUAN_IMPORT") {
    handleImport(message.payload)
      .then((data) => sendResponse({ ok: true, data, result: data }))
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }
  return false;
});

async function handleImport(payload) {
  if (!payload || typeof payload !== "object") throw new Error("invalid payload");
  const provider = String(payload.provider || "");
  if (!PROVIDER_WHITELIST.has(provider)) throw new Error("provider not allowed: " + provider);
  if (typeof payload.answer !== "string" || !payload.answer.trim()) throw new Error("answer is required");
  if (typeof payload.question !== "string" || !payload.question.trim()) throw new Error("question is required");

  const base = await getApiBase();
  const res = await fetch(base + "/api/ai/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider,
      question: payload.question,
      answer: payload.answer,
      source: "browser",
      metadata: payload.metadata ?? {},
    }),
  });
  if (!res.ok) throw new Error(await res.text().catch(() => "HTTP " + res.status));
  return res.json();
}
