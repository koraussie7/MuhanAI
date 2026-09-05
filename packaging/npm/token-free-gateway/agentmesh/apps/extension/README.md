# MuhanAI Browser Bridge (Chrome MV3 scaffold)

Phase 2 prepares the **protocol and UI contract** only. This package is a loadable extension skeleton.

## Security contract (non-negotiable)

- **Never** read, store, or upload ChatGPT / Claude / Gemini passwords.
- **Never** upload session cookies to the MuhanAI server.
- **Never** replay consumer web sessions on the server.
- Answers leave the browser **only** when the user clicks **Import to MuhanAI**.
- Payload is plain Q/A JSON via `POST /api/ai/import`.

## Install (unpacked)

1. Open `chrome://extensions`
2. Enable Developer mode
3. Load unpacked → select this `apps/extension` folder
4. Open the popup → set **MuhanAI API base** (e.g. `http://127.0.0.1:4000`)

## Supported sites (content scripts)

| Provider id   | URL                         | Mode    |
|---------------|-----------------------------|---------|
| `chatgpt`     | chatgpt.com / chat.openai.com | browser |
| `claude`      | claude.ai                   | browser |
| `gemini-web`  | gemini.google.com           | browser |

## Import API contract

```http
POST {MUHAN_API}/api/ai/import
Content-Type: application/json

{
  "provider": "chatgpt" | "claude" | "gemini-web",
  "question": "...",
  "answer": "...",
  "source": "browser",
  "metadata": {
    "conversationId": "...",
    "model": "...",
    "url": "https://..."
  }
}
```

## Relay (future)

```http
GET  {MUHAN_API}/api/ai/relay
POST {MUHAN_API}/api/ai/relay
{ "question": "...", "from": "claude", "to": "gemini" }
```

Extension will later poll pending relay tasks and help the user paste into the target AI UI — still **no** server-side automation of login.

## Next implementation steps

1. Harden DOM selectors per site (ChatGPT/Claude/Gemini change often)
2. Selection UI: pick last turn vs custom range
3. Short-lived origin token instead of open localhost
4. Heartbeat so My AI page shows Browser Bridge as connected
5. Optional: side panel instead of popup

## Layout

```
apps/extension/
  manifest.json
  package.json
  README.md
  src/
    background.js
    popup.html / popup.js
    options.html / options.js
    shared/config.js
    content/chatgpt.js
    content/claude.js
    content/gemini.js
```
