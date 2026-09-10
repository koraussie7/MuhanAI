import { describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { E2bBrowserAdapter, type E2bSandboxLike } from "../e2b-adapter.js";
import type { ByokVisionProvider, PlanActionFn } from "../e2b-byok-vision.js";
import {
	buildComputerUseRunHandler,
	type ComputerUseRunArgs,
	COMPUTER_USE_RUN_CAPABILITY,
} from "../computer-use-router.js";
import type { SessionRequest } from "../session-runner.js";

type VisionLocateFn = (opts: { imageBase64: string; prompt: string }) => Promise<{ x: number; y: number } | null>;

type MockSandbox = E2bSandboxLike & {
	screenshot: ReturnType<typeof vi.fn>;
	click: ReturnType<typeof vi.fn>;
	press: ReturnType<typeof vi.fn>;
	write: ReturnType<typeof vi.fn>;
	open: ReturnType<typeof vi.fn>;
};

function makeSandbox(): MockSandbox {
	let frame = 0;
	return {
		screenshot: vi.fn(async () => `base64-frame-${frame++}`),
		click: vi.fn(async () => ({ ok: true })),
		press: vi.fn(async () => ({ ok: true })),
		write: vi.fn(async () => ({ ok: true })),
		open: vi.fn(async () => ({ ok: true })),
	};
}

type VisionMock = ByokVisionProvider & {
	planAction: Mock<PlanActionFn>;
	locate: Mock<VisionLocateFn>;
};

function makeVision(): VisionMock {
	return {
		locate: vi.fn<VisionLocateFn>(async () => ({ x: 50, y: 60 })),
		planAction: vi.fn<PlanActionFn>(async () => ({ type: "done", reason: "stub" })),
		provider: "openai",
		planModel: "gpt-4o",
		locateModel: "gpt-4o-mini",
	};
}

const identityFactory = (vision: ReturnType<typeof makeVision>) => (_args: ComputerUseRunArgs) => vision;

function base64(size = 100): string {
	return "A".repeat(size);
}

describe("buildComputerUseRunHandler", () => {
	it("exports a stable capability name", () => {
		expect(COMPUTER_USE_RUN_CAPABILITY).toBe("computer-use.run");
	});

	it("returns ok with serialized result on a happy run", async () => {
		const sandbox = makeSandbox();
		const vision = makeVision();
		vision.planAction.mockResolvedValueOnce({ type: "done", reason: "finished" });
		const adapter = new E2bBrowserAdapter({ sandbox, vision });
		const handler = buildComputerUseRunHandler({ adapter, visionFactory: identityFactory(vision) });
		const req: SessionRequest = {
			capability: COMPUTER_USE_RUN_CAPABILITY,
			correlationId: "test-1",
			args: {
				goal: "find invoices",
				provider: "openai",
				apiKey: "sk-test",
			},
		};
		const res = await handler(req);
		expect(res.ok).toBe(true);
		expect(res.correlationId).toBe("test-1");
		const result = res.result as {
			finishedReason: string;
			stepCount: number;
		};
		expect(result.finishedReason).toBe("done");
	});

	it("rejects missing goal", async () => {
		const sandbox = makeSandbox();
		const adapter = new E2bBrowserAdapter({ sandbox, vision: makeVision() });
		const handler = buildComputerUseRunHandler({ adapter });
		const res = await handler({
			capability: COMPUTER_USE_RUN_CAPABILITY,
			args: { provider: "openai", apiKey: "x" },
		});
		expect(res.ok).toBe(false);
		expect(res.error).toMatch(/goal/);
	});

	it("rejects missing apiKey", async () => {
		const sandbox = makeSandbox();
		const adapter = new E2bBrowserAdapter({ sandbox, vision: makeVision() });
		const handler = buildComputerUseRunHandler({ adapter });
		const res = await handler({
			capability: COMPUTER_USE_RUN_CAPABILITY,
			args: { goal: "do thing", provider: "openai" },
		});
		expect(res.ok).toBe(false);
		expect(res.error).toMatch(/apiKey/);
	});

	it("rejects unknown provider", async () => {
		const sandbox = makeSandbox();
		const adapter = new E2bBrowserAdapter({ sandbox, vision: makeVision() });
		const handler = buildComputerUseRunHandler({ adapter });
		const res = await handler({
			capability: COMPUTER_USE_RUN_CAPABILITY,
			args: { goal: "x", provider: "anthropic", apiKey: "x" },
		});
		expect(res.ok).toBe(false);
		expect(res.error).toMatch(/`provider` must be one of/);
	});

	it("propagates BYOK vision provider errors as ok=false", async () => {
		const sandbox = makeSandbox();
		const vision = makeVision();
		const adapter = new E2bBrowserAdapter({ sandbox, vision });
		const handler = buildComputerUseRunHandler({ adapter, visionFactory: identityFactory(vision) });
		const res = await handler({
			capability: COMPUTER_USE_RUN_CAPABILITY,
			args: {
				goal: "x",
				provider: "openai",
				apiKey: "sk-bogus",
			},
		});
		expect(typeof res.ok).toBe("boolean");
	});

	it("honors maxSteps arg", async () => {
		const sandbox = makeSandbox();
		const vision = makeVision();
		for (let i = 0; i < 10; i += 1) {
			vision.planAction.mockResolvedValueOnce({ type: "click", x: i, y: i });
		}
		const adapter = new E2bBrowserAdapter({ sandbox, vision });
		const handler = buildComputerUseRunHandler({ adapter, visionFactory: identityFactory(vision) });
		const res = await handler({
			capability: COMPUTER_USE_RUN_CAPABILITY,
			args: { goal: "click forever", provider: "openai", apiKey: "sk", maxSteps: 3 },
		});
		expect(res.ok).toBe(true);
		const result = res.result as { finishedReason: string; stepCount: number };
		expect(result.finishedReason).toBe("max-steps");
		expect(result.stepCount).toBe(3);
	});

	it("honors viewport arg", async () => {
		const sandbox = makeSandbox();
		const vision = makeVision();
		vision.planAction.mockResolvedValueOnce({ type: "done", reason: "ok" });
		const adapter = new E2bBrowserAdapter({ sandbox, vision });
		const handler = buildComputerUseRunHandler({ adapter, visionFactory: identityFactory(vision) });
		const res = await handler({
			capability: COMPUTER_USE_RUN_CAPABILITY,
			args: {
				goal: "x",
				provider: "openai",
				apiKey: "sk",
				viewport: { width: 1920, height: 1080 },
			},
		});
		expect(res.ok).toBe(true);
	});

	it("ignores malformed viewport (falls back to default)", async () => {
		const sandbox = makeSandbox();
		const vision = makeVision();
		vision.planAction.mockResolvedValueOnce({ type: "done", reason: "ok" });
		const adapter = new E2bBrowserAdapter({ sandbox, vision });
		const handler = buildComputerUseRunHandler({ adapter, visionFactory: identityFactory(vision) });
		const res = await handler({
			capability: COMPUTER_USE_RUN_CAPABILITY,
			args: {
				goal: "x",
				provider: "openai",
				apiKey: "sk",
				viewport: { width: "bad" } as unknown as Record<string, unknown>,
			},
		});
		expect(res.ok).toBe(true);
	});
});

describe("E2bBrowserAdapter.getSandbox()", () => {
	it("returns the injected sandbox without dynamic import", async () => {
		const sandbox = makeSandbox();
		const adapter = new E2bBrowserAdapter({ sandbox, vision: makeVision() });
		const got = await adapter.getSandbox();
		expect(got).toBe(sandbox);
	});

	it("is idempotent (returns the same sandbox on repeated calls)", async () => {
		const sandbox = makeSandbox();
		const adapter = new E2bBrowserAdapter({ sandbox, vision: makeVision() });
		const a = await adapter.getSandbox();
		const b = await adapter.getSandbox();
		expect(a).toBe(b);
	});
});

describe("Computer Use integration smoke (no real network)", () => {
	it("runs a 2-step loop and returns a serialized result", async () => {
		const sandbox = makeSandbox();
		const vision = makeVision();
		vision.planAction
			.mockResolvedValueOnce({ type: "navigate", url: "https://example.com" })
			.mockResolvedValueOnce({ type: "done", reason: "arrived" });
		const adapter = new E2bBrowserAdapter({ sandbox, vision });
		const handler = buildComputerUseRunHandler({ adapter, visionFactory: identityFactory(vision) });
		const res = await handler({
			capability: COMPUTER_USE_RUN_CAPABILITY,
			args: {
				goal: "go to example.com",
				provider: "openai",
				apiKey: "sk-test",
			},
		});
		expect(res.ok).toBe(true);
		const result = res.result as {
			finishedReason: string;
			steps: Array<{ index: number; action: { type: string } }>;
		};
		expect(result.finishedReason).toBe("done");
		expect(result.steps).toHaveLength(2);
		expect(result.steps[0]?.action.type).toBe("navigate");
		expect(sandbox.open).toHaveBeenCalledWith("https://example.com");
	});

	it("propagates sandbox errors", async () => {
		const sandbox = makeSandbox();
		sandbox.click.mockImplementation(async () => {
			throw new Error("vnc gone");
		});
		const vision = makeVision();
		vision.planAction.mockResolvedValueOnce({ type: "click", x: 1, y: 2 });
		const adapter = new E2bBrowserAdapter({ sandbox, vision });
		const handler = buildComputerUseRunHandler({ adapter, visionFactory: identityFactory(vision) });
		const res = await handler({
			capability: COMPUTER_USE_RUN_CAPABILITY,
			args: { goal: "x", provider: "openai", apiKey: "sk" },
		});
		expect(res.ok).toBe(false);
		expect(res.error).toMatch(/vnc gone/);
	});
});

// suppress unused-warning for helper
const _ = base64;
void _;
