import { describe, expect, it } from "vitest";
import { isChatRequest, renderChatShell } from "./chat-handler";

describe("isChatRequest", () => {
	it("matches chat.muhanai.com on the document root", () => {
		expect(isChatRequest("chat.muhanai.com", "/")).toBe(true);
		expect(isChatRequest("chat.muhanai.com", "")).toBe(true);
		expect(isChatRequest("chat.muhanai.com", "/index.html")).toBe(true);
	});

	it("passes through sub-paths on chat.muhanai.com", () => {
		// /api/llm/chat and /assets/* must reach the parent Worker chain.
		expect(isChatRequest("chat.muhanai.com", "/api/llm/chat")).toBe(false);
		expect(isChatRequest("chat.muhanai.com", "/assets/main.js")).toBe(false);
	});

	it("never matches other hostnames", () => {
		expect(isChatRequest("blog.muhanai.com", "/")).toBe(false);
		expect(isChatRequest("muhanai.com", "/")).toBe(false);
		expect(isChatRequest("localhost", "/")).toBe(false);
	});
});

describe("renderChatShell", () => {
	it("renders the chat shell HTML with the request's origin", async () => {
		const request = new Request("https://chat.muhanai.com/");
		const response = renderChatShell(request);
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
		const html = await response.text();
		expect(html).toContain("<title>chat.muhanai.com — Bitterbot</title>");
		expect(html).toContain('id="root"');
		expect(html).toContain("/assets/chat.js");
		// Asset base must be the request origin so the entry script loads
		// from the same host (no cross-origin dev trap).
		expect(html).toContain('src="https://chat.muhanai.com/assets/chat.js"');
	});

	it("honors an explicit assetBase override (used by tests)", async () => {
		const request = new Request("https://chat.muhanai.com/");
		const response = renderChatShell(request, { assetBase: "https://cdn.test" });
		const html = await response.text();
		expect(html).toContain('src="https://cdn.test/assets/chat.js"');
	});

	it("sets a CSP that allows ws/wss for OpenHydra peer discovery", async () => {
		const request = new Request("https://chat.muhanai.com/");
		const response = renderChatShell(request);
		const csp = response.headers.get("content-security-policy");
		expect(csp).toBeTruthy();
		expect(csp).toContain("ws:");
		expect(csp).toContain("wss:");
		// No external CDN — the bundle is served from this host.
		expect(csp).not.toContain("cdn.jsdelivr");
		expect(csp).not.toContain("cdnjs");
	});

	it("defaults cache-control to no-cache so updates ship immediately", async () => {
		const request = new Request("https://chat.muhanai.com/");
		const response = renderChatShell(request);
		expect(response.headers.get("cache-control")).toBe("no-cache");
	});

	it("accepts a custom cache-control override", async () => {
		const request = new Request("https://chat.muhanai.com/");
		const response = renderChatShell(request, { cacheControl: "public, max-age=60" });
		expect(response.headers.get("cache-control")).toBe("public, max-age=60");
	});
});
