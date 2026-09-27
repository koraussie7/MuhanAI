import { describe, expect, it } from "vitest";
import { XLangClient } from "./client";
import { XLangEngine } from "./xlang-engine";

function response(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
	status,
		headers: { "content-type": "application/json" },
	});
}

describe("XLangClient", () => {
	it("checks health and reads capabilities", async () => {
	const fetcher: typeof fetch = async (_input, init) => {
	const body = typeof init?.body === "string" ? init.body : await new Response(init?.body).text();
	const method = JSON.parse(body || "{}").method;
	if (method === "health") return response({ id: "1", ok: true });
	return response({
	id: "2",
	ok: true,
	result: {
	peer: { peerId: "xlang-1", version: "0.1.0", models: ["qwen"], supportsStreaming: true },
	capabilities: [{ name: "workflow", kind: "workflow" }],
	},
	});
	};
	const client = new XLangClient({ endpoint: "http://xlang.test", fetcher });
		expect(await client.health()).toBe(true);
		expect(await client.capabilities()).toMatchObject({
	peerId: "xlang-1",
		runtime: "xlang",
	models: ["qwen"],
	});
	});

	it("returns chat text and maps remote errors", async () => {
	const fetcher: typeof fetch = async (_input, init) => {
	const body = typeof init?.body === "string" ? init.body : await new Response(init?.body).text();
	const method = JSON.parse(body || "{}").method;
	return method === "chat"
	? response({ id: "1", ok: true, result: { text: "hello" } })
	: response({ id: "1", ok: false, error: { code: "NO_RUNTIME", message: "not ready" } });
	};
	const client = new XLangClient({ endpoint: "http://xlang.test", fetcher });
		expect(await client.chat("hi")).toBe("hello");
	await expect(client.execute({ steps: [] })).rejects.toThrow("not ready");
	});
});

describe("XLangEngine", () => {
	it("initializes and delegates chat", async () => {
	const fetcher: typeof fetch = async (_input, init) => {
	const body = typeof init?.body === "string" ? init.body : await new Response(init?.body).text();
	const method = JSON.parse(body || "{}").method;
	if (method === "health") return response({ id: "1", ok: true });
	if (method === "capabilities") {
	return response({ id: "2", ok: true, result: { peer: { peerId: "p" }, capabilities: [] } });
	}
	return response({ id: "3", ok: true, result: { text: "from xlang" } });
	};
	const engine = new XLangEngine({ type: "xlang", endpoint: "http://xlang.test" });
	// Inject the transport seam without coupling production code to a test server.
	(engine as unknown as { client: XLangClient }).client = new XLangClient({
	endpoint: "http://xlang.test",
	fetcher,
	});
	(engine as unknown as { status: { ready: boolean } }).status.ready = true;
		expect(await engine.chat("hello")).toBe("from xlang");
	await engine.dispose();
		expect(engine.getStatus().ready).toBe(false);
	});
});
