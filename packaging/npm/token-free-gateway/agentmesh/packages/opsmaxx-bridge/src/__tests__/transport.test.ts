/**
 * Transport-level tests for `createHttpTransport`.
 *
 * The HTTP transport is the only place that owns request-id
 * generation. These tests pin down the `idPrefix` contract that the
 * integration suite relies on: when `idPrefix` is provided, every
 * outgoing JSON-RPC request must carry an `id` that begins with
 * that prefix. This lets the test server (see
 * `http-integration.test.ts`) branch on the id and return
 * JSON-RPC error envelopes for specific cases.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createHttpTransport } from "../transport.js";

let server: Server | undefined;
let capturedBody: string | undefined;
let requestCount = 0;

async function startCapturingServer(): Promise<void> {
	server = createServer((request, response) => {
		let body = "";
		request.on("data", (chunk: Buffer) => {
			body += chunk.toString("utf8");
		});
		request.on("end", () => {
			capturedBody = body;
			response.writeHead(200, { "content-type": "application/json" });
			response.end(JSON.stringify({ jsonrpc: "2.0", id: "ok", result: null }));
		});
	});
	await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
}

afterEach(async () => {
	await new Promise<void>((resolve, reject) => {
		if (!server) return resolve();
		server.close((error) => (error ? reject(error) : resolve()));
	});
	server = undefined;
	capturedBody = undefined;
	requestCount = 0;
});

function endpoint(): string {
	const address = server?.address();
	if (!address || typeof address === "string") throw new Error("server did not bind");
	return `http://127.0.0.1:${address.port}`;
}

describe("createHttpTransport idPrefix", () => {
	it("prepends idPrefix to every outgoing JSON-RPC id", async () => {
		await startCapturingServer();
		const transport = createHttpTransport({ baseUrl: endpoint(), idPrefix: "probe-" });

		await transport.send("vault.list", {});

		expect(capturedBody).toBeDefined();
		const rpc = JSON.parse(capturedBody ?? "{}") as { id?: unknown };
		expect(typeof rpc.id).toBe("string");
		expect(String(rpc.id).startsWith("probe-")).toBe(true);

		await transport.close();
	});

	it("emits unique ids across sequential calls", async () => {
		await startCapturingServer();
		const transport = createHttpTransport({ baseUrl: endpoint(), idPrefix: "probe-" });

		await transport.send("vault.list", {});
		const firstId = (JSON.parse(capturedBody ?? "{}") as { id?: unknown }).id;
		await transport.send("vault.list", {});
		const secondId = (JSON.parse(capturedBody ?? "{}") as { id?: unknown }).id;

		expect(firstId).not.toEqual(secondId);

		await transport.close();
	});
});

describe("createHttpTransport retry policy", () => {
	/**
	 * Mount a server that answers the first `failures` requests with a
	 * 500 and every later request with a success. The counter lets the
	 * test assert exactly how many attempts the transport made.
	 */
	async function startFlakyServer(failures: number): Promise<void> {
		requestCount = 0;
		server = createServer((_request: IncomingMessage, response: ServerResponse) => {
			requestCount += 1;
			if (requestCount <= failures) {
				response.writeHead(500, { "content-type": "application/json" });
				response.end(JSON.stringify({ error: "boom" }));
				return;
			}
			response.writeHead(200, { "content-type": "application/json" });
			response.end(JSON.stringify({ jsonrpc: "2.0", id: "ok", result: "recovered" }));
		});
		await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
	}

	it("does not retry HTTP status errors", async () => {
		await startFlakyServer(Number.POSITIVE_INFINITY);
		const transport = createHttpTransport({
			baseUrl: endpoint(),
			retries: 3,
			retryDelayMs: 1,
		});

		await expect(transport.send("vault.list", {})).rejects.toThrow(/HTTP 500/);
		// A deterministic 5xx must be surfaced immediately, not replayed.
		expect(requestCount).toBe(1);

		await transport.close();
	});

	it("does not retry JSON-RPC error envelopes", async () => {
		requestCount = 0;
		server = createServer((request: IncomingMessage, response: ServerResponse) => {
			requestCount += 1;
			let body = "";
			request.on("data", (chunk: Buffer) => {
				body += chunk.toString("utf8");
			});
			request.on("end", () => {
				const rpc = JSON.parse(body) as { id: unknown };
				response.writeHead(200, { "content-type": "application/json" });
				response.end(
					JSON.stringify({
						jsonrpc: "2.0",
						id: rpc.id,
						error: { code: "permission_denied", message: "nope" },
					}),
				);
			});
		});
		await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));

		const transport = createHttpTransport({
			baseUrl: endpoint(),
			retries: 3,
			retryDelayMs: 1,
		});

		const error = await transport.send("vault.list", {}).then(
			() => null,
			(e: unknown) => e,
		);
		expect(error).toEqual({ code: "permission_denied", message: "nope", data: undefined });
		expect(requestCount).toBe(1);

		await transport.close();
	});

	it("retries a refused connection and succeeds once the server is up", async () => {
		// Point at a port with nothing listening, then bring up a real
		// server on that same port so the retry loop can recover.
		const probe = createServer();
		await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
		const address = probe.address();
		if (!address || typeof address === "string") throw new Error("probe did not bind");
		const port = address.port;
		await new Promise<void>((resolve, reject) =>
			probe.close((error) => (error ? reject(error) : resolve())),
		);

		requestCount = 0;
		server = createServer((_request: IncomingMessage, response: ServerResponse) => {
			requestCount += 1;
			response.writeHead(200, { "content-type": "application/json" });
			response.end(JSON.stringify({ jsonrpc: "2.0", id: "ok", result: "up" }));
		});

		const transport = createHttpTransport({
			baseUrl: `http://127.0.0.1:${port}`,
			retries: 5,
			retryDelayMs: 10,
		});

		// Attempt the call while the port is still closed, then open the
		// server mid-flight so a later attempt can succeed.
		const pending = transport.send("vault.list", {});
		await new Promise((resolve) => setTimeout(resolve, 15));
		await new Promise<void>((resolve) => server?.listen(port, "127.0.0.1", resolve));

		await expect(pending).resolves.toBe("up");
		expect(requestCount).toBe(1);

		await transport.close();
	});
});