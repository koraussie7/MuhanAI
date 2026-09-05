import { handleFeedApi } from "./feed-api";

// Minimal KV type so the worker typechecks without @cloudflare/workers-types.
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
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      // Feed & mesh endpoints (pulse, network, agents, cast, help-needed, verify, etc.)
      // are served directly by the Worker so the site works reliably on edge.
      const feedResponse = await handleFeedApi(request, url.pathname, env.FEED_KV);
      if (feedResponse) return feedResponse;

      if (!env.API_ORIGIN) {
        return new Response(JSON.stringify({ error: "Origin not configured" }), {
          status: 502,
          headers: { "content-type": "application/json" },
        });
      }

      const origin = new URL(env.API_ORIGIN);
      origin.pathname = url.pathname;
      origin.search = url.search;
      const headers = new Headers(request.headers);
      headers.set("Host", origin.host);
      const init: RequestInit = { method: request.method, headers, redirect: "follow" };
      if (request.method !== "GET" && request.method !== "HEAD") init.body = request.body;

      try {
        return await fetch(new Request(origin, init));
      } catch (err: any) {
        return new Response(JSON.stringify({ error: "Upstream origin unavailable", message: err?.message }), {
          status: 502,
          headers: { "content-type": "application/json" },
        });
      }
    }

    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 404 || url.pathname.includes(".")) return asset;
    return env.ASSETS.fetch(new Request(new URL("/index.html", request.url), request));
  },
};
