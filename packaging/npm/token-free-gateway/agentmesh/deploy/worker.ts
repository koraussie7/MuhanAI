import { isChatRequest, renderChatShell } from "./chat-handler";
import { handleFediverseRequest } from "./fediverse";
import { handleFeedApi } from "./feed-api";
import { handleMcpRequest } from "./mcp-server";
import { handleP2pInferenceRequest } from "./p2p-inference";
import { handleTravelApi } from "./travel-api";
import { handleXLangPeersRequest } from "./xlang-peers";

interface KVNamespace {
	get(key: string): Promise<string | null>;
	put(key: string, value: string): Promise<void>;
}

interface AssetBinding {
	fetch(request: Request): Promise<Response>;
}

interface Env {
	ASSETS: AssetBinding;
	API_ORIGIN: string;
	FEED_KV?: KVNamespace;
	TOURMIND_USER_KEY?: string;
	/**
	 * Public JSON snapshot of XLang peers, published by the AgentMesh node
	 * process from `XLangRegistry`. Optional: when unset the endpoint returns
	 * an empty peer list so the dashboard degrades instead of failing.
	 */
	XLANG_PEERS_JSON?: string;
	/**
	 * Public JSON snapshot of P2P inference peers (`P2pNodeRegistry` +
	 * OpenHydra nodes). When unset, `/api/p2p/peers` falls back to the XLang
	 * capability snapshot so XLang peers still appear.
	 */
	P2P_PEERS_JSON?: string;
	/**
	 * Mesh gateway that forwards prompts to peers. Required before
	 * `POST /api/p2p/inference` can dispatch; without it the endpoint returns
	 * 503 `dispatch-not-configured` rather than pretending to succeed.
	 */
	P2P_INFERENCE_ORIGIN?: string;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		// chat.muhanai.com — minimal SSR shell that hydrates BitterbotChat.
		// Runs BEFORE every other branch so /api/* on this host still routes
		// to the chat shell unless the inner branches match.
		if (isChatRequest(url.hostname, url.pathname)) {
			return renderChatShell(request);
		}
		// ActivityPub & Fediverse Protocols (.well-known/webfinger, nodeinfo, actor, inbox/outbox)
		const fediverseResponse = await handleFediverseRequest(request, url, env.FEED_KV);
		if (fediverseResponse) return fediverseResponse;

		// Model Context Protocol (MCP) server endpoints (/api/mcp/*, /.well-known/mcp.json)
		const mcpResponse = await handleMcpRequest(request, url, env);
		if (mcpResponse) return mcpResponse;

		if (url.pathname === "/test-worker") {
			return new Response("worker-alive", { status: 200 });
		}

