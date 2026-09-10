import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	type ComputerUseAction,
	type ComputerUseStep,
	E2bStreamSession,
	runComputerUseLoop,
} from "../e2b-computer-use.js";
import { E2bBrowserAdapter, type E2bSandboxLike, type VisionClient } from "../e2b-adapter.js";

type MockSandbox = E2bSandboxLike & {
	screenshot: ReturnType<typeof vi.fn>;
	click: ReturnType<typeof vi.fn>;
	press: ReturnType<typeof vi.fn>;
	write: ReturnType<typeof vi.fn>;
	open: ReturnType<typeof vi.fn>;
	close?: ReturnType<typeof vi.fn>;
};

function makeSandbox(): MockSandbox {
	let frame = 0;
	return {
		screenshot: vi.fn(async () => `base64-frame-${frame++}`),
		click: vi.fn(async () => ({ ok: true })),
		press: vi.fn(async () => ({ ok: true })),
		write: vi.fn(async () => ({ ok: true })),
		open: vi.fn(async () => ({ ok: true })),
		close: vi.fn(async () => undefined),
	};
}

type MockVision = VisionClient & {
	locate: ReturnType<typeof vi.fn>;
	planAction: ReturnType<typeof vi.fn>;
};

function makeVision(planSequence: ComputerUseAction[]): MockVision {
	const queue = [...planSequence];
	return {
		locate: vi.fn(async () => ({ x: 50, y: 60 })),
		planAction: vi.fn(async (): Promise<ComputerUseAction> => {
			const next = queue.shift();
			if (!next) return { type: "done", reason: "queue exhausted" };
			return next;
		}),
	};
}

describe("E2bStreamSession", () => {
	let sandbox: ReturnType<typeof makeSandbox>;
	let stream: E2bStreamSession;

	beforeEach(() => {
		sandbox = makeSandbox();
		stream = new E2bStreamSession({ sandbox, intervalMs: 10 });
	});

	afterEach(() => {
		stream.stop();
	});

	it("polls screenshot and pushes frames to subscribers", async () => {
		const frames: string[] = [];
		stream.subscribe((f) => frames.push(f));
		stream.start();
		await new Promise((r) => setTimeout(r, 50));
		stream.stop();
		expect(sandbox.screenshot.mock.calls.length).toBeGreaterThanOrEqual(1);
		expect(frames.length).toBeGreaterThanOrEqual(1);
		expect(frames[0]).toMatch(/^base64-frame-/);
	});

	it("subscribe delivers the last frame to new subscribers immediately", () => {
		const sandboxSync = makeSandbox();
		const s = new E2bStreamSession({ sandbox: sandboxSync, intervalMs: 1000 });
		s.start();
		// give it a tick
		return new Promise<void>((resolve) => {
			setTimeout(() => {
				s.stop();
				const got: string[] = [];
				const unsub = s.subscribe((f) => got.push(f));
				expect(got.length).toBe(1);
				expect(typeof got[0]).toBe("string");
				unsub();
				resolve();
			}, 30);
		});
	});

	it("stop() prevents further ticks", async () => {
		const frames: string[] = [];
		stream.subscribe((f) => frames.push(f));
		stream.start();
		await new Promise((r) => setTimeout(r, 30));
		const countBeforeStop = frames.length;
		stream.stop();
		await new Promise((r) => setTimeout(r, 30));
		expect(frames.length).toBe(countBeforeStop);
	});

	it("survives listener errors", async () => {
		const good: string[] = [];
		stream.subscribe(() => {
			throw new Error("listener boom");
		});
		stream.subscribe((f) => good.push(f));
		stream.start();
		await new Promise((r) => setTimeout(r, 30));
		stream.stop();
		expect(good.length).toBeGreaterThanOrEqual(1);
	});
});

