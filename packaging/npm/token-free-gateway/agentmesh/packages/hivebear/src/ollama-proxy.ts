import http from "node:http";

export class OllamaProxy {
  private readonly target: string;
  private client: any = null;

  constructor(target = "http://127.0.0.1:11434") {
    this.target = target;
  }

  withClient(client: any) {
    this.client = client;
    return this;
  }

  createHandler() {
    return async (req: http.IncomingMessage, res: http.ServerResponse) => {
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

        const body = await response.arrayBuffer();
        res.setHeader("content-length", Buffer.byteLength(body));
        res.end(body);
      } catch (error) {
        res.statusCode = 502;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: `HiveBear proxy error: ${(error as Error).message}` }));
      }
    };
  }
}

function normalizeHeaders(headers: http.IncomingHttpHeaders): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string") out[key] = value;
    else if (Array.isArray(value)) out[key] = value[value.length - 1] ?? "";
  }
  return out;
}

async function streamBody(req: http.IncomingMessage): Promise<Buffer | undefined> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
