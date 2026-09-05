/**
 * Gemini — user-initiated import only. No cookies.
 */
(function () {
  const PROVIDER = "gemini-web";
  function textOf(el) {
    return (el?.innerText || el?.textContent || "").trim();
  }
  function extractGemini() {
    const blocks = [...document.querySelectorAll("message-content, .model-response-text, .user-query-text, .query-text")]
      .map(textOf).filter(Boolean);
    if (blocks.length < 2) {
      const main = document.querySelector("main") || document.body;
      const chunks = [...main.querySelectorAll("div, p")].map(textOf).filter((t) => t.length > 40).slice(-6);
      if (chunks.length >= 2) {
        return [{ question: chunks[chunks.length - 2], answer: chunks[chunks.length - 1], provider: PROVIDER }];
      }
      return [];
    }
    const pairs = [];
    for (let i = 0; i + 1 < blocks.length; i += 2) {
      pairs.push({ question: blocks[i], answer: blocks[i + 1], provider: PROVIDER });
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
      const pairs = extractGemini();
      const turn = pairs[pairs.length - 1];
      if (!turn?.answer) {
        alert("MuhanAI: could not extract Gemini answer.");
        return;
      }
      chrome.runtime.sendMessage({
        type: "IMPORT_TO_MUHANAI",
        payload: {
          provider: PROVIDER,
          question: turn.question || "(from Gemini)",
          answer: turn.answer,
          source: "browser",
          metadata: { url: location.href, model: "gemini-web" },
        },
      }, (res) => {
        if (!res?.ok) alert("Import failed: " + (res?.error || "unknown"));
        else alert("Imported. id=" + (res.data?.id || "?"));
      });
    });
    document.documentElement.appendChild(btn);
  }
  chrome.runtime.onMessage?.addListener((msg, _s, sendResponse) => {
    if (msg.type === "EXTRACT") { sendResponse(extractGemini()); return true; }
    return false;
  });
  ensureFab();
})();
