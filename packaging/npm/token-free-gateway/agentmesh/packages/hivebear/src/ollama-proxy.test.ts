import http from "node:http";
import { describe, expect, it } from "vitest";
import { defaultGuard, OllamaProxy } from "./ollama-proxy.js";

describe("OllamaProxy SSRF guard", () => {
	describe("defaultGuard", () => {
		it("accepts a literal IPv4 loopback target", async () => {
			const result = await defaultGuard.validate("http://127.0.0.1:11434");
			expect(result.ok).toBe(true);
		});

		it("accepts a literal IPv6 loopback target", async () => {
			const result = await defaultGuard.validate("http://[::1]:11434");
			expect(result.ok).toBe(true);
		});

		it("rejects the cloud metadata endpoint (169.254.169.254)", async () => {
			const result = await defaultGuard.validate(
				"http://169.254.169.254/latest/meta-data/iam/security-credentials/",
			);
			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.reason).toMatch(/private|reserved/i);
		});

		it("rejects RFC1918 private IPv4 (10.0.0.0/8)", async () => {
			const result = await defaultGuard.validate("http://10.0.0.5:11434");
			expect(result.ok).toBe(false);
		});

		it("rejects RFC1918 private IPv4 (192.168.0.0/16)", async () => {
			const result = await defaultGuard.validate("http://192.168.1.10:11434");
			expect(result.ok).toBe(false);
		});

		it("rejects RFC1918 private IPv4 (172.16.0.0/12)", async () => {
			const result = await defaultGuard.validate("http://172.20.5.1:11434");
			expect(result.ok).toBe(false);
		});

		it("rejects IPv6 link-local (fe80::/10)", async () => {
			const result = await defaultGuard.validate("http://[fe80::1]:11434");
			expect(result.ok).toBe(false);
		});

		it("rejects IPv6 unique-local (fc00::/7)", async () => {
			const result = await defaultGuard.validate("http://[fc00::1]:11434");
			expect(result.ok).toBe(false);
		});

		it("rejects IPv4-mapped IPv6 of a private IP", async () => {
			// ::ffff:127.0.0.1 is loopback so it passes; pick a private one.
			const result = await defaultGuard.validate("http://[::ffff:10.0.0.1]:11434");
			expect(result.ok).toBe(false);
		});

		it("rejects non-http(s) protocols", async () => {
			const result = await defaultGuard.validate("file:///etc/passwd");
			expect(result.ok).toBe(false);
		});

		it("rejects an invalid URL", async () => {
			const result = await defaultGuard.validate("not-a-url");
			expect(result.ok).toBe(false);
		});

		it("accepts hostnames resolving only to loopback (localhost)", async () => {
			const result = await defaultGuard.validate("http://localhost:11434");
			expect(result.ok).toBe(true);
		});

		it("rejects hostname that cannot be resolved", async () => {
			const result = await defaultGuard.validate("http://does-not-exist.invalid:11434");
			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.reason).toMatch(/resolve/i);
		});
	});

	describe("HIVEBEAR_ALLOW_PRIVATE_TARGETS escape hatch", () => {
		it("allows private IPs when the env var is set", async () => {
			const previous = process.env.HIVEBEAR_ALLOW_PRIVATE_TARGETS;
			process.env.HIVEBEAR_ALLOW_PRIVATE_TARGETS = "1";
			try {
				const result = await defaultGuard.validate("http://10.0.0.5:11434");
				expect(result.ok).toBe(true);
			} finally {
				if (previous === undefined) {
					delete process.env.HIVEBEAR_ALLOW_PRIVATE_TARGETS;
				} else {
					process.env.HIVEBEAR_ALLOW_PRIVATE_TARGETS = previous;
				}
			}
		});
	});

	describe("OllamaProxy constructor (sync literal check)", () => {
		it("succeeds with the default loopback target", () => {
			expect(() => new OllamaProxy()).not.toThrow();
		});

		it("succeeds with an explicit IPv6 loopback target", () => {
			expect(() => new OllamaProxy("http://[::1]:11434")).not.toThrow();
		});

		it("throws on a literal private IPv4 target", () => {
			expect(() => new OllamaProxy("http://10.0.0.5:11434")).toThrow(/private|reserved/i);
		});

		it("throws on the literal metadata endpoint", () => {
			expect(() => new OllamaProxy("http://169.254.169.254/latest/meta-data")).toThrow(
				/private|reserved/i,
			);
		});

		it("allows private targets when allowPrivateTargets is true", () => {
			expect(
				() =>
					new OllamaProxy("http://10.0.0.5:11434", {
						allowPrivateTargets: true,
					}),
			).not.toThrow();
		});

		it("does not throw on hostnames (resolved at request time)", () => {
			expect(() => new OllamaProxy("http://my-public-host.example.com:11434")).not.toThrow();
		});

		it("throws on non-http(s) protocols", () => {
			expect(() => new OllamaProxy("file:///etc/passwd")).toThrow(/protocol/i);
		});
	});

	describe("handler end-to-end", () => {
		function startOllamaMock(handler: http.RequestListener): Promise<{
			port: number;
			close: () => Promise<void>;
		}> {
			return new Promise((resolve) => {
				const server = http.createServer(handler);
				server.listen(0, "127.0.0.1", () => {
					const address = server.address();
					const port = typeof address === "object" && address ? address.port : 0;
					resolve({
						port,
						close: () =>
							new Promise<void>((res, rej) => server.close((err) => (err ? rej(err) : res()))),
					});
				});
			});
		}

		function makeRequest(
			port: number,
			path: string,
		): Promise<{
			status: number;
			body: string;
			requestId: string | null;
		}> {
			return new Promise((resolve, reject) => {
				const req = http.request({ host: "127.0.0.1", port, path, method: "GET" }, (res) => {
					const chunks: Buffer[] = [];
					res.on("data", (c) => chunks.push(c));
					res.on("end", () =>
						resolve({
							status: res.statusCode ?? 0,
							body: Buffer.concat(chunks).toString("utf8"),
							requestId: (res.headers["x-request-id"] as string | undefined) ?? null,
						}),
					);
				});
				req.on("error", reject);
				req.end();
			});
		}

		it("proxies a request to a loopback Ollama mock", async () => {
			const mock = await startOllamaMock((_req, res) => {
				res.statusCode = 200;
				res.setHeader("content-type", "application/json");
				res.end(JSON.stringify({ hello: "ollama" }));
			});
			try {
				const proxy = new OllamaProxy(`http://127.0.0.1:${mock.port}`);
				const handlerServer = http.createServer(proxy.createHandler());
				await new Promise<void>((r) => handlerServer.listen(0, "127.0.0.1", r));
				const addr = handlerServer.address();
				const handlerPort = typeof addr === "object" && addr ? addr.port : 0;
				try {
					const res = await makeRequest(handlerPort, "/api/version");
					expect(res.status).toBe(200);
					expect(JSON.parse(res.body)).toEqual({ hello: "ollama" });
				} finally {
					await new Promise<void>((r) => handlerServer.close(() => r()));
				}
			} finally {
				await mock.close();
			}
		});
	});
});
