import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createOpsMaxxBridge } from "../factory.js";

let server: Server | undefined;

/**
 * RPC method → response body table. Each entry is the exact value the
 * integration test expects to round-trip back through the bridge. The
 * HTTP server uses this to answer any of the 14 methods without
 * special-casing in the request handler.
 */
const RPC_RESPONSES: Record<string, unknown> = {
	"vault.list": [{ service: "openai", hasSecret: true, updatedAt: 1 }],
	"vault.get": { service: "openai", hasSecret: true, updatedAt: 1 },
	"vault.set": null,
	"vault.remove": null,
	"ssh.list": [{ id: "ssh-1", label: "prod", host: "10.0.0.1", port: 22, username: "ops", authRef: "vault://openai" }],
	"ssh.open": { sessionId: "sess-1" },
	"ssh.exec": { stdout: "ok", stderr: "", exitCode: 0 },
	"ssh.close": null,
	"db.list": [{ id: "db-1", label: "prod-pg", engine: "postgres", host: "10.0.0.2", port: 5432, database: "main" }],
	"db.query": { rows: [{ n: 1 }], columns: ["n"], rowCount: 1 },
	"db.write": { affectedRows: 2 },
	"approval.check": true,
	"approval.request": true,
	"mcp.publish": null,
};

async function startRpcServer(): Promise<string> {
	const created = createServer(async (request: IncomingMessage, response: ServerResponse) => {
		// Request-level error listener so a peer disconnect cannot deadlock
		// the test waiting for a response that will never arrive.
		request.on("error", () => {
			try {
				response.end();
			} catch {
				// Socket already torn down — nothing to do.
			}
		});

		try {
			let body = "";
			for await (const chunk of request) body += chunk;
			const rpc = JSON.parse(body) as { id: string; method: string; params: Record<string, unknown> };
			// Branch on rpc.id so a test can drive the server into a
			// specific error envelope. Any id starting with "err:" yields
			// a JSON-RPC error object whose `code` is the stringified
			// BridgeErrorCode (the IPC client's mapWireError accepts
			// string codes via the VALID_ERROR_CODES set).
			let envelope: Record<string, unknown>;
			if (typeof rpc.id === "string" && rpc.id.startsWith("err:")) {
				// The factory builds ids as `err:<code>:<uuid>`, so slice off
				// the `err:` marker and then cut at the next `:` to recover
				// just the BridgeErrorCode segment. Keeping the trailing
				// `:<uuid>` would make the code fail the VALID_ERROR_CODES
				// lookup and every case would collapse to `internal`.
				const rest = rpc.id.slice("err:".length);
				const sep = rest.indexOf(":");
				const code = sep === -1 ? rest : rest.slice(0, sep);
				envelope = {
					jsonrpc: "2.0",
					id: rpc.id,
					error: { code, message: `forced ${code}` },
				};
			} else {
				const result = rpc.method in RPC_RESPONSES ? RPC_RESPONSES[rpc.method] : null;
				envelope = { jsonrpc: "2.0", id: rpc.id, result };
			}
			response.writeHead(200, { "content-type": "application/json" });
			response.end(JSON.stringify(envelope));
		} catch (error) {
			// JSON-RPC parse error (-32700) so the bridge surfaces a
			// well-formed error envelope rather than a transport-level throw.
			try {
				response.writeHead(200, { "content-type": "application/json" });
				response.end(
					JSON.stringify({
						jsonrpc: "2.0",
						id: null,
						error: { code: -32700, message: "Parse error", data: String(error) },
					}),
				);
			} catch {
				// Connection already gone.
			}
		}
	});

	// Swallow low-level server errors so they never bubble up and
	// stall the test runner.
	created.on("error", () => { });

	server = created;
	await new Promise<void>((resolve, reject) => {
		const onError = (error: Error) => {
			server = undefined;
			reject(error);
		};
		created.once("error", onError);
		created.listen(0, "127.0.0.1", () => {
			created.off("error", onError);
			// Small delay to ensure the server is fully ready to accept connections
			setTimeout(resolve, 10);
		});
	});
	const address = server?.address();
	if (!address || typeof address === "string") throw new Error("RPC server did not bind");
	return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
	await new Promise<void>((resolve, reject) => {
		if (!server) return resolve();
		server.close((error) => (error ? reject(error) : resolve()));
	});
	server = undefined;
});

