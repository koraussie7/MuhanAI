/** Shared storage keys — no secrets for consumer AI accounts. */
export const STORAGE_KEYS = {
  muhanApiBase: "muhanApiBase",
};

export const DEFAULT_API_BASE = "http://127.0.0.1:4000";

export async function getApiBase() {
  const data = await chrome.storage.sync.get(STORAGE_KEYS.muhanApiBase);
  return (data[STORAGE_KEYS.muhanApiBase] || DEFAULT_API_BASE).replace(/\/$/, "");
}

/**
 * POST /api/ai/import — user-initiated only.
 * @param {{ provider: string, question: string, answer: string, metadata?: object }} payload
 */
export async function importAnswer(payload) {
  const base = await getApiBase();
  const res = await fetch(`${base}/api/ai/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: payload.provider,
      question: payload.question,
      answer: payload.answer,
      source: "browser",
      metadata: {
        url: payload.metadata?.url,
        ...payload.metadata,
      },
    }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`Import failed: ${err}`);
  }
  return res.json();
}
