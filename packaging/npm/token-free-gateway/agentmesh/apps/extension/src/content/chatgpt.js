/**
 * ChatGPT content script — user-initiated Q/A extract only.
 * NEVER reads document.cookie or uploads session tokens.
 */
(function () {
  const PROVIDER = "chatgpt";

  function extractChatGPT() {
    const messages = document.querySelectorAll("[data-message-author-role]");
    const pairs = [];
    let lastUser = null;
    for (const msg of messages) {
      const role = msg.getAttribute("data-message-author-role");
      const text = (msg.innerText || msg.textContent || "").trim();
      if (!text) continue;
      if (role === "user") lastUser = text;
      else if (role === "assistant" && lastUser) {
        pairs.push({ question: lastUser, answer: text, provider: PROVIDER });
        lastUser = null;
      }
    }
    return pairs;
  }

  function extractLastTurn() {
    const pairs = extractChatGPT();
    return pairs.length ? pairs[pairs.length - 1] : { question: "", answer: "" };
  }

  function ensureFab() {
    if (document.getElementById("muhan-bridge-fab")) return;
    const btn = document.createElement("button");
    btn.id = "muhan-bridge-fab";
    btn.textContent = "→ MuhanAI";
    btn.title = "Import last answer (no cookies sent)";
    Object.assign(btn.style, {
      position: "fixed", bottom: "24px", right: "24px", zIndex: "2147483647",
      padding: "10px 14px", borderRadius: "10px", border: "none",
      background: "#10b981", color: "#04110c", fontWeight: "700", fontSize: "13px",
      cursor: "pointer", boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
    });
    btn.addEventListener("click", () => {
      const turn = extractLastTurn();
      if (!turn.answer) {
        alert("MuhanAI: no assistant answer found on this page.");
        return;
      }
      btn.disabled = true;
      chrome.runtime.sendMessage(
        {
          type: "IMPORT_TO_MUHANAI",
          payload: {
            provider: PROVIDER,
            question: turn.question || "(from ChatGPT)",
            answer: turn.answer,
            source: "browser",
            metadata: { url: location.href, model: "chatgpt-web" },
          },
        },
        (res) => {
          btn.disabled = false;
          if (chrome.runtime.lastError) {
            alert("MuhanAI: " + chrome.runtime.lastError.message);
            return;
          }
          if (!res?.ok) alert("Import failed: " + (res?.error || "unknown"));
          else alert("Imported to MuhanAI. id=" + (res.data?.id || res.result?.id || "?"));
        },
      );
    });
    document.documentElement.appendChild(btn);
  }

  chrome.runtime.onMessage?.addListener((msg, _s, sendResponse) => {
    if (msg.type === "EXTRACT") {
      sendResponse(extractChatGPT());
      return true;
    }
    return false;
  });

  ensureFab();
})();
