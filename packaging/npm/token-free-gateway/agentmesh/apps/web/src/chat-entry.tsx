/**
 * chat.muhanai.com entry point.
 *
 * Vite treats this file as the root for chat.muhanai.com (configured in
 * vite.config.ts via the chatHost rollup option). It mounts only
 * `BitterbotChat` — no router, no dashboard, no app shell.
 *
 * Inference happens entirely in the browser:
 *   1. WebGPU path: SippEngine (WebLLM) downloads phi-3-mini-q4 on first run.
 *   2. localhost path: tries local OpenAI-compatible servers (nanos / ollama).
 *   3. P2P path: OpenHydraEngine, wired in Part C of the bitterbot
 *      integration; activated when `OPENHYDRA_BOOTSTRAP` env is set
 *      at build time (see apps/web/vite.config.ts).
 *
 * Local history is persisted to localStorage under
 * `muhanai.bitterbot.history.v1` so a refresh keeps the conversation.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BitterbotChat } from "./components/bitterbot/BitterbotChat";

const container = document.getElementById("root");
if (!container) {
	throw new Error("chat.muhanai.com: #root element missing from SSR shell");
}

createRoot(container).render(
	<StrictMode>
		<BitterbotChat />
	</StrictMode>,
);
