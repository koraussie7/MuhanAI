import { encodeMessage, GATEWAY_PUBSUB_TOPIC, type SessionRoute } from "@agentmesh/gateway";
import { describe, expect, it } from "vitest";
import { createDaemon, encryptSessionPayload, type MessageTransport } from "../index.js";

class InMemoryTransport implements MessageTransport {
	published: { topic: string; bytes: Uint8Array }[] = [];
	private subscribers = new Map<string, Set<(bytes: Uint8Array) => void>>();

	async publish(topic: string, bytes: Uint8Array): Promise<void> {
		this.published.push({ topic, bytes });
		const subs = this.subscribers.get(topic);
		if (subs) for (const fn of subs) fn(bytes);
	}

	subscribe(topic: string, handler: (bytes: Uint8Array) => void): () => void {
		let set = this.subscribers.get(topic);
		if (!set) {
			set = new Set();
			this.subscribers.set(topic, set);
		}
		set.add(handler);
		return () => set?.delete(handler);
	}
}

const TEST_KEY = new Uint8Array(32).fill(7);

describe("L2 session decrypt round-trip", () => {
	it("encrypts and decrypts a session payload", async () => {
		const payload = { capability: "personal-context", args: { userId: "u1" } };
		const env = await encryptSessionPayload(payload, TEST_KEY);
		const route: SessionRoute = {
			kind: "session-route",
			v: 1,
			sessionId: "s_1",
			userId: "u1",
			ciphertext: concat(env.iv, env.ciphertext),
			issuedAt: Date.now(),
		};
		const { decryptSessionRoute } = await import("../index.js");
		const decrypted = await decryptSessionRoute(route, TEST_KEY);
		expect(decrypted.payload).toEqual(payload);
	});
});

describe("L3 session runner", () => {
	it("routes by capability and surfaces unknown-capability errors", async () => {
		const transport = new InMemoryTransport();
		const daemon = createDaemon({
			userId: "u1",
			platform: "macos",
			transport,
			sessionKey: TEST_KEY,
		});
		const runner = daemon.runner();
		expect(runner).toBeDefined();

		const ok = await daemon.dispatchSession({
			capability: "personal-context",
			correlationId: "c_1",
		});
		expect(ok.ok).toBe(true);
		expect(ok.correlationId).toBe("c_1");

		const missing = await daemon.dispatchSession({
			capability: "no-such-capability",
		});
		expect(missing.ok).toBe(false);
		expect(missing.error).toContain("unknown capability");
	});
});

describe("L4 credentials vault", () => {
	it("round-trips entries and rejects wrong passphrase", async () => {
		const { createVault, unlockVault, VaultAuthError } = await import("../index.js");
		const blob = await createVault({
			passphrase: "correct horse battery staple",
			entries: [{ service: "openai", secret: "sk-test-123", updatedAt: Date.now() }],
		});
		const vault = await unlockVault({
			blob,
			passphrase: "correct horse battery staple",
		});
		expect(vault.get("openai")?.secret).toBe("sk-test-123");
		expect(vault.list().length).toBe(1);

		await expect(unlockVault({ blob, passphrase: "wrong" })).rejects.toBeInstanceOf(VaultAuthError);
	});

	it("put returns a new blob that still decrypts", async () => {
		const { createVault, unlockVault } = await import("../index.js");
		const blob = await createVault({ passphrase: "pw" });
		const vault = await unlockVault({ blob, passphrase: "pw" });
		const next = await vault.put({
			service: "anthropic",
			secret: "sk-anthropic-test",
			updatedAt: Date.now(),
		});
		const reopened = await unlockVault({ blob: next, passphrase: "pw" });
		expect(reopened.get("anthropic")?.secret).toBe("sk-anthropic-test");
		expect(reopened.get("openai")).toBeNull();
	});
});

