import http from "node:http";

type HttpProxyClient = typeof globalThis extends { fetch: infer F }
  ? F
  : typeof globalThis.fetch;

export class OllamaProxy {
  private readonly target: string;
  private client: HttpProxyClient | null = null;

  constructor(target = "http://127.0.0.1:11434") {
    this.target = target;
  }

  withClient(client: HttpProxyClient) {
    this.client = client;
    return this;
  }

  createHandler() {
    return async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
      const url = new URL(req.url ?? "/", this.target);
      const targetUrl = `${this.target}${url.pathname}${url.search}`;

      try {
        const response = await fetch(targetUrl, {
          method: req.method,
          headers: normalizeHeaders(req.headers),
          body: req.method !== "GET" && req.method !== "HEAD" ? await streamBody(req) : undefined,
        });

        res.statusCode = response.status;
        response.headers.forEach((value, key) => {
          if (key.toLowerCase() !== "transfer-encoding") {
            res.setHeader(key, value);
          }
        });

        const body = Buffer.from(await response.arrayBuffer());
        res.setHeader("content-length", String(body.byteLength));
        res.end(body);
      } catch (error) {
        res.statusCode = 502;
        res.setHeader("content-type", "application/json");
        const message = error instanceof Error ? error.message : String(error);
        res.end(JSON.stringify({ error: `HiveBear proxy error: ${message}` }));
      }
    };
  }
}

function normalizeHeaders(headers: http.IncomingHttpHeaders): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string") {
      out[key] = value;
    } else if (Array.isArray(value)) {
      const last = value[value.length - 1];
      if (typeof last === "string") out[key] = last;
    }
  }
  return out;
}

async function streamBody(req: http.IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}
