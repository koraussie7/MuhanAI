interface AssetBinding {
  fetch(request: Request): Promise<Response>;
}

interface Env {
  ASSETS: AssetBinding;
  API_ORIGIN: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
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
