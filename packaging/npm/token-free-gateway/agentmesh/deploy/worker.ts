// Minimal KV type so the worker typechecks without @cloudflare/workers-types.
interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

interface AssetBinding {
  fetch(request: Request): Promise<Response>;
}

import { handleFeedApi } from "./feed-api";

interface Env {
  ASSETS: AssetBinding;
  API_ORIGIN: string;
  FEED_KV?: KVNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      // Feed endpoints (pulse / help-needed / verify) are served directly by the
      // Worker so the site works without the separate backend origin.
      const feedResponse = await handleFeedApi(request, url.pathname, env.FEED_KV);
      if (feedResponse) return feedResponse;

      const origin = new URL(env.API_ORIGIN);
      origin.pathname = url.pathname;
      origin.search = url.search;
      const headers = new Headers(request.headers);
      headers.set("Host", origin.host);
      const init: RequestInit = { method: request.method, headers, redirect: "follow" };
      if (request.method !== "GET" && request.method !== "HEAD") init.body = request.body;
      return fetch(new Request(origin, init));
    }

    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 404 || url.pathname.includes(".")) return asset;

    return env.ASSETS.fetch(new Request(new URL("/index.html", request.url), request));
  },
};
