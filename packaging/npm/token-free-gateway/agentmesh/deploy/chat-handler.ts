/**
 * chat.muhanai.com Worker handler.
 *
 * Renders a minimal HTML shell that hydrates `BitterbotChat` and
 * runs inference entirely in the browser (WebGPU/WebLLM via
 * SippEngine, with the OpenHydra P2P fallback wired through
 * `bitterbot-engine.ts`).
 *
 * Why a separate shell instead of reusing `apps/web/index.html`?
 *   - The full SPA pulls in many routes (Dashboard, AskNetwork, etc.)
 *     that are unrelated to chat. The chat shell ships only the chat
 *     bundle, keeping the first byte small.
 *   - Future per-user logic (credit, rate limit, prompt injection)
 *     can live in this handler without touching the main SPA.
 *
 * The Worker still proxies `/assets/*` to the same Vite-built bundle
 * the main SPA uses, so there is exactly one client bundle on disk.
 */

export interface ChatHandlerOptions {
	/** Override the asset base (used by tests). */
	assetBase?: string;
	/** Cache-Control header for the SSR HTML. Defaults to "no-cache". */
	cacheControl?: string;
}

function chatShellHtml(assetBase: string): string {
	return `<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#11110f" />
    <meta name="description" content="MuhanAI Bitterbot — P2P inference chat running entirely in your browser." />
    <title>chat.muhanai.com — Bitterbot</title>
    <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 32 32%22><text y=%2226%22 font-size=%2226%22>◈</text></svg>" />
    <style>
      :root { color-scheme: dark; }
      html, body, #root { height: 100%; margin: 0; background: #0d1117; color: #e6edf3; }
      body { font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Segoe UI", sans-serif; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="${assetBase}/assets/chat.js"></script>
  </body>
</html>`;
}

/**
 * Decide if a request targets the Bitterbot chat shell. Matches the
 * chat.muhanai.com host exactly and only the document root; sub-paths
 * like /api/llm/chat and /assets/* are passed through to the regular
 * handler chain.
 */
export function isChatRequest(hostname: string, pathname: string): boolean {
	if (hostname !== "chat.muhanai.com") return false;
	return pathname === "/" || pathname === "" || pathname === "/index.html";
}

/**
 * Render the chat shell HTML. `request` is used to derive the asset
 * base when no override is supplied.
 */
export function renderChatShell(request: Request, options: ChatHandlerOptions = {}): Response {
	const url = new URL(request.url);
	const assetBase = options.assetBase ?? `${url.protocol}//${url.host}`;
	const html = chatShellHtml(assetBase);
	return new Response(html, {
		status: 200,
		headers: {
			"content-type": "text/html; charset=utf-8",
			"cache-control": options.cacheControl ?? "no-cache",
			// CSP: inline favicon (data URI), same-origin entry, ws/wss for
			// OpenHydra P2P discovery. No external CDN.
			"content-security-policy":
				"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' ws: wss:",
		},
	});
}
