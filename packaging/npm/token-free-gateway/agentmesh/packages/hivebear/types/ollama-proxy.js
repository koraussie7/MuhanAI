export class OllamaProxy {
	target;
	client = null;
	constructor(target = "http://127.0.0.1:11434") {
		this.target = target;
	}
	withClient(client) {
		this.client = client;
		return this;
	}
	createHandler() {
		return async (req, res) => {
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
				res.end(JSON.stringify({ error: `HiveBear proxy error: ${error.message}` }));
			}
		};
	}
}
function normalizeHeaders(headers) {
	const out = {};
	for (const [key, value] of Object.entries(headers)) {
		if (typeof value === "string") out[key] = value;
		else if (Array.isArray(value)) out[key] = value[value.length - 1] ?? "";
	}
	return out;
}
async function streamBody(req) {
	const chunks = [];
	for await (const chunk of req) {
		chunks.push(chunk);
	}
	return Buffer.concat(chunks);
}
//# sourceMappingURL=ollama-proxy.js.map