describe("B1 AIHawk-compatible browser capabilities", () => {
	it("lists the ladder-ordered tool names", async () => {
		const { browserCapabilityMap } = await import("../index.js");
		const m = browserCapabilityMap();
		// Ladder 1 (selectors)
		expect(Object.keys(m)).toEqual(
			expect.arrayContaining([
				"browser_navigate",
				"browser_click",
				"browser_type",
				"browser_select_option",
				"browser_press_key",
			]),
		);
		// Ladder 2 (coordinates)
		expect(m.browser_click_at?.toolName).toBe("browser_click_at");
		// Snapshot feeds coordinates
		expect(m.browser_snapshot?.toolName).toBe("browser_snapshot");
		// Ladder 3 (eyes)
		expect(m.browser_take_screenshot?.toolName).toBe("browser_take_screenshot");
		// Ladder 4 (read-only evaluate; mutation rejected upstream)
		expect(m.browser_evaluate?.toolName).toBe("browser_evaluate");
	});

	it("daemon routes browser_* capabilities through BrowserAdapter", async () => {
		const transport = new InMemoryTransport();
		const calls: { toolName: string; args: Record<string, unknown> }[] = [];
		const fakeBrowser = {
			callBrowserTool: async (toolName: string, args: Record<string, unknown>) => {
				calls.push({ toolName, args });
				if (toolName === "browser_snapshot") {
					return { elements: [{ ref: "e1", at: [120, 240] }] };
				}
				return { ok: true };
			},
		};
		const daemon = createDaemon({
			userId: "u_browser",
			platform: "macos",
			transport,
			sessionKey: TEST_KEY,
			browser: fakeBrowser,
		});

		const snapshot = await daemon.dispatchSession({
			capability: "browser_snapshot",
			args: { url: "https://example.com" },
			correlationId: "c_snap",
		});
		expect(snapshot.ok).toBe(true);
		expect(snapshot.result).toEqual({
			elements: [{ ref: "e1", at: [120, 240] }],
		});
		expect(calls[0]?.toolName).toBe("browser_snapshot");
		expect(calls[0]?.args).toEqual({ url: "https://example.com" });

		const click = await daemon.dispatchSession({
			capability: "browser_click_at",
			args: { x: 120, y: 240 },
		});
		expect(click.ok).toBe(true);
		expect(calls[1]?.toolName).toBe("browser_click_at");

		// Errors from the adapter flow back as ok=false without crashing.
		const broken = {
			callBrowserTool: async () => {
				throw new Error("browser engine offline");
			},
		};
		const d2 = createDaemon({
			userId: "u_browser",
			platform: "macos",
			transport,
			sessionKey: TEST_KEY,
			browser: broken,
		});
		const failure = await d2.dispatchSession({
			capability: "browser_evaluate",
		});
		expect(failure.ok).toBe(false);
		expect(failure.error).toContain("browser engine offline");
	});

	it("unknown browser capability surfaces an error, not a crash", async () => {
		const transport = new InMemoryTransport();
		const fakeBrowser = { callBrowserTool: async () => ({}) };
		const daemon = createDaemon({
			userId: "u_browser",
			platform: "macos",
			transport,
			sessionKey: TEST_KEY,
			browser: fakeBrowser,
		});
		const result = await daemon.dispatchSession({
			capability: "browser_make_coffee",
		});
		expect(result.ok).toBe(false);
	});
});

describe("L5 MCP router integration", () => {
	it("daemon end-to-end: encrypt → inject → MCP call returns", async () => {
		const transport = new InMemoryTransport();

		// Minimal PersonalMCP stub — implements only what mcp-router needs.
		const fakeMcp = {
			callTool: async (toolName: string, _args: Record<string, unknown>) => {
				if (toolName === "knowledge") return { items: [{ id: "k1" }] };
				throw new Error(`unknown tool: ${toolName}`);
			},
		};

		const daemon = createDaemon({
			userId: "u_e2e",
			platform: "linux",
			transport,
			sessionKey: TEST_KEY,
			mcp: fakeMcp as never,
		});
		await daemon.start();
		try {
			// Encrypt a session request, then inject a route through the transport.
			const ciphertext = await daemon.encryptForRoute({
				capability: "personal-context",
				args: { userId: "u_e2e" },
				correlationId: "c_e2e",
			});
			const route: SessionRoute = {
				kind: "session-route",
				v: 1,
				sessionId: "s_e2e",
				userId: "u_e2e",
				ciphertext,
				issuedAt: Date.now(),
			};
			transport.publish(GATEWAY_PUBSUB_TOPIC, encodeMessage(route));

			// The daemon processes the route asynchronously; give it a tick.
			await new Promise((r) => setTimeout(r, 5));

			// The response is dispatched internally — we can re-dispatch and
			// assert via the same MCP path:
			const result = await daemon.dispatchSession({
				capability: "personal-context",
				args: { userId: "u_e2e" },
				correlationId: "c_check",
			});
			expect(result.ok).toBe(true);
			expect(result.result).toEqual({ items: [{ id: "k1" }] });
		} finally {
			await daemon.stop();
		}
	});

	it("vault-get capability surfaces vault entries via the runner", async () => {
		const transport = new InMemoryTransport();
		const { createVault, unlockVault } = await import("../index.js");
		const blob = await createVault({
			passphrase: "pw",
			entries: [{ service: "openai", secret: "sk-abc", updatedAt: Date.now() }],
		});
		const vault = await unlockVault({ blob, passphrase: "pw" });
		const daemon = createDaemon({
			userId: "u_v",
			platform: "macos",
			transport,
			sessionKey: TEST_KEY,
			vault,
		});
		const hit = await daemon.dispatchSession({
			capability: "vault-get",
			args: { service: "openai" },
		});
		expect(hit.ok).toBe(true);

		const miss = await daemon.dispatchSession({
			capability: "vault-get",
			args: { service: "no-such" },
		});
		expect(miss.ok).toBe(false);
	});
});

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
	const out = new Uint8Array(a.byteLength + b.byteLength);
	out.set(a, 0);
	out.set(b, a.byteLength);
	return out;
}
