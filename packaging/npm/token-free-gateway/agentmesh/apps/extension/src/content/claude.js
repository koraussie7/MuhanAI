/**
 * Claude.ai content script — user-initiated import only. No cookies.
 */
(function () {
  const PROVIDER = "claude";
  function textOf(el) {
    return (el?.innerText || el?.textContent || "").trim();
  }
  function extractClaude() {
    const humans = [...document.querySelectorAll('[data-testid="user-message"], .font-user-message')]
      .map(textOf).filter(Boolean);
    const assistants = [...document.querySelectorAll('[data-testid="assistant-message"], .font-claude-message, .prose')]
      .map(textOf).filter((t) => t.length > 20);
    const pairs = [];
    const n = Math.min(humans.length, assistants.length);
    for (let i = 0; i < n; i++) {
      pairs.push({ question: humans[i], answer: assistants[i], provider: PROVIDER });
    }
    return pairs;
  }
  function ensureFab() {
    if (document.getElementById("muhan-bridge-fab")) return;
    const btn = document.createElement("button");
    btn.id = "muhan-bridge-fab";
    btn.textContent = "→ MuhanAI";
    Object.assign(btn.style, {
      position: "fixed", bottom: "24px", right: "24px", zIndex: "2147483647",
      padding: "10px 14px", borderRadius: "10px", border: "none",
      background: "#10b981", color: "#04110c", fontWeight: "700", fontSize: "13px",
      cursor: "pointer", boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
    });
    btn.addEventListener("click", () => {
      const pairs = extractClaude();
      const turn = pairs[pairs.length - 1];
      if (!turn?.answer) {
        alert("MuhanAI: could not extract Claude answer.");
        return;
      }
      chrome.runtime.sendMessage({
        type: "IMPORT_TO_MUHANAI",
        payload: {
          provider: PROVIDER,
          question: turn.question || "(from Claude)",
          answer: turn.answer,
          source: "browser",
          metadata: { url: location.href, model: "claude-web" },
        },
      }, (res) => {
        if (!res?.ok) alert("Import failed: " + (res?.error || chrome.runtime.lastError?.message));
        else alert("Imported. id=" + (res.data?.id || "?"));
      });
    });
    document.documentElement.appendChild(btn);
  }
  chrome.runtime.onMessage?.addListener((msg, _s, sendResponse) => {
    if (msg.type === "EXTRACT") { sendResponse(extractClaude()); return true; }
    return false;
  });
  ensureFab();
})();