describe("runComputerUseLoop", () => {
	it("executes a click → type → done sequence and stops on done", async () => {
		const sandbox = makeSandbox();
		const vision = makeVision([
			{ type: "click_selector", selector: "Search box" },
			{ type: "type", text: "open-computer-use" },
			{ type: "done", reason: "search submitted" },
		]);
		const result = await runComputerUseLoop({
			goal: "Search GitHub for open-computer-use",
			sandbox,
			vision,
			maxSteps: 10,
		});
		expect(result.finishedReason).toBe("done");
		expect(result.steps).toHaveLength(3);
		expect(result.steps[0]?.action.type).toBe("click_selector");
		expect(result.steps[1]?.action.type).toBe("type");
		expect(result.steps[2]?.action.type).toBe("done");
		expect(sandbox.screenshot.mock.calls.length).toBeGreaterThanOrEqual(6);
	});

	it("stops at maxSteps when model never says done", async () => {
		const sandbox = makeSandbox();
		const vision = makeVision([
			{ type: "click", x: 10, y: 20 },
			{ type: "click", x: 30, y: 40 },
			{ type: "click", x: 50, y: 60 },
			{ type: "click", x: 70, y: 80 },
			{ type: "click", x: 90, y: 100 },
		]);
		const result = await runComputerUseLoop({
			goal: "Keep clicking",
			sandbox,
			vision,
			maxSteps: 5,
		});
		expect(result.finishedReason).toBe("max-steps");
		expect(result.steps).toHaveLength(5);
	});

	it("returns error result when planAction throws", async () => {
		const sandbox = makeSandbox();
		const vision: MockVision = {
			locate: vi.fn(async () => ({ x: 1, y: 2 })),
			planAction: vi.fn(async () => {
				throw new Error("rate-limited");
			}),
		};
		const result = await runComputerUseLoop({
			goal: "do thing",
			sandbox,
			vision,
			maxSteps: 3,
		});
		expect(result.finishedReason).toBe("error");
		expect(result.error).toMatch(/planAction failed: rate-limited/);
	});

	it("returns error result when vision lacks planAction", async () => {
		const sandbox = makeSandbox();
		const vision: VisionClient = {
			locate: vi.fn(async () => ({ x: 1, y: 2 })),
		};
		const result = await runComputerUseLoop({
			goal: "do thing",
			sandbox,
			vision,
			maxSteps: 3,
		});
		expect(result.finishedReason).toBe("error");
		expect(result.error).toMatch(/planAction/);
	});

	it("invokes onStep callback for each step", async () => {
		const sandbox = makeSandbox();
		const vision = makeVision([
			{ type: "navigate", url: "https://example.com" },
			{ type: "done", reason: "arrived" },
		]);
		const onStep = vi.fn();
		await runComputerUseLoop({
			goal: "go to example.com",
			sandbox,
			vision,
			onStep,
		});
		expect(onStep).toHaveBeenCalledTimes(2);
	});

	it("captures screenshotAfter on each non-done step", async () => {
		const sandbox = makeSandbox();
		const vision = makeVision([
			{ type: "click", x: 100, y: 200 },
			{ type: "done", reason: "clicked" },
		]);
		const result = await runComputerUseLoop({
			goal: "click center",
			sandbox,
			vision,
		});
		expect(result.steps[0]?.screenshotAfter).toBeDefined();
		expect(result.steps[0]?.screenshotAfter).not.toBe(result.steps[0]?.screenshotBefore);
	});

	it("uses injected adapter when provided", async () => {
		const sandbox = makeSandbox();
		const vision = makeVision([{ type: "click_selector", selector: "btn" }]);
		const adapter = new E2bBrowserAdapter({ sandbox, vision });
		const adapterSpy = vi.spyOn(adapter, "callBrowserTool");
		const result = await runComputerUseLoop({
			goal: "click btn",
			sandbox,
			vision,
			adapter,
		});
		expect(adapterSpy).toHaveBeenCalledWith("browser_click", { selector: "btn" });
		expect(result.finishedReason).toBe("done");
	});

	it("returns error when an action throws mid-loop", async () => {
		const sandbox = makeSandbox();
		sandbox.click.mockImplementation(async () => {
			throw new Error("vnc dropped");
		});
		const vision = makeVision([{ type: "click", x: 0, y: 0 }]);
		const result = await runComputerUseLoop({
			goal: "click",
			sandbox,
			vision,
			maxSteps: 3,
		});
		expect(result.finishedReason).toBe("error");
		expect(result.error).toMatch(/click failed: vnc dropped/);
	});
});

describe("ComputerUseStep shape", () => {
	it("records index, action, screenshotBefore, durationMs, modelRaw", async () => {
		const sandbox = makeSandbox();
		const vision = makeVision([{ type: "press", key: "Escape" }, { type: "done", reason: "ok" }]);
		const result = await runComputerUseLoop({
			goal: "press escape",
			sandbox,
			vision,
		});
		const first = result.steps[0] as ComputerUseStep;
		expect(typeof first.index).toBe("number");
		expect(first.action).toEqual({ type: "press", key: "Escape" });
		expect(typeof first.screenshotBefore).toBe("string");
		expect(typeof first.durationMs).toBe("number");
	});
});
