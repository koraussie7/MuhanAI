import { describe, expect, it, vi } from "vitest";
import { E2bBrowserAdapter, type E2bSandboxLike, type VisionClient } from "../e2b-adapter.js";
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

function makeVision(): VisionClient & { locate: ReturnType<typeof vi.fn> } {
	return {
		locate: vi.fn(async () => ({ x: 100, y: 200 })),
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

	it("throws when browser_click is called without a VisionClient", async () => {
		const sandbox = makeSandbox();
		const adapter = new E2bBrowserAdapter({ sandbox });
		await expect(
			adapter.callBrowserTool("browser_click", { selector: "Submit button" }),
		).rejects.toThrow(/VisionClient/);
	});

	it("browser_click uses vision to ground selector in coordinates", async () => {
		const sandbox = makeSandbox();
		const vision = makeVision();
		const adapter = new E2bBrowserAdapter({ sandbox, vision });
		const result = await adapter.callBrowserTool("browser_click", {
			selector: "Submit button",
		});
		expect(vision.locate).toHaveBeenCalledOnce();
		expect(sandbox.screenshot).toHaveBeenCalled();
		expect(sandbox.click).toHaveBeenCalledWith(100, 200);
		expect(result).toEqual({ x: 100, y: 200, fromVision: true });
	});

	it("browser_click fails when vision cannot locate the element", async () => {
		const sandbox = makeSandbox();
		const vision = makeVision();
		vision.locate.mockResolvedValueOnce(null);
		const adapter = new E2bBrowserAdapter({ sandbox, vision });
		await expect(
			adapter.callBrowserTool("browser_click", { selector: "Invisible thing" }),
		).rejects.toThrow(/could not locate/);
		expect(sandbox.click).not.toHaveBeenCalled();
	});

	it("browser_snapshot returns screenshot + viewport metadata", async () => {
		const sandbox = makeSandbox();
		const adapter = new E2bBrowserAdapter({ sandbox, viewport: { width: 1440, height: 900 } });
		const result = (await adapter.callBrowserTool("browser_snapshot", {})) as {
			format: string;
			viewport: { width: number; height: number };
		};
		expect(result.format).toBe("png");
		expect(result.viewport).toEqual({ width: 1440, height: 900 });
		expect(sandbox.screenshot).toHaveBeenCalled();
	});

	it("browser_evaluate throws — no JS runtime in e2b Desktop", async () => {
		const sandbox = makeSandbox();
		const adapter = new E2bBrowserAdapter({ sandbox });
		await expect(
			adapter.callBrowserTool("browser_evaluate", { expression: "1+1" }),
		).rejects.toThrow(/no embedded JS runtime|browser_type/);
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
		const vision = makeVision();
		const adapter = new E2bBrowserAdapter({ sandbox, vision });
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
		const visionRequired = ["browser_click"];
		for (const capability of visionRequired) {
			expect(map[capability]).toBeDefined();
			const noVision = new E2bBrowserAdapter({ sandbox });
			await expect(
				noVision.callBrowserTool(capability, { selector: "x" }),
			).rejects.toThrow();
		}
		const noMapping = ["browser_select_option", "browser_evaluate"];
		for (const capability of noMapping) {
			expect(map[capability]).toBeDefined();
			await expect(adapter.callBrowserTool(capability, {})).rejects.toThrow();
		}
	});
});
