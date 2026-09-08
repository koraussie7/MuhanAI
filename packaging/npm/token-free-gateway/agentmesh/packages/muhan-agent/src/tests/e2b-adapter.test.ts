import { describe, expect, it, vi } from "vitest";
import { E2bBrowserAdapter, type E2bSandboxLike } from "../e2b-adapter.js";
import { browserCapabilityMap } from "../mcp-router.js";

function makeSandbox(): E2bSandboxLike & { [key: string]: ReturnType<typeof vi.fn> } {
	return {
		screenshot: vi.fn(async () => "base64-png-bytes"),
		click: vi.fn(async () => ({ ok: true })),
		press: vi.fn(async () => ({ ok: true })),
		write: vi.fn(async () => ({ ok: true })),
		open: vi.fn(async () => ({ ok: true })),
		close: vi.fn(async () => undefined),
	};
}

describe("E2bBrowserAdapter — Phase 1 shape", () => {
	it("forwards browser_navigate → sandbox.open", async () => {
		const sandbox = makeSandbox();
		const adapter = new E2bBrowserAdapter({ sandbox });
		await adapter.callBrowserTool("browser_navigate", { url: "https://example.com" });
		expect(sandbox.open).toHaveBeenCalledWith("https://example.com");
	});

	it("forwards browser_click_at → sandbox.click(x, y)", async () => {
		const sandbox = makeSandbox();
		const adapter = new E2bBrowserAdapter({ sandbox });
		await adapter.callBrowserTool("browser_click_at", { x: 120, y: 240 });
		expect(sandbox.click).toHaveBeenCalledWith(120, 240);
	});

	it("forwards browser_press_key → sandbox.press", async () => {
		const sandbox = makeSandbox();
		const adapter = new E2bBrowserAdapter({ sandbox });
		await adapter.callBrowserTool("browser_press_key", { key: "Enter" });
		expect(sandbox.press).toHaveBeenCalledWith("Enter");
	});

	it("forwards browser_type → sandbox.write", async () => {
		const sandbox = makeSandbox();
		const adapter = new E2bBrowserAdapter({ sandbox });
		await adapter.callBrowserTool("browser_type", { text: "hello world" });
		expect(sandbox.write).toHaveBeenCalledWith("hello world");
	});

	it("forwards browser_take_screenshot → sandbox.screenshot", async () => {
		const sandbox = makeSandbox();
		const adapter = new E2bBrowserAdapter({ sandbox });
		const result = await adapter.callBrowserTool("browser_take_screenshot", {});
		expect(sandbox.screenshot).toHaveBeenCalledOnce();
		expect(result).toBe("base64-png-bytes");
	});

	it("throws for non-AIHawk tool names without touching sandbox", async () => {
		const sandbox = makeSandbox();
		const adapter = new E2bBrowserAdapter({ sandbox });
		await expect(adapter.callBrowserTool("browser_make_coffee", {})).rejects.toThrow(
			/unknown AIHawk tool/,
		);
		expect(sandbox.click).not.toHaveBeenCalled();
		expect(sandbox.open).not.toHaveBeenCalled();
	});

	it("throws Phase-2-marker for capabilities lacking a 1:1 e2b mapping", async () => {
		const sandbox = makeSandbox();
		const adapter = new E2bBrowserAdapter({ sandbox });
		for (const toolName of ["browser_click", "browser_snapshot", "browser_evaluate"]) {
			await expect(adapter.callBrowserTool(toolName, {})).rejects.toThrow(/Phase 2/);
			await expect(adapter.callBrowserTool(toolName, {})).rejects.toThrow(toolName);
		}
	});

	it("throws for browser_select_option (no e2b Desktop equivalent)", async () => {
		const sandbox = makeSandbox();
		const adapter = new E2bBrowserAdapter({ sandbox });
		await expect(
			adapter.callBrowserTool("browser_select_option", { selector: "x", value: "y" }),
		).rejects.toThrow(/no e2b Desktop equivalent/);
	});

	it("rejects malformed args before calling sandbox", async () => {
		const sandbox = makeSandbox();
		const adapter = new E2bBrowserAdapter({ sandbox });
		await expect(adapter.callBrowserTool("browser_navigate", { url: "" })).rejects.toThrow(
			/non-empty string/,
		);
		await expect(
			adapter.callBrowserTool("browser_navigate", { url: 42 as unknown as string }),
		).rejects.toThrow(/non-empty string/);
		await expect(adapter.callBrowserTool("browser_click_at", { x: NaN, y: 0 })).rejects.toThrow(
			/finite number/,
		);
		expect(sandbox.open).not.toHaveBeenCalled();
		expect(sandbox.click).not.toHaveBeenCalled();
	});

	it("wraps sandbox errors with the tool name", async () => {
		const sandbox = makeSandbox();
		sandbox.open = vi.fn(async () => {
			throw new Error("connection reset");
		});
		const adapter = new E2bBrowserAdapter({ sandbox });
		await expect(
			adapter.callBrowserTool("browser_navigate", { url: "https://x.test" }),
		).rejects.toThrow(/browser_navigate failed: connection reset/);
	});

	it("reports missing API key without importing e2b", async () => {
		const prevKey = process.env.E2B_API_KEY;
		const prevTpl = process.env.E2B_DESKTOP_TEMPLATE;
		delete process.env.E2B_API_KEY;
		delete process.env.E2B_DESKTOP_TEMPLATE;
		try {
			const adapter = new E2bBrowserAdapter({});
			await expect(
				adapter.callBrowserTool("browser_navigate", { url: "https://x" }),
			).rejects.toThrow(/missing E2B_API_KEY/);
		} finally {
			if (prevKey !== undefined) process.env.E2B_API_KEY = prevKey;
			if (prevTpl !== undefined) process.env.E2B_DESKTOP_TEMPLATE = prevTpl;
		}
	});

	it("close() invokes the injected sandbox.close", async () => {
		const sandbox = makeSandbox();
		const adapter = new E2bBrowserAdapter({ sandbox });
		await adapter.close();
		expect(sandbox.close).toHaveBeenCalledOnce();
	});

	it("close() is a no-op when sandbox has no close method", async () => {
		const partial: E2bSandboxLike = {
			screenshot: async () => "x",
			click: async () => undefined,
			press: async () => undefined,
			write: async () => undefined,
			open: async () => undefined,
		};
		const adapter = new E2bBrowserAdapter({ sandbox: partial });
		await expect(adapter.close()).resolves.toBeUndefined();
	});

	it("covers every capability declared in browserCapabilityMap", async () => {
		const map = browserCapabilityMap();
		const sandbox = makeSandbox();
		const adapter = new E2bBrowserAdapter({ sandbox });
		const oneToOne: Array<{ capability: string; args: Record<string, unknown> }> = [
			{ capability: "browser_navigate", args: { url: "https://x.test" } },
			{ capability: "browser_click_at", args: { x: 0, y: 0 } },
			{ capability: "browser_press_key", args: { key: "Escape" } },
			{ capability: "browser_type", args: { text: "abc" } },
			{ capability: "browser_take_screenshot", args: {} },
		];
		for (const { capability, args } of oneToOne) {
			expect(map[capability]).toBeDefined();
			await expect(adapter.callBrowserTool(capability, args)).resolves.toBeDefined();
		}
		const phase2Only = [
			"browser_click",
			"browser_select_option",
			"browser_snapshot",
			"browser_evaluate",
		];
		for (const capability of phase2Only) {
			expect(map[capability]).toBeDefined();
			await expect(adapter.callBrowserTool(capability, {})).rejects.toThrow();
		}
	});
});