describe("OpsMaxx HTTP JSON-RPC integration", () => {
	it("connects the production factory to an OpsMaxx-compatible endpoint", async () => {
		const endpoint = await startRpcServer();
		const bridge = await createOpsMaxxBridge({ mode: "ipc", endpoint });

		const vault = await bridge.vault.list();
		expect(vault).toEqual({
			ok: true,
			value: [{ service: "openai", hasSecret: true, updatedAt: 1 }],
		});

		const write = await bridge.databases.write("prod", "UPDATE users SET active = $1", [true]);
		expect(write).toEqual({ ok: true, value: { affectedRows: 2 } });
		await bridge.close();
	});

	it("auto mode falls back to memory when the endpoint is unavailable", async () => {
		const bridge = await createOpsMaxxBridge({
			mode: "auto",
			endpoint: "http://127.0.0.1:1",
			timeoutMs: 20,
		});
		const result = await bridge.vault.list();
		expect(result).toEqual({ ok: true, value: [] });
		await bridge.close();
	});

	// Parameterized round-trip across every method on every namespace.
	// Each case drives the live HTTP transport end-to-end and asserts
	// the bridge returns exactly what the mock RPC server emitted.
	const roundTripCases: ReadonlyArray<{
		readonly label: string;
		readonly invoke: (bridge: Awaited<ReturnType<typeof createOpsMaxxBridge>>) => Promise<unknown>;
		readonly expected: unknown;
	}> = [
			{
				label: "vault.list",
				invoke: (b) => b.vault.list(),
				expected: { ok: true, value: [{ service: "openai", hasSecret: true, updatedAt: 1 }] },
			},
			{
				label: "vault.get",
				invoke: (b) => b.vault.get("openai"),
				expected: { ok: true, value: { service: "openai", hasSecret: true, updatedAt: 1 } },
			},
			{
				label: "vault.set",
				invoke: (b) => b.vault.set("openai", "sk-x", "note"),
				expected: { ok: true, value: null },
			},
			{
				label: "vault.remove",
				invoke: (b) => b.vault.remove("openai"),
				expected: { ok: true, value: null },
			},
			{
				label: "ssh.list",
				invoke: (b) => b.ssh.listConnections(),
				expected: {
					ok: true,
					value: [
						{ id: "ssh-1", label: "prod", host: "10.0.0.1", port: 22, username: "ops", authRef: "vault://openai" },
					],
				},
			},
			{
				label: "ssh.open",
				invoke: (b) => b.ssh.open("ssh-1"),
				expected: { ok: true, value: { sessionId: "sess-1" } },
			},
			{
				label: "ssh.exec",
				invoke: (b) => b.ssh.exec("sess-1", "uptime"),
				expected: { ok: true, value: { stdout: "ok", stderr: "", exitCode: 0 } },
			},
			{
				label: "ssh.close",
				invoke: (b) => b.ssh.close("sess-1"),
				expected: { ok: true, value: null },
			},
			{
				label: "db.list",
				invoke: (b) => b.databases.listConnections(),
				expected: {
					ok: true,
					value: [
						{ id: "db-1", label: "prod-pg", engine: "postgres", host: "10.0.0.2", port: 5432, database: "main" },
					],
				},
			},
			{
				label: "db.query",
				invoke: (b) => b.databases.query("db-1", "SELECT 1 AS n", []),
				expected: { ok: true, value: { rows: [{ n: 1 }], columns: ["n"], rowCount: 1 } },
			},
			{
				label: "db.write",
				invoke: (b) => b.databases.write("db-1", "UPDATE t SET a=$1", [1]),
				expected: { ok: true, value: { affectedRows: 2 } },
			},
			{
				label: "approval.check",
				invoke: (b) => b.security.isApprovedByUser("opsmaxx_ssh_exec", { host: "x" }),
				expected: { ok: true, value: true },
			},
			{
				label: "approval.request",
				invoke: (b) =>
					b.security.requestApproval({
						capability: "opsmaxx_ssh_exec",
						risk: "needs-approval",
						summary: "Run uptime on prod",
						args: { host: "x" },
						preview: { command: "uptime" },
					}),
				expected: { ok: true, value: true },
			},
			{
				label: "mcp.publish",
				invoke: (b) =>
					b.aiGateway.publishMcpTool({
						name: "demo",
						description: "d",
						inputSchema: { type: "object", properties: {} },
					}),
				expected: { ok: true, value: null },
			},
		];

	for (const testCase of roundTripCases) {
		it(`round-trips ${testCase.label} over HTTP`, async () => {
			const endpoint = await startRpcServer();
			const bridge = await createOpsMaxxBridge({ mode: "ipc", endpoint, timeoutMs: 1000 });
			const result = await testCase.invoke(bridge);
			expect(result).toEqual(testCase.expected);
			await bridge.close();
		});
	}

	// Wire-level idPrefix coverage: mount a server that captures the
	// exact JSON-RPC id the transport emits, and assert that the
	// prefix is prepended verbatim. Without this, the prefix is only
	// exercised indirectly (via the err:<code>: round-trip below),
	// which can regress silently if a future refactor breaks the
	// plumbing without breaking the error envelope behavior.
	it("prepends idPrefix to the JSON-RPC request id on the wire", async () => {
		const capturedIds: string[] = [];
		const captureServer = createServer(async (request, response) => {
			request.on("error", () => {
				try {
					response.end();
				} catch {
					// Socket already torn down.
				}
			});
			try {
				let body = "";
				for await (const chunk of request) body += chunk;
				const rpc = JSON.parse(body) as { id: string; method: string };
				capturedIds.push(rpc.id);
				response.writeHead(200, { "content-type": "application/json" });
				response.end(
					JSON.stringify({
						jsonrpc: "2.0",
						id: rpc.id,
						result: RPC_RESPONSES[rpc.method] ?? null,
					}),
				);
			} catch {
				try {
					response.writeHead(200, { "content-type": "application/json" });
					response.end(
						JSON.stringify({
							jsonrpc: "2.0",
							id: null,
							error: { code: -32700, message: "Parse error" },
						}),
					);
				} catch {
					// Connection already gone.
				}
			}
		});
		captureServer.on("error", () => {});
		server = captureServer;
		await new Promise<void>((resolve) => captureServer.listen(0, "127.0.0.1", resolve));
		const address = captureServer.address();
		if (!address || typeof address === "string") throw new Error("capture server did not bind");
		const endpoint = `http://127.0.0.1:${address.port}`;

		const bridge = await createOpsMaxxBridge({
			mode: "ipc",
			endpoint,
			timeoutMs: 1000,
			idPrefix: "probe-",
		});
		await bridge.vault.list();
		await bridge.security.isApprovedByUser("opsmaxx_ssh_exec", { tag: 1 });

		expect(capturedIds.length).toBeGreaterThan(0);
		for (const id of capturedIds) {
			expect(typeof id).toBe("string");
			expect(id.startsWith("probe-")).toBe(true);
		}
		await bridge.close();
	});

	// Error envelope coverage: every BridgeErrorCode variant that the
	// IPC layer is allowed to surface. Each case seeds the bridge
	// factory with a vault.list whose id is prefixed "err:<code>", so
	// the test server emits a JSON-RPC error envelope and the factory
	// is expected to resolve it into the matching BridgeErrorCode.
	const ERROR_CODES = [
		"not_connected",
		"permission_denied",
		"approval_required",
		"approval_denied",
		"user_not_authenticated",
		"host_unreachable",
		"auth_failed",
		"timeout",
		"invalid_args",
		"internal",
	] as const;

	for (const code of ERROR_CODES) {
		it(`resolves BridgeErrorCode ${code} from a JSON-RPC error envelope`, async () => {
			const endpoint = await startRpcServer();
			// Use the factory's idPrefix option so every generated
			// request id starts with `err:<code>`. The mock server
			// branches on this prefix and replies with a JSON-RPC error
			// envelope whose code matches the variant under test, which
			// the IPC layer resolves back to the matching BridgeErrorCode.
			const bridge = await createOpsMaxxBridge({
				mode: "ipc",
				endpoint,
				timeoutMs: 1000,
				idPrefix: `err:${code}:`,
			});
			const result = await bridge.security.isApprovedByUser("opsmaxx_ssh_exec", { probe: code });
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error.code).toBe(code);
			}
			await bridge.close();
		});
	}
});