		// OpenRouter OAuth (PKCE) code exchange — lets users connect their own
		// OpenRouter account in one click from the Cosmic Prompt BYOK panel.
		// The browser cannot call openrouter.ai/api/v1/auth/keys directly for the
		// exchange (no CORS), so the Worker performs the server-side swap.
		if (url.pathname === "/api/openrouter/oauth/exchange" && request.method === "POST") {
			try {
				const body = (await request.json()) as { code?: string; code_verifier?: string };
				if (!body.code || !body.code_verifier) {
					return new Response(JSON.stringify({ error: "Missing code or code_verifier" }), {
						status: 400,
						headers: { "content-type": "application/json" },
					});
				}
				const orRes = await fetch("https://openrouter.ai/api/v1/auth/keys", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ code: body.code, code_verifier: body.code_verifier }),
				});
				const orData = (await orRes.json()) as { key?: string };
				if (!orRes.ok || !orData.key) {
					return new Response(
						JSON.stringify({ error: "OpenRouter exchange failed", status: orRes.status }),
						{
							status: 502,
							headers: { "content-type": "application/json" },
						},
					);
				}
				return new Response(JSON.stringify({ key: orData.key }), {
					headers: { "content-type": "application/json" },
				});
			} catch (err: any) {
				return new Response(JSON.stringify({ error: "Exchange error", message: err?.message }), {
					status: 500,
					headers: { "content-type": "application/json" },
				});
			}
		}

		if (url.pathname.startsWith("/api/")) {
			const p2pResponse = await handleP2pInferenceRequest(request, env);
			if (p2pResponse.status !== 404) return p2pResponse;

			const xlangPeersResponse = handleXLangPeersRequest(request, env);
			if (xlangPeersResponse.status !== 404) return xlangPeersResponse;

			const travelResponse = await handleTravelApi(request, url.pathname, env);
			if (travelResponse) return travelResponse;

			const feedResponse = await handleFeedApi(request, url.pathname, env.FEED_KV);
			if (feedResponse) return feedResponse;

			if (!env.API_ORIGIN) {
				if (url.pathname.startsWith("/api/vietnam/")) {
					return new Response(
						JSON.stringify({
							query: new URL(request.url).searchParams.get("q") ?? "",
							category: "news",
							items: [],
							fetchedAt: new Date().toISOString(),
							configured: false,
							message:
								"Set NAVER_CLIENT_ID and NAVER_CLIENT_SECRET on the API service, then set API_ORIGIN.",
						}),
						{
							status: 200,
							headers: {
								"content-type": "application/json",
								"Access-Control-Allow-Origin": "*",
							},
						},
					);
				}

				return new Response(
					JSON.stringify({
						error: "origin-not-configured",
						message: "API_ORIGIN is unset. Deploy api.muhanai.com and Caddy first.",
						help: "Run deploy/setup-caddy-muhanai.sh on the origin host, then set API_ORIGIN=https://api.muhanai.com",
					}),
					{
						status: 503,
						headers: { "content-type": "application/json" },
					},
				);
			}

			let origin: URL;
			try {
				origin = new URL(env.API_ORIGIN);
			} catch {
				return new Response(
					JSON.stringify({
						error: "origin-malformed",
						message: "API_ORIGIN is not a valid URL",
						value: env.API_ORIGIN,
					}),
					{
						status: 503,
						headers: { "content-type": "application/json" },
					},
				);
			}

			// Cloudflare Workers (error 1003) and most WAFs reject fetch() to raw IP
			// origins. Force callers to use a hostname. The intended setup is
			// https://api.muhanai.com behind Caddy on port 110.
			if (/^\d+\.\d+\.\d+\.\d+$/.test(origin.hostname)) {
				return new Response(
					JSON.stringify({
						error: "origin-is-raw-ip",
						message: "API_ORIGIN must be a hostname, not a raw IP (CF WAF error 1003).",
						help: "Set API_ORIGIN=https://api.muhanai.com after deploying Caddy on the origin host.",
					}),
					{
						status: 503,
						headers: { "content-type": "application/json" },
					},
				);
			}

			origin.pathname = url.pathname;
			origin.search = url.search;

			const headers = new Headers(request.headers);
			headers.set("Host", origin.host);

			const init: RequestInit = {
				method: request.method,
				headers,
				redirect: "follow",
			};
			if (request.method !== "GET" && request.method !== "HEAD") init.body = request.body;

			try {
				return await fetch(new Request(origin, init));
			} catch (err: any) {
				return new Response(
					JSON.stringify({
						error: "upstream-unavailable",
						message: err?.message,
					}),
					{
						status: 502,
						headers: { "content-type": "application/json" },
					},
				);
			}
		}

		// Dashboard v2 — self-contained static page served directly from ASSETS.
		// Must come BEFORE the SPA routing below: it has no file extension, so
		// without this rule /dashboard2 would fall through to /index.html
		// (the React SPA). Same path set as the Vite dev plugin
		// (DASHBOARD_V2_ROUTES) and the Caddy/nginx deploy configs.
		// `/dashboard` is intentionally NOT listed: it stays with the React SPA
		// `<Dashboard>` component.
		if (url.pathname === "/dashboard2" || url.pathname === "/dashboard2/") {
			// ASSETS runs with the wrangler-default html_handling ("auto-trailing-slash"):
			// fetching "/dashboard-v2.html" returns a 307 redirect to the
			// extension-less pretty URL "/dashboard-v2", so request the pretty
			// URL directly and serve the page body in one hop.
			return env.ASSETS.fetch(new Request(new URL("/dashboard-v2", request.url), request));
		}

		// SPA routing: for non-asset browser navigation, always serve /index.html
		if (!url.pathname.includes(".") && !url.pathname.startsWith("/api/")) {
			const indexReq = new Request(new URL("/index.html", request.url), {
				method: "GET",
				headers: request.headers,
			});
			return env.ASSETS.fetch(indexReq);
		}
		// Direct fetch asset
		const asset = await env.ASSETS.fetch(request);
		// If not found or redirected, serve index.html for SPA routing
		if (
			asset.status === 404 ||
			asset.status === 307 ||
			(!url.pathname.includes(".") && asset.status >= 300)
		) {
			return env.ASSETS.fetch(new Request(new URL("/index.html", request.url), request));
		}

		return asset;
	},
};
